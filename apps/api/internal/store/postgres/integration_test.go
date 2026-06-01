//go:build integration

// Integration tests run against a live Postgres (see docker-compose.yml).
// Run with: go test -tags=integration ./internal/store/postgres/...
// They require DATABASE_URL (defaults to the compose DB); migrations are applied
// automatically.
package postgres

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
	"github.com/akshat/seats/api/internal/store/migrations"
)

func testDB(t *testing.T) *DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://seatlayout:seatlayout@localhost:5432/seatlayout?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db, err := Open(ctx, dsn)
	if err != nil {
		t.Skipf("integration DB unavailable: %v", err)
	}
	if err := migrations.Apply(ctx, db.DB); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	return db
}

func strp(s string) *string { return &s }

// seedLayout creates a venue + layout and saves a small scene; returns ids.
func seedLayout(t *testing.T, db *DB) (venueID, layoutID string) {
	t.Helper()
	ctx := context.Background()
	stores := NewStores(db)

	v, err := stores.Venues.CreateVenue(ctx, "Test Venue", map[string]any{"k": "v"})
	if err != nil {
		t.Fatalf("create venue: %v", err)
	}
	l, err := stores.Layouts.CreateLayout(ctx, v.ID, "Test Layout")
	if err != nil {
		t.Fatalf("create layout: %v", err)
	}

	scene := domain.Scene{
		Rows: map[string]domain.Row{
			"r1": {ID: "r1", Geometry: domain.Geometry{Kind: "line"}},
		},
		Seats: map[string]domain.Seat{
			"s1": {ID: "s1", RowID: strp("r1"), LocalX: 0, CategoryID: "vip"},
			"s2": {ID: "s2", RowID: strp("r1"), LocalX: 10, CategoryID: "vip"},
			"s3": {ID: "s3", RowID: strp("r1"), LocalX: 20, CategoryID: "std"},
		},
	}
	raw, err := json.Marshal(scene)
	if err != nil {
		t.Fatalf("marshal scene: %v", err)
	}
	res := domain.FlattenSeats(scene)
	saved, err := stores.Layouts.SaveScene(ctx, l.ID, raw, res.Seats, res.RowCount, res.ColCount)
	if err != nil {
		t.Fatalf("save scene: %v", err)
	}
	if saved.Version != 2 {
		t.Errorf("version after save = %d, want 2", saved.Version)
	}
	return v.ID, l.ID
}

func TestSaveSceneFlattens(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	stores := NewStores(db)

	_, layoutID := seedLayout(t, db)

	seats, err := stores.Layouts.ListSeats(ctx, layoutID)
	if err != nil {
		t.Fatalf("list seats: %v", err)
	}
	if len(seats) != 3 {
		t.Fatalf("flattened seats = %d, want 3", len(seats))
	}

	// Re-save with fewer seats; the seats table should reflect the new set.
	scene := domain.Scene{
		Rows:  map[string]domain.Row{"r1": {ID: "r1", Geometry: domain.Geometry{Kind: "line"}}},
		Seats: map[string]domain.Seat{"s1": {ID: "s1", RowID: strp("r1"), CategoryID: "vip"}},
	}
	raw, _ := json.Marshal(scene)
	res := domain.FlattenSeats(scene)
	if _, err := stores.Layouts.SaveScene(ctx, layoutID, raw, res.Seats, res.RowCount, res.ColCount); err != nil {
		t.Fatalf("re-save: %v", err)
	}
	seats, _ = stores.Layouts.ListSeats(ctx, layoutID)
	if len(seats) != 1 {
		t.Fatalf("after re-save seats = %d, want 1", len(seats))
	}
}

