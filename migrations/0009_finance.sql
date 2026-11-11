CREATE TABLE financial_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES events(id),
 commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 fixed_rial bigint NOT NULL CHECK(fixed_rial BETWEEN 0 AND 9000000000000),
 tax_bps integer NOT NULL CHECK(tax_bps BETWEEN 0 AND 10000),
 deduction_rial bigint NOT NULL CHECK(deduction_rial BETWEEN 0 AND 9000000000000),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX financial_terms_event ON financial_terms(event_id,sequence DESC);
CREATE TABLE order_financials (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 terms_id uuid NOT NULL REFERENCES financial_terms(id),
 gross_rial bigint NOT NULL CHECK(gross_rial BETWEEN 0 AND 180000000000000),
 commission_rial bigint NOT NULL CHECK(commission_rial>=0),
 tax_rial bigint NOT NULL CHECK(tax_rial>=0),
 deduction_rial bigint NOT NULL CHECK(deduction_rial>=0),
 net_rial bigint NOT NULL CHECK(net_rial>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(gross_rial=commission_rial+tax_rial+deduction_rial+net_rial)
);
CREATE TABLE refund_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 amount_rial bigint NOT NULL CHECK(amount_rial BETWEEN 0 AND 180000000000000),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refund_completions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 refund_id uuid NOT NULL UNIQUE REFERENCES refund_requests(id),
 reference text NOT NULL UNIQUE CHECK(length(reference) BETWEEN 3 AND 200),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settlements (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES events(id),
 amount_rial bigint NOT NULL CHECK(amount_rial BETWEEN 1 AND 180000000000000),
 reference text NOT NULL UNIQUE CHECK(length(reference) BETWEEN 3 AND 200),
 recipient text NOT NULL CHECK(length(recipient) BETWEEN 3 AND 200),
 note text NOT NULL CHECK(length(note) BETWEEN 3 AND 1000),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settlement_reversals (
 settlement_id uuid PRIMARY KEY REFERENCES settlements(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 message text NOT NULL CHECK(length(message) BETWEEN 3 AND 2000),
 actor_id uuid NOT NULL REFERENCES users(id),
 customer_visible boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support_resolutions (
 request_id uuid PRIMARY KEY REFERENCES support_requests(id),
 response text NOT NULL CHECK(length(response) BETWEEN 3 AND 2000),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_terms','order_financials','refund_requests','refund_completions','settlements','settlement_reversals','support_requests','support_resolutions'] LOOP
   EXECUTE format('CREATE TRIGGER finance_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_logs()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['orders','order_items','payments','tickets'] LOOP
   EXECUTE format('CREATE TRIGGER finance_no_delete BEFORE DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_logs()',t);
 END LOOP;
END $$;

CREATE FUNCTION snapshot_order_finance(order_key uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; term financial_terms; c bigint; t bigint; d bigint;
BEGIN
 SELECT o.total_rial,e.id event_id INTO r FROM orders o JOIN event_sessions es ON es.id=o.session_id JOIN events e ON e.id=es.event_id
 JOIN payments p ON p.order_id=o.id WHERE o.id=order_key AND p.state='VERIFIED';
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO term FROM financial_terms WHERE event_id=r.event_id ORDER BY sequence DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 c := LEAST(r.total_rial, floor(r.total_rial::numeric*term.commission_bps/10000)+term.fixed_rial);
 t := LEAST(r.total_rial-c, floor(c::numeric*term.tax_bps/10000));
 d := LEAST(r.total_rial-c-t,term.deduction_rial);
 INSERT INTO order_financials(order_id,terms_id,gross_rial,commission_rial,tax_rial,deduction_rial,net_rial)
 VALUES(order_key,term.id,r.total_rial,c,t,d,r.total_rial-c-t-d) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION snapshot_verified_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='VERIFIED' THEN PERFORM snapshot_order_finance(NEW.order_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_finance_snapshot AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION snapshot_verified_payment();

CREATE FUNCTION protect_verified_money() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='VERIFIED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Verified payment is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_verified_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_verified_money();
CREATE FUNCTION protect_paid_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('PAID','REVIEW') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Paid order is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER paid_order_immutable BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_paid_order();
CREATE FUNCTION protect_paid_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM payments WHERE order_id=OLD.order_id AND state='VERIFIED') THEN RAISE EXCEPTION 'Paid item is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER paid_item_immutable BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION protect_paid_item();
