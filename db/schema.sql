-- Applied by `npm run db:migrate` (idempotent). Tests load it into PGlite.

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  prompt text NOT NULL,
  model text NOT NULL,
  quality text NOT NULL,
  output_format text NOT NULL,
  reference jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS templates_name_key ON templates (lower(name));

CREATE TABLE IF NOT EXISTS dresses (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  file_name text NOT NULL UNIQUE,
  image jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No foreign key to templates: jobs (and their results) outlive a deleted template.
-- Added after launch; kept as ALTERs so re-running the migration upgrades existing databases.
ALTER TABLE dresses ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT '{}';

ALTER TABLE dresses ADD COLUMN IF NOT EXISTS price numeric(12, 2);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL,
  template_snapshot jsonb NOT NULL,
  original_name text NOT NULL,
  source jsonb NOT NULL,
  dress_id uuid REFERENCES dresses (id),
  size text,
  status text NOT NULL,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS jobs_template_created_idx ON jobs (template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);

-- Store owner's inbox: raw photos uploaded for download, grouped by batch.
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  note text,
  original_name text NOT NULL,
  image jsonb NOT NULL,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz
);

CREATE INDEX IF NOT EXISTS uploads_created_idx ON uploads (created_at DESC);

-- Dresses (Shopify products): one price, sizes, colours; photos per colour (front, back).
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY,
  name text,
  handle text UNIQUE,
  price numeric(12, 2) NOT NULL,
  sizes text[] NOT NULL,
  note text,
  template_id uuid,
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_colors (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL,
  quantities jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS product_colors_product_idx ON product_colors (product_id, position);

CREATE TABLE IF NOT EXISTS product_photos (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  color_id uuid NOT NULL REFERENCES product_colors (id) ON DELETE CASCADE,
  view text NOT NULL,
  source jsonb NOT NULL,
  output jsonb,
  UNIQUE (color_id, view)
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS photo_id uuid;

CREATE INDEX IF NOT EXISTS jobs_photo_idx ON jobs (photo_id, created_at DESC);

-- generated: photos edited by the app · completed: photos uploaded already edited.
ALTER TABLE products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'generated';
