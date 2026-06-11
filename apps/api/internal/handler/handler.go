// Package handler contains the HTTP handlers for the /v1 API. Handlers decode
// requests, call services, and write responses via httpx. They hold no business
// logic.
package handler

import (
	"log/slog"
	"net/http"

	"github.com/akshat/seats/api/internal/service"
)

// RegisterV1 wires all /v1 routes onto mux using Go 1.22 method+wildcard
// patterns. The route table here is the third-party-stable API surface.
func RegisterV1(mux *http.ServeMux, svcs service.Services, log *slog.Logger) {
	v := &Venue{svc: svcs.Layouts}
	c := &Category{svc: svcs.Layouts}
	l := &Layout{svc: svcs.Layouts}
	sh := &ShowHandler{shows: svcs.Shows}
	b := &Booking{svc: svcs.Bookings}

	// Venues
	mux.HandleFunc("GET /v1/venues", v.list)
	mux.HandleFunc("POST /v1/venues", v.create)
	mux.HandleFunc("GET /v1/venues/{venueId}", uuidParams(v.get, "venueId"))
	mux.HandleFunc("PATCH /v1/venues/{venueId}", uuidParams(v.update, "venueId"))
	mux.HandleFunc("DELETE /v1/venues/{venueId}", uuidParams(v.delete, "venueId"))

	// Categories (venue-scoped create/list; id-scoped update/delete)
	mux.HandleFunc("GET /v1/venues/{venueId}/categories", uuidParams(c.list, "venueId"))
	mux.HandleFunc("POST /v1/venues/{venueId}/categories", uuidParams(c.create, "venueId"))
	mux.HandleFunc("PATCH /v1/categories/{categoryId}", uuidParams(c.update, "categoryId"))
	mux.HandleFunc("DELETE /v1/categories/{categoryId}", uuidParams(c.delete, "categoryId"))

	// Layouts
	mux.HandleFunc("GET /v1/venues/{venueId}/layouts", uuidParams(l.listByVenue, "venueId"))
	mux.HandleFunc("POST /v1/venues/{venueId}/layouts", uuidParams(l.create, "venueId"))
	mux.HandleFunc("GET /v1/layouts/{layoutId}", uuidParams(l.get, "layoutId"))
	mux.HandleFunc("PUT /v1/layouts/{layoutId}", uuidParams(l.saveScene, "layoutId"))
	mux.HandleFunc("PATCH /v1/layouts/{layoutId}", uuidParams(l.updateMeta, "layoutId"))
	mux.HandleFunc("DELETE /v1/layouts/{layoutId}", uuidParams(l.delete, "layoutId"))
	mux.HandleFunc("POST /v1/layouts/{layoutId}/publish", uuidParams(l.publish, "layoutId"))
	mux.HandleFunc("GET /v1/layouts/{layoutId}/seats", uuidParams(l.listSeats, "layoutId"))

	// Shows
	mux.HandleFunc("GET /v1/layouts/{layoutId}/shows", uuidParams(sh.listByLayout, "layoutId"))
	mux.HandleFunc("POST /v1/layouts/{layoutId}/shows", uuidParams(sh.create, "layoutId"))
	mux.HandleFunc("GET /v1/shows/{showId}", uuidParams(sh.get, "showId"))
	mux.HandleFunc("DELETE /v1/shows/{showId}", uuidParams(sh.delete, "showId"))
	mux.HandleFunc("GET /v1/shows/{showId}/seats", uuidParams(sh.seats, "showId"))
	mux.HandleFunc("PATCH /v1/shows/{showId}/seats", uuidParams(sh.patchSeats, "showId"))

	// Holds & Bookings
	mux.HandleFunc("POST /v1/shows/{showId}/holds", uuidParams(b.createHold, "showId"))
	mux.HandleFunc("DELETE /v1/holds/{holdId}", uuidParams(b.releaseHold, "holdId"))
	mux.HandleFunc("GET /v1/holds/{holdId}", uuidParams(b.getHold, "holdId"))
	mux.HandleFunc("POST /v1/shows/{showId}/bookings", uuidParams(b.createBooking, "showId"))
	mux.HandleFunc("GET /v1/bookings/{bookingId}", uuidParams(b.getBooking, "bookingId"))

	log.Info("v1 API routes registered")
}
