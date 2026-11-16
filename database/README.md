# Database

PostgreSQL 16. The schema is owned by **Flyway** migrations in [`migrations/`](migrations/).
The backend's Maven build copies this folder onto its classpath as `db/migration`, and Flyway applies any pending migration when the backend starts.

| File | Purpose |
|---|---|
| `V1__core_schema.sql` | All tables, keys, indexes and integrity constraints |
| `V2__audit_append_only.sql` | Triggers that make `audit_event` append-only |
| `V3__default_settings.sql` | Configuration keys with starting values (editable on screen 14) |

## Rules

- **Never edit a migration that has run anywhere.** Add `V4__…sql` and so on.
- There is **no sample or demo data**. Visitor categories, acknowledgement texts, staff and vehicles are all entered through the application.
- Hibernate never changes the schema (`ddl-auto: none`). Only Flyway does.

## Local database

`docker compose up -d db` from the repository root starts PostgreSQL with the credentials in `.env` (see `.env.example`).

## Integrity guarantees enforced in SQL

- One active acknowledgement text (`ux_ack_single_active`)
- No overlapping scheduled appointments per host (`ex_appointment_overlap`, uses `btree_gist`)
- Unique daily queue token (`ux_visit_token`)
- A device tag can only be held once at a time (`ux_device_tag_held`)
- Visitor identity documents are unique per type (`ux_visitor_identity`)
- Audit log cannot be updated, deleted or truncated (`V2`)