func TestShowSeedingAndStatus(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	stores := NewStores(db)

	_, layoutID := seedLayout(t, db)
	flat, _ := stores.Layouts.ListSeats(ctx, layoutID)
	prices := map[string]int{"vip": 5000, "std": 2000}

	show, err := stores.Shows.CreateShow(ctx, layoutID, "Opening Night", domain.Show{}, flat, prices)
	if err != nil {
		t.Fatalf("create show: %v", err)
	}
	statuses, err := stores.Shows.SeatStatuses(ctx, show.ID)
	if err != nil {
		t.Fatalf("seat statuses: %v", err)
	}
	if len(statuses) != 3 {
		t.Fatalf("seat statuses = %d, want 3", len(statuses))
	}
	for _, st := range statuses {
		if st.State != domain.SeatAvailable {
			t.Errorf("seat %s state = %d, want available", st.SeatUID, st.State)
		}
	}

	blocked := domain.SeatBlocked
	if err := stores.Shows.SetSeatStates(ctx, show.ID, []store.SeatStateUpdate{
		{SeatUID: "s1", State: &blocked},
	}); err != nil {
		t.Fatalf("set seat state: %v", err)
	}
	statuses, _ = stores.Shows.SeatStatuses(ctx, show.ID)
	var foundBlocked bool
	for _, st := range statuses {
		if st.SeatUID == "s1" && st.State == domain.SeatBlocked {
			foundBlocked = true
		}
	}
	if !foundBlocked {
		t.Error("seat s1 was not blocked")
	}
}

func TestHoldConcurrencyExactlyOneWins(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	stores := NewStores(db)

	_, layoutID := seedLayout(t, db)
	flat, _ := stores.Layouts.ListSeats(ctx, layoutID)
	show, err := stores.Shows.CreateShow(ctx, layoutID, "Concurrency", domain.Show{}, flat, nil)
	if err != nil {
		t.Fatalf("create show: %v", err)
	}

	const n = 12
	var wg sync.WaitGroup
	var mu sync.Mutex
	successes := 0
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := stores.Bookings.CreateHold(ctx, show.ID, []string{"s1"}, 60); err == nil {
				mu.Lock()
				successes++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if successes != 1 {
		t.Fatalf("concurrent holds on one seat: %d succeeded, want exactly 1", successes)
	}
}

func TestHoldExpiryFreesSeat(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	stores := NewStores(db)

	_, layoutID := seedLayout(t, db)
	flat, _ := stores.Layouts.ListSeats(ctx, layoutID)
	show, _ := stores.Shows.CreateShow(ctx, layoutID, "Expiry", domain.Show{}, flat, nil)

	if _, err := stores.Bookings.CreateHold(ctx, show.ID, []string{"s2"}, 0); err != nil {
		t.Fatalf("create hold: %v", err)
	}
	// ttl=0 -> expires_at = now(); ExpireDueHolds should free it.
	time.Sleep(50 * time.Millisecond)
	freed, err := stores.Bookings.ExpireDueHolds(ctx)
	if err != nil {
		t.Fatalf("expire: %v", err)
	}
	if freed < 1 {
		t.Fatalf("expired holds = %d, want >=1", freed)
	}
	if _, err := stores.Bookings.CreateHold(ctx, show.ID, []string{"s2"}, 60); err != nil {
		t.Fatalf("re-hold after expiry failed: %v", err)
	}
}

func TestBookingFromHold(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	stores := NewStores(db)

	_, layoutID := seedLayout(t, db)
	flat, _ := stores.Layouts.ListSeats(ctx, layoutID)
	show, _ := stores.Shows.CreateShow(ctx, layoutID, "Booking", domain.Show{}, flat, nil)

	hold, err := stores.Bookings.CreateHold(ctx, show.ID, []string{"s1", "s2"}, 120)
	if err != nil {
		t.Fatalf("hold: %v", err)
	}
	booking, err := stores.Bookings.CreateBooking(ctx, show.ID, &hold.ID, nil, map[string]any{"email": "a@b.com"})
	if err != nil {
		t.Fatalf("booking: %v", err)
	}
	if len(booking.SeatUIDs) != 2 {
		t.Fatalf("booked seats = %d, want 2", len(booking.SeatUIDs))
	}
	if _, err := stores.Bookings.CreateHold(ctx, show.ID, []string{"s1"}, 60); err == nil {
		t.Fatal("expected hold on booked seat to fail")
	}
}
