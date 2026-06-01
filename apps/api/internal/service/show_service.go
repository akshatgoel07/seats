package service

import (
	"context"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
)

// ShowService handles shows and per-show seat availability.
type ShowService struct {
	shows   store.ShowStore
	layouts store.LayoutStore
}

// ShowSeats is the customer-render payload: the layout's scene plus per-seat
// availability, joined by seat UID, and the flat seat geometry for convenience.
type ShowSeats struct {
	Show   domain.Show         `json:"show"`
	Scene  domain.RawScene     `json:"scene"`
	Seats  []domain.FlatSeat   `json:"seats"`
	Status []domain.SeatStatus `json:"status"`
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

// GetShowSeats returns the full render payload: scene + flat seats + statuses.
func (s *ShowService) GetShowSeats(ctx context.Context, showID string) (ShowSeats, error) {
	sh, err := s.shows.GetShow(ctx, showID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	layout, err := s.layouts.GetLayout(ctx, sh.LayoutID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	seats, err := s.layouts.ListSeats(ctx, sh.LayoutID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	status, err := s.shows.SeatStatuses(ctx, showID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	return ShowSeats{Show: sh, Scene: layout.Scene, Seats: seats, Status: status}, nil
}

// SetSeatStates applies admin block/unblock/price-override updates.
func (s *ShowService) SetSeatStates(ctx context.Context, showID string, updates []store.SeatStateUpdate) error {
	return mapError(s.shows.SetSeatStates(ctx, showID, updates))
}
