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

// VenueStore is the postgres-backed venue store.
type VenueStore struct{ db *DB }

func (s *VenueStore) CreateVenue(ctx context.Context, name string, metadata map[string]any) (domain.VenueRecord, error) {
	meta, err := marshalJSONMap(metadata)
	if err != nil {
		return domain.VenueRecord{}, err
	}
	var v domain.VenueRecord
	var rawMeta []byte
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO venues (name, metadata) VALUES ($1, $2)
		 RETURNING id, name, metadata, created_at, updated_at`,
		name, meta,
	).Scan(&v.ID, &v.Name, &rawMeta, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return domain.VenueRecord{}, fmt.Errorf("create venue: %w", err)
	}
	v.Metadata = unmarshalJSONMap(rawMeta)
	return v, nil
}

func (s *VenueStore) GetVenue(ctx context.Context, id string) (domain.VenueRecord, error) {
	var v domain.VenueRecord
	var rawMeta []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, metadata, created_at, updated_at FROM venues WHERE id = $1`, id,
	).Scan(&v.ID, &v.Name, &rawMeta, &v.CreatedAt, &v.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.VenueRecord{}, store.ErrNotFound
	}
	if err != nil {
		return domain.VenueRecord{}, fmt.Errorf("get venue: %w", err)
	}
	v.Metadata = unmarshalJSONMap(rawMeta)
	return v, nil
}

func (s *VenueStore) ListVenues(ctx context.Context, limit, offset int) ([]domain.VenueRecord, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, metadata, created_at, updated_at FROM venues
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list venues: %w", err)
	}
	defer rows.Close()

	var out []domain.VenueRecord
	for rows.Next() {
		var v domain.VenueRecord
		var rawMeta []byte
		if err := rows.Scan(&v.ID, &v.Name, &rawMeta, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		v.Metadata = unmarshalJSONMap(rawMeta)
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *VenueStore) UpdateVenue(ctx context.Context, id, name string, metadata map[string]any) (domain.VenueRecord, error) {
	meta, err := marshalJSONMap(metadata)
	if err != nil {
		return domain.VenueRecord{}, err
	}
	var v domain.VenueRecord
	var rawMeta []byte
	err = s.db.QueryRowContext(ctx,
		`UPDATE venues SET name = $2, metadata = $3, updated_at = now() WHERE id = $1
		 RETURNING id, name, metadata, created_at, updated_at`,
		id, name, meta,
	).Scan(&v.ID, &v.Name, &rawMeta, &v.CreatedAt, &v.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.VenueRecord{}, store.ErrNotFound
	}
	if err != nil {
		return domain.VenueRecord{}, fmt.Errorf("update venue: %w", err)
	}
	v.Metadata = unmarshalJSONMap(rawMeta)
	return v, nil
}

func (s *VenueStore) DeleteVenue(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM venues WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete venue: %w", err)
	}
	return checkAffected(res)
}

// --- JSON map helpers shared by stores ---

func marshalJSONMap(m map[string]any) ([]byte, error) {
	if m == nil {
		return []byte("{}"), nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("marshal json: %w", err)
	}
	return b, nil
}

func unmarshalJSONMap(b []byte) map[string]any {
	if len(b) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil
	}
	if len(m) == 0 {
		return nil
	}
	return m
}

func checkAffected(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return store.ErrNotFound
	}
	return nil
}
