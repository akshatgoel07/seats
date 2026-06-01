package domain

import "time"

// LayoutStatus is the lifecycle state of a layout.
type LayoutStatus string

const (
	LayoutStatusDraft     LayoutStatus = "draft"
	LayoutStatusPublished LayoutStatus = "published"
	LayoutStatusArchived  LayoutStatus = "archived"
)

// ShowStatus is the lifecycle state of a show.
type ShowStatus string

const (
	ShowStatusScheduled ShowStatus = "scheduled"
	ShowStatusOpen      ShowStatus = "open"
	ShowStatusClosed    ShowStatus = "closed"
)

// SeatState is the availability of a seat for a specific show.
type SeatState int16

const (
	SeatAvailable SeatState = 0 // matches the frontend's "0" available sentinel
	SeatHeld      SeatState = 1
	SeatBooked    SeatState = 2
	SeatBlocked   SeatState = 3
)

// ReserveType mirrors the legacy seat_reserve_type_id. The frontend treats
// 8/12/13 as "blocked"; we keep 1 as the normal default.
type ReserveType int16

const (
	ReserveNormal ReserveType = 1
)

// BlockedReserveTypes are reserve types the renderer treats as unavailable.
var BlockedReserveTypes = []ReserveType{8, 12, 13}

// HoldStatus is the lifecycle of a seat hold.
type HoldStatus string

const (
	HoldActive   HoldStatus = "active"
	HoldReleased HoldStatus = "released"
	HoldExpired  HoldStatus = "expired"
	HoldConsumed HoldStatus = "consumed"
)

// BookingStatus is the lifecycle of a booking.
type BookingStatus string

const (
	BookingConfirmed BookingStatus = "confirmed"
	BookingCancelled BookingStatus = "cancelled"
)

// Venue records (DB-backed, distinct from the in-scene Venue snapshot).
type VenueRecord struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Metadata  map[string]any  `json:"metadata,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// CategoryRecord is a DB-backed seat type / price tier.
type CategoryRecord struct {
	ID          string    `json:"id"`
	VenueID     string    `json:"venueId"`
	Name        string    `json:"name"`
	Color       string    `json:"color"`
	PriceCents  int       `json:"priceCents"`
	IsStanding  bool      `json:"isStanding"`
	ExternalRef string    `json:"externalRef,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Layout is a DB-backed editable design. Scene is the raw JSON document.
type Layout struct {
	ID        string          `json:"id"`
	VenueID   string          `json:"venueId"`
	Name      string          `json:"name"`
	Status    LayoutStatus    `json:"status"`
	Scene     RawScene        `json:"scene"`
	RowCount  int             `json:"rowCount"`
	ColCount  int             `json:"colCount"`
	Version   int             `json:"version"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// RawScene is the verbatim scene JSON. It marshals as the embedded JSON value
// (not a quoted string), so layout responses contain the scene inline.
type RawScene []byte

// MarshalJSON emits the raw bytes as-is (an embedded JSON object).
func (r RawScene) MarshalJSON() ([]byte, error) {
	if len(r) == 0 {
		return []byte("null"), nil
	}
	return r, nil
}

// UnmarshalJSON stores the raw bytes verbatim.
func (r *RawScene) UnmarshalJSON(b []byte) error {
	*r = append((*r)[:0], b...)
	return nil
}

// Show is a DB-backed instance (a screening/performance) of a layout.
type Show struct {
	ID          string     `json:"id"`
	LayoutID    string     `json:"layoutId"`
	Name        string     `json:"name"`
	StartsAt    *time.Time `json:"startsAt,omitempty"`
	Status      ShowStatus `json:"status"`
	ExternalRef string     `json:"externalRef,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// SeatStatus is per-show availability for one seat.
type SeatStatus struct {
	SeatUID     string      `json:"seatUid"`
	State       SeatState   `json:"state"`
	ReserveType ReserveType `json:"reserveType"`
	PriceCents  int         `json:"priceCents"`
	HoldID      *string     `json:"holdId,omitempty"`
	BookingID   *string     `json:"bookingId,omitempty"`
}

// Hold is a time-bounded reservation of seats prior to booking.
type Hold struct {
	ID        string     `json:"id"`
	ShowID    string     `json:"showId"`
	Status    HoldStatus `json:"status"`
	SeatUIDs  []string   `json:"seatUids"`
	ExpiresAt time.Time  `json:"expiresAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

// Booking is a confirmed purchase of seats for a show.
type Booking struct {
	ID        string         `json:"id"`
	ShowID    string         `json:"showId"`
	HoldID    *string        `json:"holdId,omitempty"`
	Status    BookingStatus  `json:"status"`
	SeatUIDs  []string       `json:"seatUids"`
	Customer  map[string]any `json:"customer,omitempty"`
	CreatedAt time.Time      `json:"createdAt"`
}
