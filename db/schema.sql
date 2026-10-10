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
