package httpx

import (
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"net"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Middleware wraps an http.Handler with cross-cutting behavior.
type Middleware func(http.Handler) http.Handler

// Chain applies middlewares so the first listed runs outermost (first on the
// way in, last on the way out).
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

type ctxKey int

const requestIDKey ctxKey = iota

// RequestIDFrom returns the request ID stored in ctx, if any.
func RequestIDFrom(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

// RequestID assigns a unique ID to each request (honoring an inbound
// X-Request-ID) and exposes it on the context and response header.
func RequestID() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")
			if id == "" {
				id = newRequestID()
			}
			w.Header().Set("X-Request-ID", id)
			ctx := context.WithValue(r.Context(), requestIDKey, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func newRequestID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b[:])
}

// statusRecorder captures the status code for logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// Logger logs one structured line per request after it completes.
func Logger(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			log.LogAttrs(r.Context(), slog.LevelInfo, "http_request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", rec.status),
				slog.Int("bytes", rec.bytes),
				slog.Duration("duration", time.Since(start)),
				slog.String("request_id", RequestIDFrom(r.Context())),
				slog.String("remote", clientIP(r)),
			)
		})
	}
}

// Recover converts panics into a 500 response instead of crashing the server.
func Recover(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.ErrorContext(r.Context(), "panic recovered",
						slog.Any("panic", rec),
						slog.String("path", r.URL.Path),
						slog.String("request_id", RequestIDFrom(r.Context())),
					)
					WriteError(w, r, ErrInternal())
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// CORS handles preflight and sets CORS headers for the configured origins.
// An origins list containing "*" allows any origin.
func CORS(origins []string) Middleware {
	allowAll := slices.Contains(origins, "*")
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (allowAll || slices.Contains(origins, origin)) {
				if allowAll {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID, X-API-Key")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// rateLimiter is a per-client-IP token bucket. It is safe for concurrent use.
type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rps     float64
	burst   float64
	now     func() time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// RateLimit limits requests per second per client IP using a token bucket.
// rps <= 0 disables limiting. burst is the maximum burst size.
func RateLimit(rps float64, burst int) Middleware {
	if rps <= 0 {
		return func(next http.Handler) http.Handler { return next }
	}
	rl := &rateLimiter{
		buckets: make(map[string]*bucket),
		rps:     rps,
		burst:   float64(burst),
		now:     time.Now,
	}
	// Periodically evict idle buckets to bound memory.
	go rl.gc()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !rl.allow(clientIP(r)) {
				w.Header().Set("Retry-After", "1")
				WriteError(w, r, NewAPIError(http.StatusTooManyRequests, "rate_limited", "too many requests"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := rl.now()
	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: rl.burst - 1, last: now}
		return true
	}
	// Refill based on elapsed time.
	elapsed := now.Sub(b.last).Seconds()
	b.tokens = min(rl.burst, b.tokens+elapsed*rl.rps)
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *rateLimiter) gc() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		cutoff := rl.now().Add(-5 * time.Minute)
		for k, b := range rl.buckets {
			if b.last.Before(cutoff) {
				delete(rl.buckets, k)
			}
		}
		rl.mu.Unlock()
	}
}

// Authenticator decides whether a request is allowed. Implementations will be
// added later (API keys, Google OAuth). The interface exists now so the
// middleware wiring is stable.
type Authenticator interface {
	Authenticate(r *http.Request) error
}

// Auth enforces authentication when enabled and an authenticator is provided.
// With enabled=false (the current default) it is a pass-through no-op.
func Auth(enabled bool, authn Authenticator) Middleware {
	return func(next http.Handler) http.Handler {
		if !enabled || authn == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if err := authn.Authenticate(r); err != nil {
				WriteError(w, r, err)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// gzipMinSize is the smallest body we bother compressing; below it the gzip
// framing overhead isn't worth the CPU (covers errors, 304/204, tiny lists).
const gzipMinSize = 1024

// gzipPool reuses gzip.Writers (BestSpeed: ~50-150 MB/s/core, far cheaper than
// the network transfer it removes) to avoid a per-request allocation.
var gzipPool = sync.Pool{
	New: func() any {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
		return w
	},
}

// Gzip compresses JSON responses for clients that accept gzip. Large seat/scene
// payloads are highly repetitive and shrink ~9x, which is the dominant lever for
// keeping multi-MB responses under a latency budget on real networks.
//
// It defers WriteHeader until the first body bytes so the decision (and the
// Content-Encoding header) can be made once the body size/type is known.
func Gzip() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
				next.ServeHTTP(w, r)
				return
			}
			gw := &gzipResponseWriter{ResponseWriter: w, minSize: gzipMinSize}
			defer gw.finalize()
			next.ServeHTTP(gw, r)
		})
	}
}

type gzipResponseWriter struct {
	http.ResponseWriter
	minSize       int
	status        int
	headerWritten bool
	decided       bool
	gz            *gzip.Writer
	buf           []byte
}

func (g *gzipResponseWriter) WriteHeader(status int) {
	// Deferred: we set Content-Encoding (and call the real WriteHeader) only
	// once we know whether the body will be compressed.
	g.status = status
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	if g.decided {
		if g.gz != nil {
			return g.gz.Write(b)
		}
		return g.ResponseWriter.Write(b)
	}
	// Fast path: a single large write (our typical full-payload Write) is
	// compressed directly without an intermediate copy.
	if len(g.buf) == 0 && len(b) >= g.minSize {
		g.decideAndWrite(b)
		return len(b), nil
	}
	g.buf = append(g.buf, b...)
	if len(g.buf) >= g.minSize {
		first := g.buf
		g.buf = nil
		g.decideAndWrite(first)
	}
	return len(b), nil
}

func (g *gzipResponseWriter) decideAndWrite(first []byte) {
	g.decided = true
	if strings.Contains(g.Header().Get("Content-Type"), "application/json") {
		g.Header().Set("Content-Encoding", "gzip")
		addVary(g.Header(), "Accept-Encoding")
		g.Header().Del("Content-Length")
		g.writeStatus()
		gz := gzipPool.Get().(*gzip.Writer)
		gz.Reset(g.ResponseWriter)
		g.gz = gz
		_, _ = g.gz.Write(first)
		return
	}
	g.writeStatus()
	_, _ = g.ResponseWriter.Write(first)
}

func (g *gzipResponseWriter) writeStatus() {
	if g.headerWritten {
		return
	}
	g.headerWritten = true
	if g.status == 0 {
		g.status = http.StatusOK
	}
	g.ResponseWriter.WriteHeader(g.status)
}

// finalize flushes a sub-threshold body uncompressed and closes the gzip writer.
func (g *gzipResponseWriter) finalize() {
	if !g.decided {
		g.decided = true
		g.writeStatus()
		if len(g.buf) > 0 {
			_, _ = g.ResponseWriter.Write(g.buf)
			g.buf = nil
		}
		return
	}
	if g.gz != nil {
		_ = g.gz.Close()
		gzipPool.Put(g.gz)
		g.gz = nil
	}
}

// Flush implements http.Flusher. A Flush forces the compress/no-compress
// decision with whatever has been written so far; otherwise sub-threshold bytes
// would sit in g.buf until the handler returned.
func (g *gzipResponseWriter) Flush() {
	if !g.decided {
		first := g.buf
		g.buf = nil
		if len(first) > 0 {
			g.decideAndWrite(first)
		} else {
			g.decided = true
			g.writeStatus()
		}
	}
	if g.gz != nil {
		_ = g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// clientIP extracts the best-effort client IP, honoring X-Forwarded-For.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// First entry is the original client.
		if idx := strings.IndexByte(xff, ','); idx >= 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
