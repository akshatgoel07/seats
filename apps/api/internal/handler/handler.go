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
	mux.HandleFunc("GET /v1/venues/{venueId}", v.get)
	mux.HandleFunc("PATCH /v1/venues/{venueId}", v.update)
	mux.HandleFunc("DELETE /v1/venues/{venueId}", v.delete)

	// Categories (venue-scoped create/list; id-scoped update/delete)
	mux.HandleFunc("GET /v1/venues/{venueId}/categories", c.list)
	mux.HandleFunc("POST /v1/venues/{venueId}/categories", c.create)
	mux.HandleFunc("PATCH /v1/categories/{categoryId}", c.update)
	mux.HandleFunc("DELETE /v1/categories/{categoryId}", c.delete)

	// Layouts
	mux.HandleFunc("GET /v1/venues/{venueId}/layouts", l.listByVenue)
	mux.HandleFunc("POST /v1/venues/{venueId}/layouts", l.create)
	mux.HandleFunc("GET /v1/layouts/{layoutId}", l.get)
	mux.HandleFunc("PUT /v1/layouts/{layoutId}", l.saveScene)
	mux.HandleFunc("PATCH /v1/layouts/{layoutId}", l.updateMeta)
	mux.HandleFunc("DELETE /v1/layouts/{layoutId}", l.delete)
	mux.HandleFunc("POST /v1/layouts/{layoutId}/publish", l.publish)
	mux.HandleFunc("GET /v1/layouts/{layoutId}/seats", l.listSeats)

	// Shows
	mux.HandleFunc("GET /v1/layouts/{layoutId}/shows", sh.listByLayout)
	mux.HandleFunc("POST /v1/layouts/{layoutId}/shows", sh.create)
	mux.HandleFunc("GET /v1/shows/{showId}", sh.get)
	mux.HandleFunc("DELETE /v1/shows/{showId}", sh.delete)
	mux.HandleFunc("GET /v1/shows/{showId}/seats", sh.seats)
	mux.HandleFunc("PATCH /v1/shows/{showId}/seats", sh.patchSeats)

	// Holds & Bookings
	mux.HandleFunc("POST /v1/shows/{showId}/holds", b.createHold)
	mux.HandleFunc("DELETE /v1/holds/{holdId}", b.releaseHold)
	mux.HandleFunc("GET /v1/holds/{holdId}", b.getHold)
	mux.HandleFunc("POST /v1/shows/{showId}/bookings", b.createBooking)
	mux.HandleFunc("GET /v1/bookings/{bookingId}", b.getBooking)

	log.Info("v1 API routes registered")
}
