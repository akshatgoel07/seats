package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// envelope is the standard success wrapper: {"data": ..., "meta": ...}.
type envelope struct {
	Data any `json:"data"`
	Meta any `json:"meta,omitempty"`
}

// errEnvelope is the standard failure wrapper: {"error": {code, message}}.
type errEnvelope struct {
	Error *APIError `json:"error"`
}

// WriteJSON writes data wrapped in the success envelope with the given status.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	writeJSON(w, status, envelope{Data: data})
}

// WriteJSONMeta is like WriteJSON but includes a meta object (e.g. pagination).
func WriteJSONMeta(w http.ResponseWriter, status int, data, meta any) {
	writeJSON(w, status, envelope{Data: data, Meta: meta})
}

// WriteError maps err to an APIError and writes the failure envelope. Unknown
// errors are logged and surfaced as a generic 500 so internals never leak.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	apiErr, ok := asAPIError(err)
	if !ok {
		apiErr = ErrInternal()
		slog.ErrorContext(r.Context(), "unhandled error", "err", err.Error(), "path", r.URL.Path, "method", r.Method)
	}
	writeJSON(w, apiErr.Status, errEnvelope{Error: apiErr})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Stream-encode straight to the writer (and, via the Gzip middleware, into
	// the gzip writer/socket) instead of marshalling the whole payload into one
	// buffer first — less transient allocation/GC under concurrency at scale.
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// Status is already on the wire; nothing can be done for this client.
		slog.Error("response encode failed", "err", err.Error())
	}
}

// addVary appends a value to Vary unless already present. Add-if-absent keeps
// independent middlewares from overwriting each other's cache keys.
func addVary(h http.Header, value string) {
	for _, existing := range h.Values("Vary") {
		for _, part := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(part), value) {
				return
			}
		}
	}
	h.Add("Vary", value)
}

// CheckETag sets the ETag (+ caching headers) and, if the client's
// If-None-Match matches, writes a 304 and returns true so the caller can skip
// building the body. etag must already include quotes.
func CheckETag(w http.ResponseWriter, r *http.Request, etag string) bool {
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, must-revalidate")
	addVary(w.Header(), "Accept-Encoding")
	if match := r.Header.Get("If-None-Match"); match != "" && match == etag {
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	return false
}

// DecodeJSON strictly decodes the request body into dst, rejecting unknown
// fields and trailing content. It returns an *APIError on failure.
func DecodeJSON(r *http.Request, dst any) error {
	if r.Body == nil {
		return ErrBadRequest("request body is required")
	}
	// Cap body size to 8 MiB to bound memory (scenes can be large but not huge).
	r.Body = http.MaxBytesReader(nil, r.Body, 8<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return ErrBadRequest("request body too large")
		}
		return ErrBadRequest("invalid JSON body: " + err.Error())
	}
	// Ensure there is no trailing data after the JSON value.
	if dec.More() {
		return ErrBadRequest("request body must contain a single JSON value")
	}
	return nil
}
