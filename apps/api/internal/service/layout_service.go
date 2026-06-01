package service

import (
	"context"
	"encoding/json"
	"math"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/store"
)

// LayoutService handles venues, categories, and layouts (the editable scene).
type LayoutService struct {
	venues     store.VenueStore
	categories store.CategoryStore
	layouts    store.LayoutStore
}

// ---- Venues ----

func (s *LayoutService) CreateVenue(ctx context.Context, name string, metadata map[string]any) (domain.VenueRecord, error) {
	if err := domain.ValidateVenueName(name); err != nil {
		return domain.VenueRecord{}, mapError(err)
	}
	v, err := s.venues.CreateVenue(ctx, name, metadata)
	return v, mapError(err)
}

func (s *LayoutService) GetVenue(ctx context.Context, id string) (domain.VenueRecord, error) {
	v, err := s.venues.GetVenue(ctx, id)
	return v, mapError(err)
}

func (s *LayoutService) ListVenues(ctx context.Context, limit, offset int) ([]domain.VenueRecord, error) {
	v, err := s.venues.ListVenues(ctx, clampLimit(limit), maxInt(offset, 0))
	return v, mapError(err)
}

func (s *LayoutService) UpdateVenue(ctx context.Context, id, name string, metadata map[string]any) (domain.VenueRecord, error) {
	if err := domain.ValidateVenueName(name); err != nil {
		return domain.VenueRecord{}, mapError(err)
	}
	v, err := s.venues.UpdateVenue(ctx, id, name, metadata)
	return v, mapError(err)
}

func (s *LayoutService) DeleteVenue(ctx context.Context, id string) error {
	return mapError(s.venues.DeleteVenue(ctx, id))
}

// ---- Categories ----

func (s *LayoutService) CreateCategory(ctx context.Context, c domain.CategoryRecord) (domain.CategoryRecord, error) {
	if c.Name == "" {
		return domain.CategoryRecord{}, httpx.ErrValidation("category name must not be empty")
	}
	out, err := s.categories.CreateCategory(ctx, c)
	return out, mapError(err)
}

func (s *LayoutService) ListCategories(ctx context.Context, venueID string) ([]domain.CategoryRecord, error) {
	out, err := s.categories.ListCategories(ctx, venueID)
	return out, mapError(err)
}

func (s *LayoutService) UpdateCategory(ctx context.Context, c domain.CategoryRecord) (domain.CategoryRecord, error) {
	out, err := s.categories.UpdateCategory(ctx, c)
	return out, mapError(err)
}

func (s *LayoutService) DeleteCategory(ctx context.Context, id string) error {
	return mapError(s.categories.DeleteCategory(ctx, id))
}

// ---- Layouts ----

func (s *LayoutService) CreateLayout(ctx context.Context, venueID, name string) (domain.Layout, error) {
	if name == "" {
		name = "Untitled Layout"
	}
	// Ensure the venue exists (clear 404 instead of FK error).
	if _, err := s.venues.GetVenue(ctx, venueID); err != nil {
		return domain.Layout{}, mapError(err)
	}
	l, err := s.layouts.CreateLayout(ctx, venueID, name)
	return l, mapError(err)
}

func (s *LayoutService) GetLayout(ctx context.Context, id string) (domain.Layout, error) {
	l, err := s.layouts.GetLayout(ctx, id)
	return l, mapError(err)
}

func (s *LayoutService) ListLayouts(ctx context.Context, venueID string, limit, offset int) ([]domain.Layout, error) {
	l, err := s.layouts.ListLayouts(ctx, venueID, clampLimit(limit), maxInt(offset, 0))
	return l, mapError(err)
}

// SaveScene validates the incoming scene, flattens its seats, and persists both
// atomically. The raw scene is stored verbatim for a lossless editor round-trip.
func (s *LayoutService) SaveScene(ctx context.Context, id string, rawScene []byte) (domain.Layout, error) {
	scene, err := domain.ValidateScene(rawScene)
	if err != nil {
		return domain.Layout{}, mapError(err)
	}
	res := domain.FlattenSeats(scene)
	l, err := s.layouts.SaveScene(ctx, id, rawScene, res.Seats, res.RowCount, res.ColCount)
	return l, mapError(err)
}

func (s *LayoutService) UpdateLayoutMeta(ctx context.Context, id, name string, status domain.LayoutStatus) (domain.Layout, error) {
	if status != "" && status != domain.LayoutStatusDraft && status != domain.LayoutStatusPublished && status != domain.LayoutStatusArchived {
		return domain.Layout{}, httpx.ErrValidation("invalid status")
	}
	// Default to keeping the existing name/status when fields are omitted.
	cur, err := s.layouts.GetLayout(ctx, id)
	if err != nil {
		return domain.Layout{}, mapError(err)
	}
	if name == "" {
		name = cur.Name
	}
	if status == "" {
		status = cur.Status
	}
	l, err := s.layouts.UpdateLayoutMeta(ctx, id, name, status)
	return l, mapError(err)
}

func (s *LayoutService) DeleteLayout(ctx context.Context, id string) error {
	return mapError(s.layouts.DeleteLayout(ctx, id))
}

func (s *LayoutService) ListSeats(ctx context.Context, layoutID string) ([]domain.FlatSeat, error) {
	// Confirm the layout exists for a clear 404.
	if _, err := s.layouts.GetLayout(ctx, layoutID); err != nil {
		return nil, mapError(err)
	}
	seats, err := s.layouts.ListSeats(ctx, layoutID)
	return seats, mapError(err)
}

func (s *LayoutService) Publish(ctx context.Context, id string) (domain.Layout, error) {
	l, err := s.layouts.Publish(ctx, id)
	return l, mapError(err)
}

// scenePrices parses a scene's venue categories into a categoryID -> price_cents
// map, used when seeding per-show seat prices.
func scenePrices(raw domain.RawScene) map[string]int {
	prices := map[string]int{}
	if len(raw) == 0 {
		return prices
	}
	var s domain.Scene
	if err := json.Unmarshal(raw, &s); err != nil {
		return prices
	}
	for _, c := range s.Venue.Categories {
		prices[c.ID] = int(math.Round(c.Price * 100))
	}
	return prices
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
