CREATE TABLE app_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_meta(key, value) VALUES ('schema_version', '0');
