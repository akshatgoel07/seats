package handler

import (
	"fmt"
	"io"
	"net/http"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/service"
)

// Layout handles layout (scene) endpoints.
type Layout struct{ svc *service.LayoutService }

func (h *Layout) listByVenue(w http.ResponseWriter, r *http.Request) {
	limit, offset := pagination(r)
	out, err := h.svc.ListLayouts(r.Context(), r.PathValue("venueId"), limit, offset)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Layout) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	// Body is optional for create; only decode when present.
	if r.ContentLength != 0 {
		if err := httpx.DecodeJSON(r, &body); err != nil {
			httpx.WriteError(w, r, err)
			return
		}
	}
	l, err := h.svc.CreateLayout(r.Context(), r.PathValue("venueId"), body.Name)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, l)
}

func (h *Layout) get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("layoutId")
	// Cheap version probe → conditional 304, so an unchanged scene is never
	// read/serialized/transferred again.
	if ver, err := h.svc.LayoutVersion(r.Context(), id); err == nil {
		if httpx.CheckETag(w, r, fmt.Sprintf(`"%s-v%d"`, id, ver)) {
			return // 304 Not Modified
		}
	}
	l, err := h.svc.GetLayout(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, l)
}

// saveScene accepts the raw scene JSON as the request body. The body is the
// scene object itself (not wrapped), so the editor can PUT its scene directly.
func (h *Layout) saveScene(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8<<20))
	if err != nil {
		httpx.WriteError(w, r, httpx.ErrBadRequest("could not read body"))
		return
	}
	l, err := h.svc.SaveScene(r.Context(), r.PathValue("layoutId"), body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, l)
}

func (h *Layout) updateMeta(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	l, err := h.svc.UpdateLayoutMeta(r.Context(), r.PathValue("layoutId"), body.Name, domain.LayoutStatus(body.Status))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, l)
}

func (h *Layout) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteLayout(r.Context(), r.PathValue("layoutId")); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Layout) publish(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.Publish(r.Context(), r.PathValue("layoutId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, l)
}

func (h *Layout) listSeats(w http.ResponseWriter, r *http.Request) {
	seats, err := h.svc.ListSeatsJSON(r.Context(), r.PathValue("layoutId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, seats)
}
