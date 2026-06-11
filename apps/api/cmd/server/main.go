// Command server starts the seat-layout HTTP API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/akshat/seats/api/internal/config"
	"github.com/akshat/seats/api/internal/handler"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/store/postgres"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	if err := run(log); err != nil {
		log.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// Create the database handle. sql.Open connects lazily, so this does not
	// fail on a transient outage; readiness pings it live. We probe once at
	// startup only to log a warning; routes are always wired so the API recovers
	// without a restart when the database comes up later.
	db, err := postgres.New(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	stores := postgres.NewStores(db)

	// Sweep expired holds in the background; 10s bounds how long a lapsed hold
	// can keep seats unavailable (default hold TTL is 300s).
	sweepCtx, stopSweep := context.WithCancel(context.Background())
	defer stopSweep()
	go sweepHolds(sweepCtx, log, stores.Bookings, 10*time.Second)

	mux := http.NewServeMux()
	handler.NewHealth(db).Register(mux)

	pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		log.Warn("database not reachable at startup; API will return errors until it comes up (readiness reports not-ready)", "err", err.Error())
	}
	cancel()
	registerAPIRoutes(mux, stores, log)

	// Fall back to a JSON 404 for unmatched routes.
	mux.Handle("/", httpx.NotFoundHandler())

	root := httpx.Wrap(mux, cfg, log, nil /* authenticator wired later */)

	srv := &http.Server{
		Addr:         cfg.Addr(),
		Handler:      root,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	}

	serverErr := make(chan error, 1)
	go func() {
		log.Info("server listening", "addr", cfg.Addr(), "auth_enabled", cfg.AuthEnabled)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		return err
	case sig := <-stop:
		log.Info("shutdown signal received", "signal", sig.String())
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed; forcing close", "err", err)
		_ = srv.Close()
		return err
	}
	log.Info("server stopped cleanly")
	return nil
}
