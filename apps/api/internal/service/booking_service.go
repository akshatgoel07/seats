package service

import (
	"context"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/store"
)

// BookingService handles holds and bookings.
type BookingService struct {
	bookings store.BookingStore
}

const (
	defaultHoldTTLSeconds = 300  // 5 minutes
	maxHoldTTLSeconds     = 3600 // 1 hour
	maxSeatsPerRequest    = 50
)

// CreateHold places a time-bounded hold on seats. ttlSeconds<=0 uses the
// default; values are clamped to a sane maximum.
func (s *BookingService) CreateHold(ctx context.Context, showID string, seatUIDs []string, ttlSeconds int) (domain.Hold, error) {
	if len(seatUIDs) == 0 {
		return domain.Hold{}, httpx.ErrValidation("seatUids must not be empty")
	}
	if len(seatUIDs) > maxSeatsPerRequest {
		return domain.Hold{}, httpx.ErrValidation("too many seats in one request")
	}
	if ttlSeconds <= 0 {
		ttlSeconds = defaultHoldTTLSeconds
	}
	if ttlSeconds > maxHoldTTLSeconds {
		ttlSeconds = maxHoldTTLSeconds
	}
	h, err := s.bookings.CreateHold(ctx, showID, dedupe(seatUIDs), ttlSeconds)
	return h, mapError(err)
}

func (s *BookingService) GetHold(ctx context.Context, id string) (domain.Hold, error) {
	h, err := s.bookings.GetHold(ctx, id)
	return h, mapError(err)
}

func (s *BookingService) ReleaseHold(ctx context.Context, id string) error {
	return mapError(s.bookings.ReleaseHold(ctx, id))
}

// CreateBooking books seats either from an existing hold or directly.
func (s *BookingService) CreateBooking(ctx context.Context, showID string, holdID *string, seatUIDs []string, customer map[string]any) (domain.Booking, error) {
	if holdID == nil && len(seatUIDs) == 0 {
		return domain.Booking{}, httpx.ErrValidation("provide either holdId or seatUids")
	}
	if len(seatUIDs) > maxSeatsPerRequest {
		return domain.Booking{}, httpx.ErrValidation("too many seats in one request")
	}
	b, err := s.bookings.CreateBooking(ctx, showID, holdID, dedupe(seatUIDs), customer)
	return b, mapError(err)
}

func (s *BookingService) GetBooking(ctx context.Context, id string) (domain.Booking, error) {
	b, err := s.bookings.GetBooking(ctx, id)
	return b, mapError(err)
}

// dedupe removes duplicate seat UIDs while preserving order.
func dedupe(in []string) []string {
	if len(in) == 0 {
		return in
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, v := range in {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}
