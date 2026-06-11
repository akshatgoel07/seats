// Package store defines the persistence interfaces the service layer depends
// on, decoupling business logic from PostgreSQL. The postgres subpackage
// implements them. Keeping the interfaces here lets services be unit-tested
// with fakes and lets the backing store be swapped without touching services.
package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/akshat/seats/api/internal/domain"
)

// ErrNotFound is returned by stores when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when an operation violates a uniqueness/state rule
// (e.g. attempting to hold an already-held seat).
var ErrConflict = errors.New("conflict")

// VenueStore persists venues.
type VenueStore interface {
	CreateVenue(ctx context.Context, name string, metadata map[string]any) (domain.VenueRecord, error)
	GetVenue(ctx context.Context, id string) (domain.VenueRecord, error)
	ListVenues(ctx context.Context, limit, offset int) ([]domain.VenueRecord, error)
	UpdateVenue(ctx context.Context, id, name string, metadata map[string]any) (domain.VenueRecord, error)
	DeleteVenue(ctx context.Context, id string) error
}

// CategoryStore persists seat categories (price tiers) per venue.
type CategoryStore interface {
	CreateCategory(ctx context.Context, c domain.CategoryRecord) (domain.CategoryRecord, error)
	ListCategories(ctx context.Context, venueID string) ([]domain.CategoryRecord, error)
	UpdateCategory(ctx context.Context, c domain.CategoryRecord) (domain.CategoryRecord, error)
	DeleteCategory(ctx context.Context, id string) error
}

// LayoutStore persists layouts and their flattened seats. SaveScene replaces
// both the scene JSON and the flattened seat rows atomically.
type LayoutStore interface {
	CreateLayout(ctx context.Context, venueID, name string) (domain.Layout, error)
	GetLayout(ctx context.Context, id string) (domain.Layout, error)
	ListLayouts(ctx context.Context, venueID string, limit, offset int) ([]domain.Layout, error)
	// SaveScene stores the raw scene and the derived flat seats atomically and
	// updates row/col counts and the version. Returns the updated layout.
	SaveScene(ctx context.Context, id string, scene []byte, seats []domain.FlatSeat, rowCount, colCount int) (domain.Layout, error)
	UpdateLayoutMeta(ctx context.Context, id, name string, status domain.LayoutStatus) (domain.Layout, error)
	DeleteLayout(ctx context.Context, id string) error
	ListSeats(ctx context.Context, layoutID string) ([]domain.FlatSeat, error)
	// ListSeatsJSON returns the flat seats already serialized as a JSON array,
	// built in Postgres (json_agg), so the read path skips per-row Scan + Go
	// marshal of tens of thousands of structs. Returns "[]" when empty.
	ListSeatsJSON(ctx context.Context, layoutID string) (json.RawMessage, error)
	// Exists reports whether a layout row exists, without reading the scene.
	Exists(ctx context.Context, id string) (bool, error)
	// GetVersion returns the layout's monotonic version (cache validator) without
	// reading the scene.
	GetVersion(ctx context.Context, id string) (int, error)
	Publish(ctx context.Context, id string) (domain.Layout, error)
}

// ShowStore persists shows and seeds/reads per-show seat status.
type ShowStore interface {
	// CreateShow creates a show and seeds seat_status from the layout's flat
	// seats (all available, with prices from the seat's category) atomically.
	CreateShow(ctx context.Context, layoutID, name string, sh domain.Show, seats []domain.FlatSeat, prices map[string]int) (domain.Show, error)
	GetShow(ctx context.Context, id string) (domain.Show, error)
	ListShows(ctx context.Context, layoutID string, limit, offset int) ([]domain.Show, error)
	DeleteShow(ctx context.Context, id string) error
	// SeatStatuses returns all per-seat statuses for a show.
	SeatStatuses(ctx context.Context, showID string) ([]domain.SeatStatus, error)
	// SeatStatusesJSON returns all per-seat statuses already serialized as a JSON
	// array, built in Postgres (json_agg). Returns "[]" when empty.
	SeatStatusesJSON(ctx context.Context, showID string) (json.RawMessage, error)
	// SeatStatusVersion returns a cheap freshness token for the show's seat
	// status (count + max(updated_at)) used as an ETag validator.
	SeatStatusVersion(ctx context.Context, showID string) (string, error)
	// SetSeatStates updates state/reserve/price for specific seats (admin
	// block/unblock/price override).
	SetSeatStates(ctx context.Context, showID string, updates []SeatStateUpdate) error
}

// SeatStateUpdate is an admin-driven change to a seat's per-show status. Nil
// fields are left unchanged.
type SeatStateUpdate struct {
	SeatUID     string
	State       *domain.SeatState
	ReserveType *domain.ReserveType
	PriceCents  *int
}

// BookingStore handles holds and bookings transactionally. Implementations must
// guarantee a seat cannot be held or booked twice concurrently (row locking).
type BookingStore interface {
	// CreateHold attempts to hold all seatUIDs for showID until expiresAt. It
	// fails with ErrConflict if any seat is not currently available.
	CreateHold(ctx context.Context, showID string, seatUIDs []string, ttlSeconds int) (domain.Hold, error)
	GetHold(ctx context.Context, id string) (domain.Hold, error)
	ReleaseHold(ctx context.Context, id string) error
	// ExpireDueHolds releases holds whose expiry has passed, freeing their
	// seats. Returns the number of holds expired.
	ExpireDueHolds(ctx context.Context) (int, error)
	// CreateBooking books seats, either by consuming an existing active hold
	// (holdID) or by directly locking and booking seatUIDs. Fails with
	// ErrConflict if seats are unavailable.
	CreateBooking(ctx context.Context, showID string, holdID *string, seatUIDs []string, customer map[string]any) (domain.Booking, error)
	GetBooking(ctx context.Context, id string) (domain.Booking, error)
}

// Stores aggregates all store interfaces for convenient injection.
type Stores struct {
	Venues     VenueStore
	Categories CategoryStore
	Layouts    LayoutStore
	Shows      ShowStore
	Bookings   BookingStore
}
