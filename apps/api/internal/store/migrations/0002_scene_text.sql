-- R9: store the scene as TEXT instead of JSONB.
--
-- The scene is only ever stored and served verbatim (Go uses domain.RawScene to
-- splice the bytes through without parsing; nothing queries inside the JSON).
-- JSONB makes Postgres parse text -> binary tree on every write and serialize
-- binary -> text on every read, which is pure O(document-size) overhead here.
-- TEXT turns both into a memcpy, and also stops JSONB's silent key reordering /
-- whitespace normalization so the bytes match exactly what the editor saved.
--
-- Idempotent: only alters the column if it is still JSONB.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'layouts' AND column_name = 'scene' AND data_type = 'jsonb'
    ) THEN
        ALTER TABLE layouts ALTER COLUMN scene DROP DEFAULT;
        ALTER TABLE layouts ALTER COLUMN scene TYPE TEXT USING scene::text;
        ALTER TABLE layouts ALTER COLUMN scene SET DEFAULT '{}';
    END IF;
END $$;
