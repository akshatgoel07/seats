// Package service holds the business logic, orchestrating the stores. Handlers
// call services; services call stores. Services translate store-level errors
// (store.ErrNotFound/ErrConflict) into httpx.APIError so handlers can write
// them directly.
package service

import "github.com/akshat/seats/api/internal/store"

// Services aggregates the application services for injection into handlers.
type Services struct {
	Layouts  *LayoutService
	Shows    *ShowService
	Bookings *BookingService
}

// New builds the service layer from the stores.
func New(stores store.Stores) Services {
	return Services{
		Layouts:  &LayoutService{venues: stores.Venues, categories: stores.Categories, layouts: stores.Layouts},
		Shows:    &ShowService{shows: stores.Shows, layouts: stores.Layouts},
		Bookings: &BookingService{bookings: stores.Bookings},
	}
}
