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
	// startup only to log a warning and to decide whether to wire API routes
	// now (they require a reachable DB). This keeps the server resilient to
	// database/app startup ordering.
	db, err := postgres.New(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	mux := http.NewServeMux()
	handler.NewHealth(db).Register(mux)

	pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	dbReachable := db.PingContext(pingCtx) == nil
	cancel()
	if dbReachable {
		registerAPIRoutes(mux, db, log)
	} else {
		log.Warn("database not reachable at startup; serving health probes only (readiness will report not-ready)")
	}

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
