package handler

import (
	"net/http"

	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/service"
)

// Venue handles venue endpoints.
type Venue struct{ svc *service.LayoutService }

type venueBody struct {
	Name     string         `json:"name"`
	Metadata map[string]any `json:"metadata"`
}

func (h *Venue) list(w http.ResponseWriter, r *http.Request) {
	limit, offset := pagination(r)
	venues, err := h.svc.ListVenues(r.Context(), limit, offset)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, venues)
}

func (h *Venue) create(w http.ResponseWriter, r *http.Request) {
	var body venueBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	v, err := h.svc.CreateVenue(r.Context(), body.Name, body.Metadata)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, v)
}

func (h *Venue) get(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.GetVenue(r.Context(), r.PathValue("venueId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, v)
}

func (h *Venue) update(w http.ResponseWriter, r *http.Request) {
	var body venueBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	v, err := h.svc.UpdateVenue(r.Context(), r.PathValue("venueId"), body.Name, body.Metadata)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, v)
}

func (h *Venue) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteVenue(r.Context(), r.PathValue("venueId")); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
