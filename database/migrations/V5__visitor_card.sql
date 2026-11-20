-- Temporary visitor NFC cards. The card itself holds the visitor's details (signed by the server);
-- this table records which physical card (by UID) was issued for which visit, and when it came back.
CREATE TABLE visitor_card (
    id             BIGSERIAL PRIMARY KEY,
    visit_id       BIGINT       NOT NULL REFERENCES visit (id),
    card_uid       VARCHAR(32)  NOT NULL,
    card_type      VARCHAR(40),
    payload_sha256 CHAR(64)     NOT NULL,
    payload_bytes  INT          NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'ISSUED',   -- ISSUED, RETURNED, REPLACED, LOST
    issued_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    issued_by      VARCHAR(255) NOT NULL,
    returned_at    TIMESTAMPTZ,
    returned_by    VARCHAR(255),
    erased         BOOLEAN      NOT NULL DEFAULT FALSE,
    note           VARCHAR(500)
);

CREATE INDEX ix_visitor_card_visit ON visitor_card (visit_id);
-- A physical card can be out with only one visitor at a time.
CREATE UNIQUE INDEX ux_visitor_card_active_uid ON visitor_card (card_uid) WHERE status = 'ISSUED';
