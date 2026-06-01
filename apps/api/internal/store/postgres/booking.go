package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
)

// BookingStore is the postgres-backed holds + bookings store. All seat-claiming
// operations lock the target seat_status rows with SELECT ... FOR UPDATE so two
// concurrent requests cannot claim the same seat.
type BookingStore struct{ db *DB }

// CreateHold locks the requested seats, verifies they are all available, marks
// them held under a new hold, and returns it. Fails with ErrConflict if any
// seat is unavailable.
func (s *BookingStore) CreateHold(ctx context.Context, showID string, seatUIDs []string, ttlSeconds int) (domain.Hold, error) {
	if len(seatUIDs) == 0 {
		return domain.Hold{}, fmt.Errorf("%w: no seats requested", store.ErrConflict)
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return domain.Hold{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if err := lockAndCheckAvailable(ctx, tx, showID, seatUIDs); err != nil {
		return domain.Hold{}, err
	}

	var hold domain.Hold
	var status string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO holds (show_id, expires_at)
		 VALUES ($1, now() + make_interval(secs => $2))
		 RETURNING id, show_id, status, expires_at, created_at`,
		showID, ttlSeconds,
	).Scan(&hold.ID, &hold.ShowID, &status, &hold.ExpiresAt, &hold.CreatedAt)
	if err != nil {
		return domain.Hold{}, fmt.Errorf("create hold: %w", err)
	}
	hold.Status = domain.HoldStatus(status)
	hold.SeatUIDs = seatUIDs

	if _, err := tx.ExecContext(ctx,
		`UPDATE seat_status SET state = $3, hold_id = $4, updated_at = now()
		 WHERE show_id = $1 AND seat_uid = ANY($2)`,
		showID, seatUIDs, int16(domain.SeatHeld), hold.ID,
	); err != nil {
		return domain.Hold{}, fmt.Errorf("mark held: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return domain.Hold{}, fmt.Errorf("commit hold: %w", err)
	}
	return hold, nil
}

// lockAndCheckAvailable locks the seat_status rows for the given seats and
// returns ErrConflict unless all exist and are currently available.
func lockAndCheckAvailable(ctx context.Context, tx *sql.Tx, showID string, seatUIDs []string) error {
	rows, err := tx.QueryContext(ctx,
		`SELECT seat_uid, state FROM seat_status
		 WHERE show_id = $1 AND seat_uid = ANY($2)
		 ORDER BY seat_uid
		 FOR UPDATE`,
		showID, seatUIDs)
	if err != nil {
		return fmt.Errorf("lock seats: %w", err)
	}
	defer rows.Close()

	found := map[string]domain.SeatState{}
	for rows.Next() {
		var uid string
		var state int16
		if err := rows.Scan(&uid, &state); err != nil {
			return err
		}
		found[uid] = domain.SeatState(state)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	var unavailable []string
	for _, uid := range seatUIDs {
		st, ok := found[uid]
		if !ok {
			return fmt.Errorf("%w: seat %q not found in show", store.ErrNotFound, uid)
		}
		if st != domain.SeatAvailable {
			unavailable = append(unavailable, uid)
		}
	}
	if len(unavailable) > 0 {
		return fmt.Errorf("%w: seats not available: %s", store.ErrConflict, strings.Join(unavailable, ", "))
	}
	return nil
}

func (s *BookingStore) GetHold(ctx context.Context, id string) (domain.Hold, error) {
	var h domain.Hold
	var status string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, show_id, status, expires_at, created_at FROM holds WHERE id = $1`, id,
	).Scan(&h.ID, &h.ShowID, &status, &h.ExpiresAt, &h.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Hold{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Hold{}, fmt.Errorf("get hold: %w", err)
	}
	h.Status = domain.HoldStatus(status)
	h.SeatUIDs, err = s.holdSeatUIDs(ctx, id)
	if err != nil {
		return domain.Hold{}, err
	}
	return h, nil
}

func (s *BookingStore) holdSeatUIDs(ctx context.Context, holdID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT seat_uid FROM seat_status WHERE hold_id = $1`, holdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		out = append(out, uid)
	}
	return out, rows.Err()
}

// ReleaseHold releases an active hold and frees its seats (those still held by
// this hold) back to available.
func (s *BookingStore) ReleaseHold(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx,
		`UPDATE holds SET status = 'released' WHERE id = $1 AND status = 'active'`, id)
	if err != nil {
		return fmt.Errorf("release hold: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Either not found or not active; treat missing as not found.
		var exists bool
		if err := tx.QueryRowContext(ctx, `SELECT exists(SELECT 1 FROM holds WHERE id = $1)`, id).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return store.ErrNotFound
		}
		return tx.Commit() // already inactive; nothing to free
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE seat_status SET state = $2, hold_id = NULL, updated_at = now()
		 WHERE hold_id = $1 AND state = $3`,
		id, int16(domain.SeatAvailable), int16(domain.SeatHeld)); err != nil {
		return fmt.Errorf("free seats: %w", err)
	}
	return tx.Commit()
}

// ExpireDueHolds releases all active holds past expiry and frees their seats.
func (s *BookingStore) ExpireDueHolds(ctx context.Context) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	// Free seats still held by expired holds.
	if _, err := tx.ExecContext(ctx,
		`UPDATE seat_status ss SET state = $1, hold_id = NULL, updated_at = now()
		 FROM holds h
		 WHERE ss.hold_id = h.id AND h.status = 'active' AND h.expires_at <= now()
		   AND ss.state = $2`,
		int16(domain.SeatAvailable), int16(domain.SeatHeld)); err != nil {
		return 0, fmt.Errorf("free expired seats: %w", err)
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at <= now()`)
	if err != nil {
		return 0, fmt.Errorf("expire holds: %w", err)
	}
	n, _ := res.RowsAffected()
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(n), nil
}

// CreateBooking books seats either by consuming an active hold or by directly
// locking and booking the given seats. It is concurrency-safe via row locks.
func (s *BookingStore) CreateBooking(ctx context.Context, showID string, holdID *string, seatUIDs []string, customer map[string]any) (domain.Booking, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return domain.Booking{}, err
	}
	defer func() { _ = tx.Rollback() }()

	// Determine the set of seats to book.
	seats := seatUIDs
	if holdID != nil {
		// Validate the hold is active and not expired; gather its seats.
		var status string
		var expired bool
		err := tx.QueryRowContext(ctx,
			`SELECT status, (expires_at <= now()) FROM holds WHERE id = $1 FOR UPDATE`, *holdID,
		).Scan(&status, &expired)
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Booking{}, fmt.Errorf("%w: hold not found", store.ErrNotFound)
		}
		if err != nil {
			return domain.Booking{}, err
		}
		if status != string(domain.HoldActive) || expired {
			return domain.Booking{}, fmt.Errorf("%w: hold not active", store.ErrConflict)
		}
		held, err := txHoldSeatUIDs(ctx, tx, *holdID)
		if err != nil {
			return domain.Booking{}, err
		}
		if len(held) == 0 {
			return domain.Booking{}, fmt.Errorf("%w: hold has no seats", store.ErrConflict)
		}
		seats = held
	} else {
		// Direct booking: lock and ensure the seats are available.
		if err := lockAndCheckAvailable(ctx, tx, showID, seats); err != nil {
			return domain.Booking{}, err
		}
	}

	custJSON, err := marshalJSONMap(customer)
	if err != nil {
		return domain.Booking{}, err
	}

	var b domain.Booking
	var bStatus string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO bookings (show_id, hold_id, customer) VALUES ($1, $2, $3)
		 RETURNING id, show_id, status, created_at`,
		showID, holdID, custJSON,
	).Scan(&b.ID, &b.ShowID, &bStatus, &b.CreatedAt)
	if err != nil {
		return domain.Booking{}, fmt.Errorf("create booking: %w", err)
	}
	b.Status = domain.BookingStatus(bStatus)
	b.HoldID = holdID
	b.SeatUIDs = seats
	b.Customer = customer

	// Mark seats booked.
	if _, err := tx.ExecContext(ctx,
		`UPDATE seat_status SET state = $3, booking_id = $4, hold_id = NULL, updated_at = now()
		 WHERE show_id = $1 AND seat_uid = ANY($2)`,
		showID, seats, int16(domain.SeatBooked), b.ID,
	); err != nil {
		return domain.Booking{}, fmt.Errorf("mark booked: %w", err)
	}

	// Consume the hold if one was used.
	if holdID != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE holds SET status = 'consumed' WHERE id = $1`, *holdID); err != nil {
			return domain.Booking{}, fmt.Errorf("consume hold: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return domain.Booking{}, fmt.Errorf("commit booking: %w", err)
	}
	return b, nil
}

func txHoldSeatUIDs(ctx context.Context, tx *sql.Tx, holdID string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT seat_uid FROM seat_status WHERE hold_id = $1 FOR UPDATE`, holdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		out = append(out, uid)
	}
	return out, rows.Err()
}

func (s *BookingStore) GetBooking(ctx context.Context, id string) (domain.Booking, error) {
	var b domain.Booking
	var status string
	var holdID sql.NullString
	var custJSON []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT id, show_id, hold_id, status, customer, created_at FROM bookings WHERE id = $1`, id,
	).Scan(&b.ID, &b.ShowID, &holdID, &status, &custJSON, &b.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Booking{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Booking{}, fmt.Errorf("get booking: %w", err)
	}
	b.Status = domain.BookingStatus(status)
	if holdID.Valid {
		b.HoldID = &holdID.String
	}
	b.Customer = unmarshalJSONMap(custJSON)

	rows, err := s.db.QueryContext(ctx, `SELECT seat_uid FROM seat_status WHERE booking_id = $1`, id)
	if err != nil {
		return domain.Booking{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return domain.Booking{}, err
		}
		b.SeatUIDs = append(b.SeatUIDs, uid)
	}
	return b, rows.Err()
}
