-- The audit log is append only. Any UPDATE or DELETE is rejected by the database itself,
-- so even a compromised application account cannot rewrite history.
CREATE OR REPLACE FUNCTION audit_event_block_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_event is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_event_no_update
    BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION audit_event_block_change();

CREATE TRIGGER trg_audit_event_no_truncate
    BEFORE TRUNCATE ON audit_event
    FOR EACH STATEMENT EXECUTE FUNCTION audit_event_block_change();
