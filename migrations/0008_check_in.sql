ALTER TABLE users ADD COLUMN local_only boolean NOT NULL DEFAULT false;
CREATE TABLE check_in_assignments (
 user_id uuid NOT NULL REFERENCES users(id),
 session_id uuid NOT NULL REFERENCES event_sessions(id),
 PRIMARY KEY(user_id,session_id)
);
CREATE TABLE check_ins (
 ticket_id uuid PRIMARY KEY REFERENCES tickets(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER check_ins_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON check_ins
FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_logs();
