package handler

import (
	"net/http"
	"strconv"

	"github.com/akshat/seats/api/internal/httpx"
)

// pagination extracts limit/offset query params with safe defaults. The service
// layer clamps the upper bound.
func pagination(r *http.Request) (limit, offset int) {
	limit = 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	return limit, offset
}

// isUUID reports whether s looks like a canonical 36-char UUID
// (8-4-4-4-12 hex). All path IDs in this API are Postgres-generated UUIDs;
// rejecting other shapes up front turns driver-level 22P02 errors into clean
// 404s without a DB round-trip.
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i := 0; i < 36; i++ {
		c := s[i]
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			switch {
			case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
			default:
				return false
			}
		}
	}
	return true
}

// uuidParams wraps a handler, returning 404 early when any named path
// parameter is not a UUID. A malformed ID can never name a resource, so 404
// matches the not-found contract exactly.
func uuidParams(next http.HandlerFunc, names ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		for _, n := range names {
			if !isUUID(r.PathValue(n)) {
				httpx.WriteError(w, r, httpx.ErrNotFound("resource not found"))
				return
			}
		}
		next(w, r)
	}
}
