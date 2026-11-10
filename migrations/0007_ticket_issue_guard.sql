CREATE FUNCTION guard_ticket_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id JOIN payments p ON p.order_id=o.id
   JOIN session_seats ss ON ss.session_id=i.session_id AND ss.seat_id=i.seat_id
   WHERE i.id=NEW.order_item_id AND i.session_id=NEW.session_id AND i.seat_id=NEW.seat_id
     AND o.status='PAID' AND p.state='VERIFIED' AND p.amount_rial=o.total_rial AND ss.status='SOLD'
 ) THEN RAISE EXCEPTION 'Tickets require verified payment and sold inventory'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_issue_guard BEFORE INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION guard_ticket_issue();
