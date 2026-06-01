package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/store"
)

// CategoryStore is the postgres-backed category store.
type CategoryStore struct{ db *DB }

func (s *CategoryStore) CreateCategory(ctx context.Context, c domain.CategoryRecord) (domain.CategoryRecord, error) {
	var out domain.CategoryRecord
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO categories (venue_id, name, color, price_cents, is_standing, external_ref)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 RETURNING id, venue_id, name, color, price_cents, is_standing, external_ref, created_at, updated_at`,
		c.VenueID, c.Name, c.Color, c.PriceCents, c.IsStanding, c.ExternalRef,
	).Scan(&out.ID, &out.VenueID, &out.Name, &out.Color, &out.PriceCents, &out.IsStanding, &out.ExternalRef, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return domain.CategoryRecord{}, fmt.Errorf("create category: %w", err)
	}
	return out, nil
}

func (s *CategoryStore) ListCategories(ctx context.Context, venueID string) ([]domain.CategoryRecord, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, venue_id, name, color, price_cents, is_standing, external_ref, created_at, updated_at
		 FROM categories WHERE venue_id = $1 ORDER BY created_at ASC`, venueID)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()

	var out []domain.CategoryRecord
	for rows.Next() {
		var c domain.CategoryRecord
		if err := rows.Scan(&c.ID, &c.VenueID, &c.Name, &c.Color, &c.PriceCents, &c.IsStanding, &c.ExternalRef, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *CategoryStore) UpdateCategory(ctx context.Context, c domain.CategoryRecord) (domain.CategoryRecord, error) {
	var out domain.CategoryRecord
	err := s.db.QueryRowContext(ctx,
		`UPDATE categories SET name=$2, color=$3, price_cents=$4, is_standing=$5, external_ref=$6, updated_at=now()
		 WHERE id=$1
		 RETURNING id, venue_id, name, color, price_cents, is_standing, external_ref, created_at, updated_at`,
		c.ID, c.Name, c.Color, c.PriceCents, c.IsStanding, c.ExternalRef,
	).Scan(&out.ID, &out.VenueID, &out.Name, &out.Color, &out.PriceCents, &out.IsStanding, &out.ExternalRef, &out.CreatedAt, &out.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.CategoryRecord{}, store.ErrNotFound
	}
	if err != nil {
		return domain.CategoryRecord{}, fmt.Errorf("update category: %w", err)
	}
	return out, nil
}

func (s *CategoryStore) DeleteCategory(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM categories WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete category: %w", err)
	}
	return checkAffected(res)
}
