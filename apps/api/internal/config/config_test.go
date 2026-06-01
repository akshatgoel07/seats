package config

import (
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// Ensure a clean environment for the keys we read.
	for _, k := range []string{"PORT", "DATABASE_URL", "CORS_ORIGINS", "AUTH_ENABLED", "RATE_LIMIT_RPS", "RATE_LIMIT_BURST"} {
		t.Setenv(k, "")
	}

	c, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if c.Port != "8080" {
		t.Errorf("Port = %q, want 8080", c.Port)
	}
	if c.Addr() != ":8080" {
		t.Errorf("Addr() = %q, want :8080", c.Addr())
	}
	if c.AuthEnabled {
		t.Errorf("AuthEnabled = true, want false by default")
	}
	if c.RateLimitRPS != 50 {
		t.Errorf("RateLimitRPS = %v, want 50", c.RateLimitRPS)
	}
	if len(c.CORSOrigins) != 1 || c.CORSOrigins[0] != "http://localhost:3000" {
		t.Errorf("CORSOrigins = %v, want [http://localhost:3000]", c.CORSOrigins)
	}
}

func TestLoadOverrides(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("AUTH_ENABLED", "true")
	t.Setenv("RATE_LIMIT_RPS", "10")
	t.Setenv("RATE_LIMIT_BURST", "20")
	t.Setenv("CORS_ORIGINS", "http://a.com, http://b.com ,")

	c, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if c.Port != "9090" {
		t.Errorf("Port = %q, want 9090", c.Port)
	}
	if !c.AuthEnabled {
		t.Errorf("AuthEnabled = false, want true")
	}
	if c.RateLimitRPS != 10 {
		t.Errorf("RateLimitRPS = %v, want 10", c.RateLimitRPS)
	}
	if c.RateLimitBurst != 20 {
		t.Errorf("RateLimitBurst = %v, want 20", c.RateLimitBurst)
	}
	want := []string{"http://a.com", "http://b.com"}
	if len(c.CORSOrigins) != len(want) {
		t.Fatalf("CORSOrigins = %v, want %v", c.CORSOrigins, want)
	}
	for i := range want {
		if c.CORSOrigins[i] != want[i] {
			t.Errorf("CORSOrigins[%d] = %q, want %q", i, c.CORSOrigins[i], want[i])
		}
	}
}

func TestLoadInvalidBool(t *testing.T) {
	t.Setenv("AUTH_ENABLED", "not-a-bool")
	if _, err := Load(); err == nil {
		t.Fatal("Load() expected error for invalid AUTH_ENABLED, got nil")
	}
}
