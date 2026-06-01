// Package config loads runtime configuration from environment variables with
// sensible defaults so the service runs locally with zero setup.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration for the API server.
type Config struct {
	Port            string
	DatabaseURL     string
	CORSOrigins     []string
	AuthEnabled     bool
	RateLimitRPS    float64
	RateLimitBurst  int
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration
}

// Load reads configuration from the environment, applying defaults. It returns
// an error only when a provided value is malformed (so misconfiguration fails
// fast at startup rather than at request time).
func Load() (Config, error) {
	c := Config{
		Port:            getEnv("PORT", "8080"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://seatlayout:seatlayout@localhost:5432/seatlayout?sslmode=disable"),
		CORSOrigins:     splitCSV(getEnv("CORS_ORIGINS", "http://localhost:3000")),
		ReadTimeout:     15 * time.Second,
		WriteTimeout:    30 * time.Second,
		ShutdownTimeout: 10 * time.Second,
	}

	authEnabled, err := parseBool(getEnv("AUTH_ENABLED", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("AUTH_ENABLED: %w", err)
	}
	c.AuthEnabled = authEnabled

	rps, err := parseFloat(getEnv("RATE_LIMIT_RPS", "50"))
	if err != nil {
		return Config{}, fmt.Errorf("RATE_LIMIT_RPS: %w", err)
	}
	c.RateLimitRPS = rps

	burst, err := parseInt(getEnv("RATE_LIMIT_BURST", "100"))
	if err != nil {
		return Config{}, fmt.Errorf("RATE_LIMIT_BURST: %w", err)
	}
	c.RateLimitBurst = burst

	return c, nil
}

// Addr returns the host:port the server should listen on.
func (c Config) Addr() string {
	return ":" + c.Port
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func parseBool(s string) (bool, error) {
	return strconv.ParseBool(strings.TrimSpace(s))
}

func parseFloat(s string) (float64, error) {
	return strconv.ParseFloat(strings.TrimSpace(s), 64)
}

func parseInt(s string) (int, error) {
	return strconv.Atoi(strings.TrimSpace(s))
}
