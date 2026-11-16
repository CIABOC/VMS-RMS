-- =====================================================================
-- CIABOC RVM & VMM - core schema
-- Applied automatically by Flyway when the backend starts.
-- Never edit an applied migration; add a new V<n>__description.sql.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- used by the appointment overlap constraint

-- ---------------------------------------------------------------------
-- Staff and access
-- ---------------------------------------------------------------------
CREATE TABLE staff_user (
    id           BIGSERIAL PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    full_name    VARCHAR(200) NOT NULL,
    designation  VARCHAR(150),
    department   VARCHAR(150),
    mobile       VARCHAR(30),
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_staff_email ON staff_user (lower(email));

CREATE TABLE staff_role (
    staff_id BIGINT      NOT NULL REFERENCES staff_user (id) ON DELETE CASCADE,
    role     VARCHAR(40) NOT NULL,
    PRIMARY KEY (staff_id, role)
);

-- Maps an SSO / directory group to an application role (used once SSO is merged).
CREATE TABLE role_mapping (
    id        BIGSERIAL PRIMARY KEY,
    sso_group VARCHAR(200) NOT NULL,
    role      VARCHAR(40)  NOT NULL,
    UNIQUE (sso_group, role)
);

-- ---------------------------------------------------------------------
-- Master data (managed on screen 14)
-- ---------------------------------------------------------------------
CREATE TABLE system_setting (
    setting_key   VARCHAR(80)  PRIMARY KEY,
    setting_value VARCHAR(500) NOT NULL,
    value_type    VARCHAR(20)  NOT NULL,          -- INTEGER | TEXT | BOOLEAN
    description   VARCHAR(500),
    updated_at    TIMESTAMPTZ,
    updated_by    VARCHAR(255)
);

CREATE TABLE visitor_category (
    id                      BIGSERIAL PRIMARY KEY,
    code                    VARCHAR(30)  NOT NULL UNIQUE,
    name                    VARCHAR(120) NOT NULL,
    requires_appointment    BOOLEAN      NOT NULL DEFAULT FALSE,
    requires_device_custody BOOLEAN      NOT NULL DEFAULT FALSE,
    active                  BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE acknowledgement_text (
    id         BIGSERIAL PRIMARY KEY,
    version    INT          NOT NULL UNIQUE,
    text_en    TEXT         NOT NULL,
    text_si    TEXT         NOT NULL,
    text_ta    TEXT         NOT NULL,
    active     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by VARCHAR(255) NOT NULL
);
-- Only one acknowledgement text may be active at a time.
CREATE UNIQUE INDEX ux_ack_single_active ON acknowledgement_text (active) WHERE active;

-- ---------------------------------------------------------------------
-- Visitors and visits
-- ---------------------------------------------------------------------
CREATE TABLE visitor (
    id                   BIGSERIAL PRIMARY KEY,
    full_name            VARCHAR(200) NOT NULL,
    id_type              VARCHAR(20)  NOT NULL,   -- NIC | PASSPORT | DRIVING_LICENCE | OTHER
    id_number            VARCHAR(50)  NOT NULL,
    mobile               VARCHAR(30),
    email                VARCHAR(255),
    organization         VARCHAR(200),
    address              VARCHAR(500),
    id_scan              BYTEA,
    id_scan_content_type VARCHAR(100),
    id_scan_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by           VARCHAR(255) NOT NULL
);
CREATE UNIQUE INDEX ux_visitor_identity ON visitor (id_type, upper(id_number));
CREATE INDEX ix_visitor_name ON visitor (lower(full_name));
CREATE INDEX ix_visitor_mobile ON visitor (mobile);

CREATE TABLE appointment (
    id           BIGSERIAL PRIMARY KEY,
    host_id      BIGINT       NOT NULL REFERENCES staff_user (id),
    visitor_id   BIGINT       REFERENCES visitor (id),
    visitor_name VARCHAR(200) NOT NULL,
    purpose      VARCHAR(500),
    starts_at    TIMESTAMPTZ  NOT NULL,
    ends_at      TIMESTAMPTZ  NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED | CANCELLED | COMPLETED
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by   VARCHAR(255) NOT NULL,
    CONSTRAINT ck_appointment_range CHECK (ends_at > starts_at),
    -- Database-level guarantee that a host never has two overlapping scheduled appointments.
    CONSTRAINT ex_appointment_overlap EXCLUDE USING gist (
        host_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status = 'SCHEDULED')
);

CREATE TABLE visit (
    id                   BIGSERIAL PRIMARY KEY,
    visitor_id           BIGINT       NOT NULL REFERENCES visitor (id),
    category_id          BIGINT       NOT NULL REFERENCES visitor_category (id),
    host_id              BIGINT       NOT NULL REFERENCES staff_user (id),
    appointment_id       BIGINT       REFERENCES appointment (id),
    purpose              VARCHAR(500),
    visit_date           DATE         NOT NULL,
    token_no             INT,
    status               VARCHAR(30)  NOT NULL,
    id_verification      VARCHAR(20),               -- REUSED_SCAN | NEW_SCAN | EXCEPTION
    id_verification_note VARCHAR(500),
    verified_at          TIMESTAMPTZ,
    verified_by          VARCHAR(255),
    ack_text_id          BIGINT       REFERENCES acknowledgement_text (id),
    ack_language         VARCHAR(5),
    signature_png        TEXT,
    signed_at            TIMESTAMPTZ,
    host_response_note   VARCHAR(500),
    host_responded_at    TIMESTAMPTZ,
    delay_until          TIMESTAMPTZ,
    badge_no             VARCHAR(30),
    entry_approved_at    TIMESTAMPTZ,
    entry_approved_by    VARCHAR(255),
    checked_out_at       TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by           VARCHAR(255) NOT NULL,
    CONSTRAINT ux_visit_token UNIQUE (visit_date, token_no)
);
CREATE INDEX ix_visit_date_status ON visit (visit_date, status);
CREATE INDEX ix_visit_host ON visit (host_id, visit_date);

CREATE TABLE visit_item (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    BIGINT       NOT NULL REFERENCES visit (id) ON DELETE CASCADE,
    description VARCHAR(300) NOT NULL,
    quantity    INT          NOT NULL DEFAULT 1 CHECK (quantity > 0),
    recorded_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    recorded_by VARCHAR(255) NOT NULL
);

CREATE TABLE device_custody (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    BIGINT       NOT NULL REFERENCES visit (id),
    tag_no      VARCHAR(30)  NOT NULL,
    device_type VARCHAR(50)  NOT NULL,
    description VARCHAR(300),
    status      VARCHAR(20)  NOT NULL,              -- HELD | RETURNED
    received_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    received_by VARCHAR(255) NOT NULL,
    returned_at TIMESTAMPTZ,
    returned_by VARCHAR(255)
);
-- A physical tag can only be in use once at a time.
CREATE UNIQUE INDEX ux_device_tag_held ON device_custody (upper(tag_no)) WHERE status = 'HELD';

-- ---------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------
CREATE TABLE vehicle (
    id          BIGSERIAL PRIMARY KEY,
    plate_no    VARCHAR(20)  NOT NULL UNIQUE,       -- normalised: upper case, no spaces or dashes
    owner_type  VARCHAR(20)  NOT NULL,              -- STAFF | VISITOR | OFFICIAL | CONTRACTOR
    owner_name  VARCHAR(200),
    staff_id    BIGINT       REFERENCES staff_user (id),
    make_model  VARCHAR(100),
    colour      VARCHAR(40),
    flagged     BOOLEAN      NOT NULL DEFAULT FALSE,
    blocked     BOOLEAN      NOT NULL DEFAULT FALSE,
    flag_reason VARCHAR(500),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  VARCHAR(255) NOT NULL
);

CREATE TABLE vehicle_movement (
    id          BIGSERIAL PRIMARY KEY,
    vehicle_id  BIGINT       NOT NULL REFERENCES vehicle (id),
    direction   VARCHAR(10)  NOT NULL,              -- ENTRY | EXIT
    decision    VARCHAR(10)  NOT NULL,              -- ADMITTED | DENIED
    reason      VARCHAR(500),
    visit_id    BIGINT       REFERENCES visit (id),
    driver_name VARCHAR(200),
    gate        VARCHAR(50),
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    recorded_by VARCHAR(255) NOT NULL
);
CREATE INDEX ix_movement_vehicle ON vehicle_movement (vehicle_id, occurred_at DESC);
CREATE INDEX ix_movement_time ON vehicle_movement (occurred_at);

-- ---------------------------------------------------------------------
-- Audit (hash chained, append only - see V2)
-- ---------------------------------------------------------------------
CREATE TABLE audit_event (
    id          BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ  NOT NULL,
    actor       VARCHAR(255) NOT NULL,
    action      VARCHAR(80)  NOT NULL,
    entity_type VARCHAR(60),
    entity_id   VARCHAR(60),
    details     TEXT,
    prev_hash   CHAR(64)     NOT NULL,
    hash        CHAR(64)     NOT NULL UNIQUE
);
CREATE INDEX ix_audit_entity ON audit_event (entity_type, entity_id);
CREATE INDEX ix_audit_time ON audit_event (occurred_at);
