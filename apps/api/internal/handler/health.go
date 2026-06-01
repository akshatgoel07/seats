package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/akshat/seats/api/internal/httpx"
)

// Pinger reports whether a downstream dependency (the database) is reachable.
type Pinger interface {
	PingContext(ctx context.Context) error
}

// Health serves liveness and readiness probes.
type Health struct {
	db Pinger
}

// NewHealth creates a Health handler. db may be nil (readiness then only
// reflects process liveness).
func NewHealth(db Pinger) *Health {
	return &Health{db: db}
}

// Register wires the health routes onto mux.
func (h *Health) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.live)
	mux.HandleFunc("GET /readyz", h.ready)
}

// live reports that the process is up.
func (h *Health) live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ready reports that the process can serve traffic (DB reachable).
func (h *Health) ready(w http.ResponseWriter, r *http.Request) {
	if h.db != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := h.db.PingContext(ctx); err != nil {
			httpx.WriteError(w, r, httpx.NewAPIError(http.StatusServiceUnavailable, "not_ready", "database unavailable"))
			return
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
