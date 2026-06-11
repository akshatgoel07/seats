package handler

import (
	"net/http"
	"time"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/service"
	"github.com/akshat/seats/api/internal/store"
)

// ShowHandler handles show + per-show seat endpoints.
type ShowHandler struct{ shows *service.ShowService }

func (h *ShowHandler) listByLayout(w http.ResponseWriter, r *http.Request) {
	limit, offset := pagination(r)
	out, err := h.shows.ListShows(r.Context(), r.PathValue("layoutId"), limit, offset)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *ShowHandler) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string     `json:"name"`
		StartsAt    *time.Time `json:"startsAt"`
		Status      string     `json:"status"`
		ExternalRef string     `json:"externalRef"`
	}
	if r.ContentLength != 0 {
		if err := httpx.DecodeJSON(r, &body); err != nil {
			httpx.WriteError(w, r, err)
			return
		}
	}
	sh := domain.Show{
		StartsAt:    body.StartsAt,
		Status:      domain.ShowStatus(body.Status),
		ExternalRef: body.ExternalRef,
	}
	created, err := h.shows.CreateShow(r.Context(), r.PathValue("layoutId"), body.Name, sh)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (h *ShowHandler) get(w http.ResponseWriter, r *http.Request) {
	sh, err := h.shows.GetShow(r.Context(), r.PathValue("showId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sh)
}

func (h *ShowHandler) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.shows.DeleteShow(r.Context(), r.PathValue("showId")); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// seats returns the customer-render payload: scene + flat seats + statuses.
// A cheap ETag (layout version + seat-status freshness) lets a polling client
// get a 304 when nothing changed, skipping the multi-MB body entirely.
func (h *ShowHandler) seats(w http.ResponseWriter, r *http.Request) {
	showID := r.PathValue("showId")
	etag, sh, err := h.shows.ShowSeatsETag(r.Context(), showID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if httpx.CheckETag(w, r, etag) {
		return // 304 Not Modified
	}
	payload, err := h.shows.GetShowSeatsFor(r.Context(), sh)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, payload)
}

// patchSeats applies admin state/price updates to specific seats.
func (h *ShowHandler) patchSeats(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Updates []struct {
			SeatUID     string `json:"seatUid"`
			State       *int   `json:"state"`
			ReserveType *int   `json:"reserveType"`
			PriceCents  *int   `json:"priceCents"`
		} `json:"updates"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if len(body.Updates) == 0 {
		httpx.WriteError(w, r, httpx.ErrValidation("updates must not be empty"))
		return
	}
	updates := make([]store.SeatStateUpdate, 0, len(body.Updates))
	for _, u := range body.Updates {
		if u.SeatUID == "" {
			httpx.WriteError(w, r, httpx.ErrValidation("each update requires seatUid"))
			return
		}
		su := store.SeatStateUpdate{SeatUID: u.SeatUID, PriceCents: u.PriceCents}
		if u.State != nil {
			st := domain.SeatState(*u.State)
			su.State = &st
		}
		if u.ReserveType != nil {
			rt := domain.ReserveType(*u.ReserveType)
			su.ReserveType = &rt
		}
		updates = append(updates, su)
	}
	if err := h.shows.SetSeatStates(r.Context(), r.PathValue("showId"), updates); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]int{"updated": len(updates)})
}
