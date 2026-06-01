-- 0001_init.sql — initial schema for the seat-layout API.
-- Idempotent: safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- Venues: top-level container.
CREATE TABLE IF NOT EXISTS venues (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories: seat types / price tiers, scoped to a venue.
CREATE TABLE IF NOT EXISTS categories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id     UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '',
    price_cents  INTEGER NOT NULL DEFAULT 0,
    is_standing  BOOLEAN NOT NULL DEFAULT false,
    external_ref TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_venue ON categories(venue_id);

-- Layouts: the editable scene document plus derived counts.
CREATE TABLE IF NOT EXISTS layouts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id   UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft',
    scene      JSONB NOT NULL DEFAULT '{}'::jsonb,
    row_count  INTEGER NOT NULL DEFAULT 0,
    col_count  INTEGER NOT NULL DEFAULT 0,
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_layouts_venue ON layouts(venue_id);

-- Seats: flattened from a layout's scene on save. Queryable, integration-ready.
CREATE TABLE IF NOT EXISTS seats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id           UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    seat_uid            TEXT NOT NULL,
    label               TEXT NOT NULL DEFAULT '',
    row_label           TEXT NOT NULL DEFAULT '',
    row_num             INTEGER NOT NULL DEFAULT 0,
    col_num             INTEGER NOT NULL DEFAULT 0,
    category_id         TEXT NOT NULL DEFAULT '',
    x                   DOUBLE PRECISION NOT NULL DEFAULT 0,
    y                   DOUBLE PRECISION NOT NULL DEFAULT 0,
    w                   DOUBLE PRECISION NOT NULL DEFAULT 0,
    h                   DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_standing         BOOLEAN NOT NULL DEFAULT false,
    standing_section_id TEXT NOT NULL DEFAULT '',
    UNIQUE (layout_id, seat_uid)
);
CREATE INDEX IF NOT EXISTS idx_seats_layout ON seats(layout_id);

-- Shows: a performance/screening instance of a layout.
CREATE TABLE IF NOT EXISTS shows (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id    UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT '',
    starts_at    TIMESTAMPTZ,
    status       TEXT NOT NULL DEFAULT 'scheduled',
    external_ref TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shows_layout ON shows(layout_id);

-- Holds: time-bounded reservations prior to booking.
CREATE TABLE IF NOT EXISTS holds (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id    UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holds_show ON holds(show_id);
CREATE INDEX IF NOT EXISTS idx_holds_active_expiry ON holds(expires_at) WHERE status = 'active';

-- Bookings: confirmed purchases.
CREATE TABLE IF NOT EXISTS bookings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id    UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    hold_id    UUID REFERENCES holds(id) ON DELETE SET NULL,
    status     TEXT NOT NULL DEFAULT 'confirmed',
    customer   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_show ON bookings(show_id);

-- Per-show seat availability. Composite PK (show_id, seat_uid) is the join key
-- to a layout's flattened seats.
CREATE TABLE IF NOT EXISTS seat_status (
    show_id      UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    seat_uid     TEXT NOT NULL,
    state        SMALLINT NOT NULL DEFAULT 0,   -- 0 available,1 held,2 booked,3 blocked
    reserve_type SMALLINT NOT NULL DEFAULT 1,
    price_cents  INTEGER NOT NULL DEFAULT 0,
    hold_id      UUID REFERENCES holds(id) ON DELETE SET NULL,
    booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (show_id, seat_uid)
);
CREATE INDEX IF NOT EXISTS idx_seat_status_show_state ON seat_status(show_id, state);
