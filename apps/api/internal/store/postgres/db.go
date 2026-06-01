// Package postgres provides PostgreSQL-backed implementations of the store
// interfaces using the standard library's database/sql with the pgx driver.
package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	// Register the pgx stdlib driver under the name "pgx".
	_ "github.com/jackc/pgx/v5/stdlib"
)

// DB wraps *sql.DB with the project's connection settings.
type DB struct {
	*sql.DB
}

// New creates a connection pool handle for dsn. It does NOT establish a
// connection (database/sql connects lazily), so it never fails on a transient
// database outage — callers use Ping/readiness to learn liveness. This lets the
// server start before the database is reachable.
func New(dsn string) (*DB, error) {
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	sqlDB.SetConnMaxLifetime(time.Hour)
	return &DB{DB: sqlDB}, nil
}

// Open creates the pool and verifies connectivity with a ping. Useful for tools
// (migrations, tests) that should fail fast when the database is unreachable.
func Open(ctx context.Context, dsn string) (*DB, error) {
	db, err := New(dsn)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}
