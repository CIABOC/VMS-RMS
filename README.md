# CIABOC Reception, Visitor Management & Vehicle Movement Management (RVM & VMM)

A secure front-desk and gate system for the Commission to Investigate Allegations of Bribery or Corruption (CIABOC). It covers four things:

- registering and identifying visitors
- capturing a signed acknowledgement for every visit
- routing each visitor to the host officer, who accepts, delays, redirects or declines
- controlling vehicles at the gate

Every action is written to an audit log that cannot be edited.

The system implements the 15 screens of the UI prototype (SRS Draft 1.2) as a working application:

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, React Router, plain CSS design tokens (no UI framework) |
| Backend | Java 21, Spring Boot 3.5 (Web, Security, Data JPA, Validation, Actuator) |
| Database | PostgreSQL 16, schema managed by Flyway |
| Packaging | Docker images for backend and frontend (nginx), `docker-compose.yml` for a full stack |

---

## 1. Project status

| Item | Status |
|---|---|
| 15 screens built and wired to the API | Done |
| Hard-coded and dummy data removed: every figure and list comes from PostgreSQL | Done |
| Fixes for the problems found in the prototype review (see §9) | Done |
| Backend unit tests | 3 passing |
| End-to-end API smoke test (`scripts/smoke-test.mjs`, 111 checks) | Passing on a clean database |
| Frontend production build | Passing |
| Single Sign-On | **Not yet connected.** The sign-in page (screen 01) stays as the SSO landing page so SSO can be merged there (see §6) |
| Official CIABOC logo | Styled to the CIABOC Account template. Crest image cut from a screenshot; replace `frontend/public/brand/crest.png` with the original file before go-live |
| Manual UI test in a browser by the business team | Pending (UAT) |

---

## 2. Repository structure

```
.
├── backend/                     Spring Boot API (Java 21, Maven)
│   ├── Dockerfile
│   ├── pom.xml                  also packages ../database/migrations as classpath:db/migration
│   └── src/main/java/lk/gov/ciaboc/rvm/
│       ├── config/              security, app properties, first-admin bootstrap
│       ├── security/            roles and authentication endpoints
│       ├── common/              errors, current user, helpers
│       ├── audit/               hash-chained audit log (screen 15)
│       ├── staff/               staff accounts
│       ├── masterdata/          settings, categories, acknowledgement texts, role mapping (screen 14)
│       ├── visitor/             visitor profiles and identity scans (03, 04)
│       ├── visit/               visit lifecycle, host inbox, public queue (04–08)
│       ├── appointment/         host calendars (09)
│       ├── vehicle/             gate console and vehicle movements (10, 11)
│       ├── device/              device custody (12)
│       └── dashboard/           reception, gate and management dashboards (02, 11, 13)
├── frontend/                    React single-page app
│   ├── Dockerfile, nginx.conf   production image, proxies /api to the backend
│   └── src/
│       ├── api/                 fetch client (session cookie + CSRF header)
│       ├── auth/                auth context and route guard
│       ├── config/              screens.js (single source for menu, home and counts), roles.js
│       ├── components/          layout, crest, signature pad, shared UI
│       ├── hooks/               data loading and live polling
│       ├── pages/               one file per screen
│       ├── styles/theme.css     design tokens and components
│       └── utils/               formatting and label maps
├── database/
│   ├── migrations/              Flyway SQL migrations (schema, audit protection, settings)
│   └── README.md                database rules and guarantees
├── scripts/smoke-test.mjs       end-to-end API test (test environments only)
├── docker-compose.yml           PostgreSQL, plus backend and frontend with --profile full
├── .env.example                 every environment variable, documented
└── README.md
```

---

## 3. Roles and screens

There are six roles. A staff member can hold several roles.

| Role | What they do |
|---|---|
| Receptionist | Registers visitors, verifies identity, captures signatures, approves entry, takes devices, books appointments |
| Host officer | Answers their own visitors (accept, delay, redirect or decline) and keeps their own calendar |
| Gate officer | Looks up vehicles and records entry, exit and denial |
| Security supervisor | Everything a gate officer does, plus flagging and blocking vehicles, overriding blocks and reading the audit log |
| Management | Sees aggregate indicators only, never personal details |
| System administrator | Manages master data, staff, roles and SSO mapping, and reads the audit log |

| # | Screen | Route | Roles |
|---|---|---|---|
| 01 | SSO sign-in | `/sign-in` | public |
| 02 | Reception dashboard | `/reception` | Receptionist |
| 03 | Register visitor | `/visits/new` | Receptionist |
| 04 | Identity verification | `/visits/:id/verify` | Receptionist |
| 05 | Signature capture | `/visits/:id/sign` | Receptionist |
| 06 | Live queue board, and the public token display | `/queue`, `/display/queue` (public) | Receptionist |
| 07 | Visit detail | `/visits/:id` | Receptionist |
| 08 | Host officer inbox (mobile-first) | `/host` | Host officer |
| 09 | Appointments | `/appointments` | Receptionist, Host officer |
| 10 | Gate console | `/gate` | Gate officer, Security supervisor |
| 11 | Gate and security dashboard | `/gate/dashboard` | Gate officer, Security supervisor |
| 12 | Device custody | `/devices` | Receptionist |
| 13 | Management dashboard | `/insights` | Management |
| 14 | Admin master data | `/admin` | System administrator |
| 15 | Audit log | `/audit` | System administrator, Security supervisor |

