package httpx

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWriteJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	WriteJSON(rr, http.StatusCreated, map[string]string{"hello": "world"})

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusCreated)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type = %q, want application/json", ct)
	}
	var got struct {
		Data map[string]string `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.Data["hello"] != "world" {
		t.Errorf("data.hello = %q, want world", got.Data["hello"])
	}
}

func TestWriteError_APIError(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	WriteError(rr, req, ErrNotFound("nope"))

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
	var got struct {
		Error APIError `json:"error"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.Error.Code != "not_found" || got.Error.Message != "nope" {
		t.Errorf("error = %+v, want not_found/nope", got.Error)
	}
}

func TestWriteError_UnknownBecomes500(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	WriteError(rr, req, io.ErrUnexpectedEOF)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rr.Code)
	}
	if strings.Contains(rr.Body.String(), "unexpected EOF") {
		t.Error("internal error message leaked to client")
	}
}

func TestDecodeJSON_RejectsUnknownFields(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"a":1,"b":2}`))
	var dst struct {
		A int `json:"a"`
	}
	err := DecodeJSON(req, &dst)
	if err == nil {
		t.Fatal("expected error for unknown field, got nil")
	}
	if apiErr, ok := asAPIError(err); !ok || apiErr.Status != http.StatusBadRequest {
		t.Errorf("err = %v, want 400 APIError", err)
	}
}

func TestCORS_AllowedOrigin(t *testing.T) {
	h := CORS([]string{"http://allowed.com"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Origin", "http://allowed.com")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "http://allowed.com" {
		t.Errorf("allow-origin = %q, want http://allowed.com", got)
	}
}

func TestCORS_PreflightShortCircuits(t *testing.T) {
	called := false
	h := CORS([]string{"*"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	req := httptest.NewRequest(http.MethodOptions, "/x", nil)
	req.Header.Set("Origin", "http://any.com")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rr.Code)
	}
	if called {
		t.Error("next handler should not be called for OPTIONS preflight")
	}
}

func TestRecover(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := Recover(log)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rr.Code)
	}
}

func TestRateLimit(t *testing.T) {
	// Build a limiter with a controllable clock: 1 rps, burst 2.
	rl := &rateLimiter{
		buckets: make(map[string]*bucket),
		rps:     1,
		burst:   2,
		now:     func() time.Time { return time.Unix(0, 0) },
	}
	// burst=2 -> first two allowed, third denied (clock frozen, no refill).
	if !rl.allow("ip") {
		t.Fatal("request 1 should be allowed")
	}
	if !rl.allow("ip") {
		t.Fatal("request 2 should be allowed (burst)")
	}
	if rl.allow("ip") {
		t.Fatal("request 3 should be denied")
	}
}

func TestAuth_DisabledIsNoop(t *testing.T) {
	called := false
	h := Auth(false, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if !called || rr.Code != http.StatusOK {
		t.Error("auth disabled should pass through")
	}
}

func TestRequestID_SetsHeader(t *testing.T) {
	h := RequestID()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if RequestIDFrom(r.Context()) == "" {
			t.Error("request id not in context")
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Header().Get("X-Request-ID") == "" {
		t.Error("X-Request-ID header not set")
	}
}
