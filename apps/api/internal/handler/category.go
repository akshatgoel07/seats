package handler

import (
	"net/http"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/service"
)

// Category handles category (seat type / price tier) endpoints.
type Category struct{ svc *service.LayoutService }

type categoryBody struct {
	Name        string `json:"name"`
	Color       string `json:"color"`
	PriceCents  int    `json:"priceCents"`
	IsStanding  bool   `json:"isStanding"`
	ExternalRef string `json:"externalRef"`
}

func (h *Category) list(w http.ResponseWriter, r *http.Request) {
	cats, err := h.svc.ListCategories(r.Context(), r.PathValue("venueId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cats)
}

func (h *Category) create(w http.ResponseWriter, r *http.Request) {
	var body categoryBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	c := domain.CategoryRecord{
		VenueID:     r.PathValue("venueId"),
		Name:        body.Name,
		Color:       body.Color,
		PriceCents:  body.PriceCents,
		IsStanding:  body.IsStanding,
		ExternalRef: body.ExternalRef,
	}
	out, err := h.svc.CreateCategory(r.Context(), c)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, out)
}

func (h *Category) update(w http.ResponseWriter, r *http.Request) {
	var body categoryBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	c := domain.CategoryRecord{
		ID:          r.PathValue("categoryId"),
		Name:        body.Name,
		Color:       body.Color,
		PriceCents:  body.PriceCents,
		IsStanding:  body.IsStanding,
		ExternalRef: body.ExternalRef,
	}
	out, err := h.svc.UpdateCategory(r.Context(), c)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Category) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteCategory(r.Context(), r.PathValue("categoryId")); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
