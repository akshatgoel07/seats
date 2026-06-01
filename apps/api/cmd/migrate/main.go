// Command migrate applies database schema migrations and exits.
package main

import (
	"context"
	"log"
	"time"

	"github.com/akshat/seats/api/internal/config"
	"github.com/akshat/seats/api/internal/store/migrations"
	"github.com/akshat/seats/api/internal/store/postgres"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := postgres.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()

	names, _ := migrations.Names()
	log.Printf("applying %d migration(s): %v", len(names), names)
	if err := migrations.Apply(ctx, db.DB); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("migrations applied successfully")
}
