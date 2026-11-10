ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN phone text UNIQUE CHECK (phone ~ '^09[0-9]{9}$');
CREATE TABLE otp_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 phone text NOT NULL,
 code_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL,
 consumed boolean NOT NULL DEFAULT false
);
ALTER TABLE seat_holds ADD COLUMN user_id uuid REFERENCES users(id);
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 hold_id uuid NOT NULL UNIQUE REFERENCES seat_holds(id),
 session_id uuid NOT NULL REFERENCES event_sessions(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','REVIEW')),
 total_rial bigint NOT NULL CHECK(total_rial BETWEEN 0 AND 180000000000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(hold_id,session_id) REFERENCES seat_holds(id,session_id)
);
CREATE TABLE order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 session_id uuid NOT NULL,
 seat_id uuid NOT NULL,
 label text NOT NULL,
 price_rial bigint NOT NULL CHECK(price_rial BETWEEN 0 AND 9000000000000),
 UNIQUE(order_id,seat_id),
 FOREIGN KEY(session_id,seat_id) REFERENCES session_seats(session_id,seat_id)
);
CREATE INDEX orders_customer ON orders(user_id,created_at DESC);
