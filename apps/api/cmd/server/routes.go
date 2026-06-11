package main

import (
	"log/slog"
	"net/http"

	"github.com/akshat/seats/api/internal/handler"
	"github.com/akshat/seats/api/internal/service"
	"github.com/akshat/seats/api/internal/store"
)

// registerAPIRoutes wires the data-backed /v1 API onto mux. It builds the
// business layer (services) and registers the HTTP handlers. Kept separate
// from main so the wiring is easy to read.
func registerAPIRoutes(mux *http.ServeMux, stores store.Stores, log *slog.Logger) {
	svcs := service.New(stores)
	handler.RegisterV1(mux, svcs, log)
}
