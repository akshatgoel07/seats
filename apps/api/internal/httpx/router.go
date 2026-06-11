package httpx

import (
	"log/slog"
	"net/http"

	"github.com/akshat/seats/api/internal/config"
)

// Wrap applies the global middleware chain to a handler (typically the root
// mux). Order: RequestID -> Recover -> Logger -> Gzip -> CORS -> RateLimit ->
// Auth. Gzip sits just inside Logger so the logged byte count is the compressed
// wire size. Auth is currently a no-op (see config.AuthEnabled).
func Wrap(h http.Handler, cfg config.Config, log *slog.Logger, authn Authenticator) http.Handler {
	return Chain(h,
		RequestID(),
		Recover(log),
		Logger(log),
		Gzip(),
		CORS(cfg.CORSOrigins),
		RateLimit(cfg.RateLimitRPS, cfg.RateLimitBurst),
		Auth(cfg.AuthEnabled, authn),
	)
}

// NotFoundHandler returns a JSON 404 for unmatched routes, keeping the error
// envelope consistent instead of net/http's plain-text default.
func NotFoundHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, r, ErrNotFound("route not found: "+r.Method+" "+r.URL.Path))
	})
}
