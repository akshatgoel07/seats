package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsUUID(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"a3bb189e-8bf9-3888-9912-ace4e6543002", true},
		{"A3BB189E-8BF9-3888-9912-ACE4E6543002", true},
		{"00000000-0000-0000-0000-000000000000", true},
		{"", false},
		{"not-a-uuid", false},
		{"a3bb189e8bf938889912ace4e6543002", false},
		{"a3bb189e-8bf9-3888-9912-ace4e654300g", false},
		{"a3bb189e-8bf9-3888-9912-ace4e65430022", false},
		{"1; DROP TABLE layouts;--", false},
	}
	for _, c := range cases {
		if got := isUUID(c.in); got != c.want {
			t.Errorf("isUUID(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestUUIDParamsRejectsMalformed(t *testing.T) {
	called := false
	h := uuidParams(func(http.ResponseWriter, *http.Request) { called = true }, "layoutId")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/layouts/{layoutId}", h)

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/layouts/not-a-uuid", nil))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
	if called {
		t.Fatal("handler was called despite malformed id")
	}

	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/layouts/a3bb189e-8bf9-3888-9912-ace4e6543002", nil))
	if !called {
		t.Fatal("handler was not called for a valid uuid")
	}
}
