package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
)

// LayoutStore is the postgres-backed layout store.
type LayoutStore struct{ db *DB }

const layoutCols = `id, venue_id, name, status, scene, row_count, col_count, version, created_at, updated_at`

func scanLayout(row interface{ Scan(...any) error }) (domain.Layout, error) {
	var l domain.Layout
	var status string
	var scene []byte
	if err := row.Scan(&l.ID, &l.VenueID, &l.Name, &status, &scene, &l.RowCount, &l.ColCount, &l.Version, &l.CreatedAt, &l.UpdatedAt); err != nil {
		return domain.Layout{}, err
	}
	l.Status = domain.LayoutStatus(status)
	l.Scene = domain.RawScene(scene)
	return l, nil
}

func (s *LayoutStore) CreateLayout(ctx context.Context, venueID, name string) (domain.Layout, error) {
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO layouts (venue_id, name, scene) VALUES ($1, $2, '{}'::jsonb)
		 RETURNING `+layoutCols, venueID, name)
	l, err := scanLayout(row)
	if err != nil {
		return domain.Layout{}, fmt.Errorf("create layout: %w", err)
	}
	return l, nil
}

func (s *LayoutStore) GetLayout(ctx context.Context, id string) (domain.Layout, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+layoutCols+` FROM layouts WHERE id = $1`, id)
	l, err := scanLayout(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Layout{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Layout{}, fmt.Errorf("get layout: %w", err)
	}
	return l, nil
}

func (s *LayoutStore) ListLayouts(ctx context.Context, venueID string, limit, offset int) ([]domain.Layout, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+layoutCols+` FROM layouts WHERE venue_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, venueID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list layouts: %w", err)
	}
	defer rows.Close()

	var out []domain.Layout
	for rows.Next() {
		l, err := scanLayout(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// SaveScene replaces the scene JSON and the flattened seats atomically, bumps
// the version, and updates the row/col counts.
func (s *LayoutStore) SaveScene(ctx context.Context, id string, scene []byte, seats []domain.FlatSeat, rowCount, colCount int) (domain.Layout, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Layout{}, err
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRowContext(ctx,
		`UPDATE layouts SET scene = $2::jsonb, row_count = $3, col_count = $4,
		        version = version + 1, updated_at = now()
		 WHERE id = $1
		 RETURNING `+layoutCols, id, scene, rowCount, colCount)
	l, err := scanLayout(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Layout{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Layout{}, fmt.Errorf("save scene: %w", err)
	}

	// Replace flattened seats wholesale (simplest correct approach; layouts are
	// saved infrequently relative to reads).
	if _, err := tx.ExecContext(ctx, `DELETE FROM seats WHERE layout_id = $1`, id); err != nil {
		return domain.Layout{}, fmt.Errorf("clear seats: %w", err)
	}
	if len(seats) > 0 {
		if err := insertSeats(ctx, tx, id, seats); err != nil {
			return domain.Layout{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return domain.Layout{}, fmt.Errorf("commit save scene: %w", err)
	}
	return l, nil
}

// insertSeats bulk-inserts flattened seats using a multi-row VALUES statement,
// chunked to stay within Postgres's parameter limit.
func insertSeats(ctx context.Context, tx *sql.Tx, layoutID string, seats []domain.FlatSeat) error {
	const cols = 13
	const maxParams = 60000 // well under Postgres's 65535 limit
	chunk := maxParams / cols

	for start := 0; start < len(seats); start += chunk {
		end := start + chunk
		if end > len(seats) {
			end = len(seats)
		}
		batch := seats[start:end]

		query := `INSERT INTO seats
			(layout_id, seat_uid, label, row_label, row_num, col_num, category_id, x, y, w, h, is_standing, standing_section_id) VALUES `
		args := make([]any, 0, len(batch)*cols)
		for i, s := range batch {
			base := i * cols
			if i > 0 {
				query += ","
			}
			query += fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
				base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11, base+12, base+13)
			args = append(args,
				layoutID, s.SeatUID, s.Label, s.RowLabel, s.RowNum, s.ColNum,
				s.CategoryID, s.X, s.Y, s.Width, s.Height, s.IsStanding, s.StandingSectionID)
		}
		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("insert seats: %w", err)
		}
	}
	return nil
}

func (s *LayoutStore) UpdateLayoutMeta(ctx context.Context, id, name string, status domain.LayoutStatus) (domain.Layout, error) {
	row := s.db.QueryRowContext(ctx,
		`UPDATE layouts SET name = $2, status = $3, updated_at = now() WHERE id = $1
		 RETURNING `+layoutCols, id, name, string(status))
	l, err := scanLayout(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Layout{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Layout{}, fmt.Errorf("update layout meta: %w", err)
	}
	return l, nil
}

func (s *LayoutStore) DeleteLayout(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM layouts WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete layout: %w", err)
	}
	return checkAffected(res)
}

func (s *LayoutStore) ListSeats(ctx context.Context, layoutID string) ([]domain.FlatSeat, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT seat_uid, label, row_label, row_num, col_num, category_id, x, y, w, h, is_standing, standing_section_id
		 FROM seats WHERE layout_id = $1 ORDER BY row_num, col_num`, layoutID)
	if err != nil {
		return nil, fmt.Errorf("list seats: %w", err)
	}
	defer rows.Close()

	var out []domain.FlatSeat
	for rows.Next() {
		var s domain.FlatSeat
		if err := rows.Scan(&s.SeatUID, &s.Label, &s.RowLabel, &s.RowNum, &s.ColNum, &s.CategoryID, &s.X, &s.Y, &s.Width, &s.Height, &s.IsStanding, &s.StandingSectionID); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (s *LayoutStore) Publish(ctx context.Context, id string) (domain.Layout, error) {
	row := s.db.QueryRowContext(ctx,
		`UPDATE layouts SET status = 'published', version = version + 1, updated_at = now()
		 WHERE id = $1 RETURNING `+layoutCols, id)
	l, err := scanLayout(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Layout{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Layout{}, fmt.Errorf("publish layout: %w", err)
	}
	return l, nil
}
