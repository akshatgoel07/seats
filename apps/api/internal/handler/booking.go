package handler

import (
	"net/http"

	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/service"
)

// Booking handles holds and bookings.
type Booking struct{ svc *service.BookingService }

func (h *Booking) createHold(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SeatUIDs   []string `json:"seatUids"`
		TTLSeconds int      `json:"ttlSeconds"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	hold, err := h.svc.CreateHold(r.Context(), r.PathValue("showId"), body.SeatUIDs, body.TTLSeconds)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, hold)
}

func (h *Booking) getHold(w http.ResponseWriter, r *http.Request) {
	hold, err := h.svc.GetHold(r.Context(), r.PathValue("holdId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, hold)
}

func (h *Booking) releaseHold(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.ReleaseHold(r.Context(), r.PathValue("holdId")); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Booking) createBooking(w http.ResponseWriter, r *http.Request) {
	var body struct {
		HoldID   *string        `json:"holdId"`
		SeatUIDs []string       `json:"seatUids"`
		Customer map[string]any `json:"customer"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	booking, err := h.svc.CreateBooking(r.Context(), r.PathValue("showId"), body.HoldID, body.SeatUIDs, body.Customer)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, booking)
}

func (h *Booking) getBooking(w http.ResponseWriter, r *http.Request) {
	booking, err := h.svc.GetBooking(r.Context(), r.PathValue("bookingId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, booking)
}
