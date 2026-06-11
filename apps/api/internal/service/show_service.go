package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
)

// ShowService handles shows and per-show seat availability.
type ShowService struct {
	shows   store.ShowStore
	layouts store.LayoutStore
}

// ShowSeats is the customer-render payload: the layout's scene plus per-seat
// availability and flat seat geometry. Seats and Status are pre-serialized JSON
// (built in Postgres via json_agg) and spliced in verbatim — no per-row Scan or
// Go marshal of tens of thousands of structs on the hot read path.
type ShowSeats struct {
	Show   domain.Show     `json:"show"`
	Scene  domain.RawScene `json:"scene"`
	Seats  json.RawMessage `json:"seats"`
	Status json.RawMessage `json:"status"`
}

// CreateShow creates a show from a layout, seeding per-seat availability from
// the layout's flattened seats (all available) with prices derived from the
// scene's categories.
func (s *ShowService) CreateShow(ctx context.Context, layoutID, name string, sh domain.Show) (domain.Show, error) {
	layout, err := s.layouts.GetLayout(ctx, layoutID)
	if err != nil {
		return domain.Show{}, mapError(err)
	}
	seats, err := s.layouts.ListSeats(ctx, layoutID)
	if err != nil {
		return domain.Show{}, mapError(err)
	}
	prices := scenePrices(layout.Scene)
	created, err := s.shows.CreateShow(ctx, layoutID, name, sh, seats, prices)
	return created, mapError(err)
}

func (s *ShowService) GetShow(ctx context.Context, id string) (domain.Show, error) {
	sh, err := s.shows.GetShow(ctx, id)
	return sh, mapError(err)
}

func (s *ShowService) ListShows(ctx context.Context, layoutID string, limit, offset int) ([]domain.Show, error) {
	out, err := s.shows.ListShows(ctx, layoutID, clampLimit(limit), maxInt(offset, 0))
	return out, mapError(err)
}

func (s *ShowService) DeleteShow(ctx context.Context, id string) error {
	return mapError(s.shows.DeleteShow(ctx, id))
}

// GetShowSeats returns the full render payload for a show ID.
func (s *ShowService) GetShowSeats(ctx context.Context, showID string) (ShowSeats, error) {
	sh, err := s.shows.GetShow(ctx, showID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	return s.GetShowSeatsFor(ctx, sh)
}

// GetShowSeatsFor builds the render payload for an already-fetched show.
// Seats/status are built as JSON in Postgres and spliced in verbatim.
func (s *ShowService) GetShowSeatsFor(ctx context.Context, sh domain.Show) (ShowSeats, error) {
	layout, err := s.layouts.GetLayout(ctx, sh.LayoutID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	seats, err := s.layouts.ListSeatsJSON(ctx, sh.LayoutID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	status, err := s.shows.SeatStatusesJSON(ctx, sh.ID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	return ShowSeats{Show: sh, Scene: layout.Scene, Seats: seats, Status: status}, nil
}

// ShowSeatsETag returns a cheap cache validator for the seats endpoint: the
// layout version (geometry) combined with the seat-status freshness token
// (availability). Lets a polling client get a 304 when nothing changed without
// building the full payload.
// Known limitations of this validator (acceptable for private, must-revalidate
// caching): updated_at has 1-second granularity, and a same-second change that
// keeps count(*) identical can produce the same token until the next write.
// Hold expiry only becomes visible when the background sweeper frees seats.
func (s *ShowService) ShowSeatsETag(ctx context.Context, showID string) (string, domain.Show, error) {
	sh, err := s.shows.GetShow(ctx, showID)
	if err != nil {
		return "", domain.Show{}, mapError(err)
	}
	ver, err := s.layouts.GetVersion(ctx, sh.LayoutID)
	if err != nil {
		return "", domain.Show{}, mapError(err)
	}
	statusVer, err := s.shows.SeatStatusVersion(ctx, showID)
	if err != nil {
		return "", domain.Show{}, mapError(err)
	}
	return fmt.Sprintf(`"%s-v%d-%s"`, showID, ver, statusVer), sh, nil
}

// SetSeatStates applies admin block/unblock/price-override updates.
func (s *ShowService) SetSeatStates(ctx context.Context, showID string, updates []store.SeatStateUpdate) error {
	return mapError(s.shows.SetSeatStates(ctx, showID, updates))
}
