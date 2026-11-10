CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 authority text NOT NULL UNIQUE,
 amount_rial bigint NOT NULL CHECK(amount_rial BETWEEN 0 AND 180000000000000),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','UNKNOWN','FAILED','VERIFIED')),
 reference text UNIQUE,
 checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='VERIFIED') = (reference IS NOT NULL))
);
-- Development/test adapter storage. Never a source of truth outside FakePaymentGateway.
CREATE TABLE fake_gateway_transactions (
 request_key uuid PRIMARY KEY,
 authority text NOT NULL UNIQUE,
 amount_rial bigint NOT NULL,
 outcome text NOT NULL DEFAULT 'PENDING' CHECK(outcome IN ('PENDING','UNKNOWN','FAILED','SUCCESS')),
 reference text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id),
 session_id uuid NOT NULL,
 seat_id uuid NOT NULL,
 token text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,seat_id),
 FOREIGN KEY(session_id,seat_id) REFERENCES session_seats(session_id,seat_id)
);
CREATE INDEX payments_reconcile ON payments(checked_at) WHERE state IN ('PENDING','UNKNOWN');
