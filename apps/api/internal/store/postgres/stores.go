package postgres

import "github.com/akshat/seats/api/internal/store"

// NewStores constructs all postgres-backed stores sharing one *DB and returns
// them aggregated for injection into the service layer.
func NewStores(db *DB) store.Stores {
	return store.Stores{
		Venues:     &VenueStore{db: db},
		Categories: &CategoryStore{db: db},
		Layouts:    &LayoutStore{db: db},
		Shows:      &ShowStore{db: db},
		Bookings:   &BookingStore{db: db},
	}
}
