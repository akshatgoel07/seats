package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
)

// ShowStore is the postgres-backed show + seat-status store.
type ShowStore struct{ db *DB }

const showCols = `id, layout_id, name, starts_at, status, external_ref, created_at`

func scanShow(row interface{ Scan(...any) error }) (domain.Show, error) {
	var sh domain.Show
	var status string
	var startsAt sql.NullTime
	if err := row.Scan(&sh.ID, &sh.LayoutID, &sh.Name, &startsAt, &status, &sh.ExternalRef, &sh.CreatedAt); err != nil {
		return domain.Show{}, err
	}
	sh.Status = domain.ShowStatus(status)
	if startsAt.Valid {
		t := startsAt.Time
		sh.StartsAt = &t
	}
	return sh, nil
}

// CreateShow inserts the show and seeds seat_status for every flattened seat as
// available, with the price from the seat's category (prices map), atomically.
func (s *ShowStore) CreateShow(ctx context.Context, layoutID, name string, sh domain.Show, seats []domain.FlatSeat, prices map[string]int) (domain.Show, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Show{}, err
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRowContext(ctx,
		`INSERT INTO shows (layout_id, name, starts_at, status, external_ref)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+showCols,
		layoutID, name, sh.StartsAt, string(orShowStatus(sh.Status)), sh.ExternalRef)
	created, err := scanShow(row)
	if err != nil {
		return domain.Show{}, fmt.Errorf("create show: %w", err)
	}

	if len(seats) > 0 {
		if err := seedSeatStatus(ctx, tx, created.ID, seats, prices); err != nil {
			return domain.Show{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return domain.Show{}, fmt.Errorf("commit create show: %w", err)
	}
	return created, nil
}

func orShowStatus(s domain.ShowStatus) domain.ShowStatus {
	if s == "" {
		return domain.ShowStatusScheduled
	}
	return s
}

// seedSeatStatus bulk-inserts an available status row per seat.
func seedSeatStatus(ctx context.Context, tx *sql.Tx, showID string, seats []domain.FlatSeat, prices map[string]int) error {
	const cols = 4
	const maxParams = 60000
	chunk := maxParams / cols

	for start := 0; start < len(seats); start += chunk {
		end := start + chunk
		if end > len(seats) {
			end = len(seats)
		}
		batch := seats[start:end]

		query := `INSERT INTO seat_status (show_id, seat_uid, state, price_cents) VALUES `
		args := make([]any, 0, len(batch)*cols)
		for i, st := range batch {
			base := i * cols
			if i > 0 {
				query += ","
			}
			query += fmt.Sprintf("($%d,$%d,$%d,$%d)", base+1, base+2, base+3, base+4)
			args = append(args, showID, st.SeatUID, int16(domain.SeatAvailable), prices[st.CategoryID])
		}
		query += ` ON CONFLICT (show_id, seat_uid) DO NOTHING`
		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("seed seat status: %w", err)
		}
	}
	return nil
}

func (s *ShowStore) GetShow(ctx context.Context, id string) (domain.Show, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+showCols+` FROM shows WHERE id = $1`, id)
	sh, err := scanShow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Show{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Show{}, fmt.Errorf("get show: %w", err)
	}
	return sh, nil
}

func (s *ShowStore) ListShows(ctx context.Context, layoutID string, limit, offset int) ([]domain.Show, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+showCols+` FROM shows WHERE layout_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, layoutID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list shows: %w", err)
	}
	defer rows.Close()

	var out []domain.Show
	for rows.Next() {
		sh, err := scanShow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

func (s *ShowStore) DeleteShow(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM shows WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete show: %w", err)
	}
	return checkAffected(res)
}

func (s *ShowStore) SeatStatuses(ctx context.Context, showID string) ([]domain.SeatStatus, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT seat_uid, state, reserve_type, price_cents, hold_id, booking_id
		 FROM seat_status WHERE show_id = $1`, showID)
	if err != nil {
		return nil, fmt.Errorf("seat statuses: %w", err)
	}
	defer rows.Close()

	out := make([]domain.SeatStatus, 0, 1024)
	for rows.Next() {
		var st domain.SeatStatus
		var state, reserve int16
		var holdID, bookingID sql.NullString
		if err := rows.Scan(&st.SeatUID, &state, &reserve, &st.PriceCents, &holdID, &bookingID); err != nil {
			return nil, err
		}
		st.State = domain.SeatState(state)
		st.ReserveType = domain.ReserveType(reserve)
		if holdID.Valid {
			st.HoldID = &holdID.String
		}
		if bookingID.Valid {
			st.BookingID = &bookingID.String
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// SeatStatusesJSON builds the per-seat status array as JSON in Postgres so the
// read path skips per-row Scan + Go marshal. Aliases match SeatStatus json tags.
func (s *ShowStore) SeatStatusesJSON(ctx context.Context, showID string) (json.RawMessage, error) {
	var raw []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
		   SELECT seat_uid AS "seatUid", state, reserve_type AS "reserveType",
		          price_cents AS "priceCents", hold_id AS "holdId", booking_id AS "bookingId"
		   FROM seat_status WHERE show_id = $1
		 ) t`, showID).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("seat statuses json: %w", err)
	}
	return json.RawMessage(raw), nil
}

// SeatStatusVersion returns a cheap freshness token (row count + latest update)
// for ETag validation of the seats endpoint.
func (s *ShowStore) SeatStatusVersion(ctx context.Context, showID string) (string, error) {
	var token string
	err := s.db.QueryRowContext(ctx,
		`SELECT count(*)::text || '-' || COALESCE(max(extract(epoch from updated_at))::bigint, 0)::text
		 FROM seat_status WHERE show_id = $1`, showID).Scan(&token)
	if err != nil {
		return "", fmt.Errorf("seat status version: %w", err)
	}
	return token, nil
}

// SetSeatStates applies admin updates to specific seats. Each update touches
// only the non-nil fields. Runs in one transaction.
func (s *ShowStore) SetSeatStates(ctx context.Context, showID string, updates []store.SeatStateUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	for _, u := range updates {
		// COALESCE keeps existing values for nil fields.
		var state, reserve, price sql.NullInt32
		if u.State != nil {
			state = sql.NullInt32{Int32: int32(*u.State), Valid: true}
		}
		if u.ReserveType != nil {
			reserve = sql.NullInt32{Int32: int32(*u.ReserveType), Valid: true}
		}
		if u.PriceCents != nil {
			price = sql.NullInt32{Int32: int32(*u.PriceCents), Valid: true}
		}
		res, err := tx.ExecContext(ctx,
			`UPDATE seat_status SET
			   state = COALESCE($3, state),
			   reserve_type = COALESCE($4, reserve_type),
			   price_cents = COALESCE($5, price_cents),
			   updated_at = now()
			 WHERE show_id = $1 AND seat_uid = $2`,
			showID, u.SeatUID, nullInt16(state), nullInt16(reserve), nullInt16(price))
		if err != nil {
			return fmt.Errorf("set seat state: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("%w: seat %q not in show", store.ErrNotFound, u.SeatUID)
		}
	}
	return tx.Commit()
}

// nullInt16 converts a NullInt32 to a driver value usable for SMALLINT columns.
func nullInt16(v sql.NullInt32) any {
	if !v.Valid {
		return nil
	}
	return v.Int32
}
