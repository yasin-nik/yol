CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'CHECK_IN', 'CUSTOMER')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  resets_at timestamptz NOT NULL
);
CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);
CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id),
  name text NOT NULL,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  name text NOT NULL,
  position integer NOT NULL,
  UNIQUE(venue_id, name),
  UNIQUE(venue_id, position)
);
CREATE TABLE seat_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id),
  position integer NOT NULL CHECK (position > 0),
  UNIQUE(section_id, position)
);
CREATE TABLE seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL REFERENCES seat_rows(id),
  number integer NOT NULL CHECK (number > 0),
  accessible boolean NOT NULL DEFAULT false,
  UNIQUE(row_id, number)
);
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  max_seats integer NOT NULL DEFAULT 6 CHECK (max_seats BETWEEN 1 AND 20),
  hold_minutes integer NOT NULL DEFAULT 10 CHECK (hold_minutes BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  starts_at timestamptz NOT NULL,
  published boolean NOT NULL DEFAULT false,
  UNIQUE(event_id, venue_id, starts_at)
);
CREATE TABLE session_seats (
  session_id uuid NOT NULL REFERENCES event_sessions(id),
  seat_id uuid NOT NULL REFERENCES seats(id),
  price_rial bigint NOT NULL CHECK (price_rial BETWEEN 0 AND 9000000000000),
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD', 'BLOCKED')),
  PRIMARY KEY(session_id, seat_id)
);
CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_audit_logs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is append-only';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_logs();
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX event_sessions_event ON event_sessions(event_id);
