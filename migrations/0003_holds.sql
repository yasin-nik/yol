CREATE TABLE seat_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES event_sessions(id),
  owner_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED')),
  payment_state text NOT NULL DEFAULT 'NONE' CHECK (payment_state IN ('NONE','PENDING','UNKNOWN','VERIFIED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  UNIQUE(id,session_id)
);
CREATE UNIQUE INDEX one_active_hold_per_browser_session ON seat_holds(session_id,owner_hash) WHERE status='ACTIVE';
CREATE INDEX holds_expiry ON seat_holds(session_id,expires_at) WHERE status='ACTIVE' AND payment_state='NONE';
ALTER TABLE session_seats ADD COLUMN hold_id uuid;
ALTER TABLE session_seats ADD CONSTRAINT hold_same_session FOREIGN KEY(hold_id,session_id) REFERENCES seat_holds(id,session_id);
ALTER TABLE session_seats ADD CONSTRAINT held_has_owner CHECK ((status='HELD') = (hold_id IS NOT NULL));