Permissions are enforced in two places: the frontend hides screens a user can't open, and the backend checks the role on every endpoint with `@PreAuthorize`.

---

## 4. Main workflows

### Visitor journey

```
03 Register ─► 04 Verify identity ─► 05 Sign ─► token issued, host notified
                                                     │
                     08 Host: Accept / Delay / Redirect / Decline
                                                     │
               07 Approve entry (badge; device custody if the category needs it)
                                                     │
                     07 Check out (blocked while devices are still held)
```

| Status | Meaning |
|---|---|
| `PENDING_VERIFICATION` | Registered, identity not yet checked |
| `PENDING_SIGNATURE` | Identity checked, acknowledgement not yet signed |
| `WAITING` / `DELAYED` | On the queue, waiting for the host |
| `ACCEPTED` | Host accepted; reception must approve entry |
| `DECLINED` | Host declined; visitor is seen out |
| `IN_PREMISES` | Inside with a badge |
| `COMPLETED` / `CANCELLED` | Closed |

### Business rules

- **Identity scan reuse:** a stored scan can be reused only within `ID_SCAN_REUSE_DAYS`. Otherwise reception takes a new scan or records an exception, which needs a written reason.
- **Acknowledgement:** published in English, Sinhala and Tamil, and versioned. Each signature records the version and language the visitor saw, so published versions can't be edited.
- **Daily queue tokens:** allocated under a database lock and protected by a unique constraint.
- **Host limits:** a host can't have more than `MAX_VISITS_PER_HOST_PER_DAY` visits a day.
- **Appointment overlaps:** a host's appointments can't overlap. This is checked in the API and also enforced by a PostgreSQL exclusion constraint.
- **Device custody:** if the category requires it, devices must be in custody before entry. A tag can only be held once at a time, and every device must be returned before check-out.
- **Gate rules:**
  - A vehicle can't enter twice or exit without having entered.
  - A flagged vehicle needs a reason to be admitted.
  - A blocked vehicle can only be admitted by a Security supervisor, with a reason.
  - A denial always needs a reason.
- **Dashboards:**
  - Reception shows an alert when a host hasn't responded within `HOST_RESPONSE_TIMEOUT_MINUTES`.
  - The gate dashboard flags any vehicle inside longer than `VEHICLE_MAX_STAY_HOURS`.

---

## 5. Getting started (developers)

### Prerequisites

- Java 21
- Maven 3.9 or later
- Node 20 or later
- Docker Desktop (for PostgreSQL)

### Steps

```bash
# 1. Configuration
cp .env.example .env              # set DB_PASSWORD and APP_BOOTSTRAP_ADMIN_EMAIL (your e-mail)

# 2. Database
docker compose up -d db

# 3. Backend  (http://localhost:8080). Flyway creates the schema on first start
cd backend
#   export the same variables as .env, e.g. DB_PASSWORD, APP_BOOTSTRAP_ADMIN_EMAIL
mvn spring-boot:run

# 4. Frontend (http://localhost:5173). /api is proxied to the backend
cd frontend
npm install
npm run dev
```

> **Windows note:** the npm scripts call `node node_modules/vite/bin/vite.js` directly instead of the `vite` shim, because the shim breaks when the folder path contains `&`. `npm run dev`, `npm run build` and `npm run preview` work as usual.

### First sign-in on an empty database

1. Open the app and enter the `APP_BOOTSTRAP_ADMIN_EMAIL` address under **Development sign-in**. That account is created automatically as a System administrator, and only when the staff table is empty.
2. On **screen 14 (Admin master data)**:
   - add the staff members and their roles
   - add the visitor categories from the SRS
   - create the acknowledgement text in all three languages and **publish** it
   - review the limits
3. The system is then ready for reception, host and gate users.

### Full stack in Docker

```bash
docker compose --profile full up --build
# app: http://localhost:8081 (nginx serves the SPA and proxies /api to the backend)
```

### Tests

```bash
cd backend && mvn test                       # unit tests

# End-to-end API test: needs a running backend on an EMPTY database
# whose bootstrap admin is admin@test.local
node scripts/smoke-test.mjs                  # RVM_API=http://host:port to target another server
```

The smoke test creates test staff and data. **Never run it against production.**

---

## 6. Authentication and the SSO merge

- There are **no passwords** in this system. Staff are identified by their e-mail, which must match an active record on screen 14.
- `APP_AUTH_MODE=dev` (the current setting) enables the temporary e-mail sign-in on screen 01, so the team can work before SSO is connected.
- Sessions are server-side and use an HttpOnly cookie. CSRF protection uses the `XSRF-TOKEN` cookie with the `X-XSRF-TOKEN` header. The session id is rotated at sign-in.

### Plan for merging SSO into screen 01

1. Add the SSO client to the backend (for example `spring-boot-starter-oauth2-client` for OIDC, or the SAML module).
2. On a successful SSO login, create the same session that `AuthController.devLogin` creates: the principal is the staff e-mail and the authorities are `ROLE_*`. Roles can come from the staff record, from the SSO groups through the **role mapping** table (screen 14), or both.
3. Set `APP_SSO_LOGIN_URL` to the SSO start URL. The **Sign in with Single Sign-On** button on screen 01 becomes active automatically.
4. Set `APP_AUTH_MODE=sso`. This switches off the e-mail sign-in on the server and hides it on the page.

No other screen needs to change.

---

## 7. Configuration

### Environment variables

These are set in `.env` and passed to the backend.

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `APP_AUTH_MODE` | `dev` (e-mail sign-in) or `sso` |
| `APP_SSO_LOGIN_URL` | SSO start URL for the sign-in button |
| `APP_BOOTSTRAP_ADMIN_EMAIL`, `APP_BOOTSTRAP_ADMIN_NAME` | First administrator, created only when there are no staff |
| `APP_TIME_ZONE` | Business day boundary (default `Asia/Colombo`) |
| `SESSION_COOKIE_SECURE` | `true` behind HTTPS |

### Business settings

These live in the database and are edited on screen 14. Every change is audited.

| Setting | Purpose |
|---|---|
| `ID_SCAN_REUSE_DAYS` | How long a stored identity scan can be reused |
| `HOST_RESPONSE_TIMEOUT_MINUTES` | When reception is alerted about a host who hasn't responded |
| `VEHICLE_MAX_STAY_HOURS` | When the gate dashboard flags an overstaying vehicle |
| `MAX_VISITS_PER_HOST_PER_DAY` | Daily visit limit per host |
| `MAX_ITEMS_PER_VISIT` | Declared-item limit per visit |
| `QUEUE_REFRESH_SECONDS` | How often live screens refresh |

---

## 8. Security and data protection

- **Audit log:**
  - Every change, every sign-in and every view of an identity scan is recorded.
  - Each entry stores the SHA-256 hash of the previous entry. **Run integrity check** on screen 15 recomputes the whole chain.
  - The database rejects `UPDATE`, `DELETE` and `TRUNCATE` on `audit_event` (migration V2).
- **Personal data:**
  - The public token display shows token numbers only.
  - The management dashboard returns aggregates only.
  - Identity scans are served with `Cache-Control: no-store` and are never loaded in visitor searches.
- **Input validation:** every request is validated on the server, and errors are returned in a form the UI can show.
- **Headers:**
  - The backend sends CSP and `frame-ancestors 'none'`.
  - nginx adds CSP, `nosniff` and a referrer policy.
- **Pre-production checklist:**
  - HTTPS, with `SESSION_COOKIE_SECURE=true`
  - a database account with least privilege
  - backups and retention for the audit log and identity scans
  - penetration test
  - official logo

---

## 9. Changes from the prototype review

| Prototype issue | Resolution |
|---|---|
| Links and thumbnails pointed at files that didn't exist | Replaced by a working React app; every screen is a real route |
| Styles depended on a missing `rvm.css` | Self-contained design tokens in `frontend/src/styles/theme.css` |
| Fixed SVG gradient id `cg` would clash when repeated | `Crest` uses React `useId()` for a unique id per instance; dialogs use the same approach |
| Crest SVG had no accessibility attributes | Decorative by default (`aria-hidden`), labelled with `role="img"` when it stands alone |
| Each card had duplicate links (thumbnail and title) | Each home card is a single link |
| Counts ("15 / 6 / 2") were typed by hand | Derived from `config/screens.js`; the home page shows screens for your role, total screens and roles supported |
| "6 roles" weren't defined anywhere | Defined in `Role.java` and `roles.js`, and documented above |
| Sample data | Removed. All data comes from PostgreSQL; nothing is seeded except configuration keys |
| Placeholder logo | Crest now comes from `frontend/public/brand/crest.png` (temporary, cut from the template screenshot); the CIABOC red-dot wordmark is drawn in `Wordmark.jsx` |

The prototype's UI/wireframe toggle (the **W** key) was a design-review aid and isn't part of the application.

---

## 10. Next steps

1. **SSO integration** into screen 01 (§6). Owner: identity / infrastructure team.
2. **UAT** with reception, host, gate and management users. Confirm the visitor categories, acknowledgement wording and limits.
3. **Official branding:** replace `frontend/public/brand/crest.png` with the official high-resolution transparent PNG (same file name).
4. **Notifications:** host alerts by SMS or e-mail in addition to the inbox, if the SRS requires them.
5. **Retention policy:** decide how long identity scans and signatures are kept, and add a scheduled purge job.
6. **CI pipeline:** run `mvn test`, the frontend build and the smoke test against a throwaway database on every change.
7. **Hardening:** HTTPS, least-privilege database role, backups and a security assessment before go-live.
