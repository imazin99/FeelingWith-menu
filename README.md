# Feeling With Menu — Backend (Phase 05B: production preparation)

Backend for the Feeling With digital menu website: Express + Mongoose,
implementing the approved Phase 01 Architecture & Database Design document,
plus the Phase 05A/05B production-readiness work (Cloudinary image storage,
MongoDB Atlas readiness, graceful shutdown, health/readiness checks). No
frontend pages beyond the public menu/admin dashboard, no ordering/payments/
inventory/attendance — menu display and its admin dashboard API only. This
phase prepares the app for deployment; it does not deploy it.

## Node.js version

**Requires Node.js 24.x or 26.x** — declared in `package.json`'s `engines`
field as `">=24.0.0 <25.0.0 || >=26.0.0 <27.0.0"`. This intentionally admits
only the two currently-supported LTS release lines and nothing else:

- **Node.js 26 — Active LTS** (active fixes until Oct 2027, security fixes
  until Apr 2029). Recommended for new deployments.
- **Node.js 24 — Maintenance LTS** (security fixes until Apr 2028; active
  feature support already ended Oct 2026). Still fully supported for
  production, but prefer 26 for anything newly deployed.

Node 22 is deliberately excluded even though it remains Maintenance LTS
(security fixes until Apr 2027): this project prefers the two newer LTS
lines per the owner's explicit direction, not because 22 is broken. Node
23, 25, and 27 are excluded on principle — they are (or will be) non-LTS
"Current" releases, and this project never targets a Current release for
production, regardless of the engines floor any individual dependency
declares.

Every direct dependency's own declared `engines.node` requirement was
checked directly against its published package metadata (`npm view
<pkg>@<version> engines`), not assumed, and all of them are satisfied by
both 24.x and 26.x:

| Package | Declared `engines.node` |
|---|---|
| mongoose@9.12.1 | `>=20.19.0` |
| mongodb-memory-server@11.3.0 | `>=20.19.0` |
| express@5.3.0 | `>=18` |
| jest@30.5.2 | `^18.14.0 \|\| ^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` |
| cross-env@10.1.0 | `>=20` |
| supertest@7.3.2 | `>=14.18.0` |
| dotenv@18.0.10 | `>=12` |

Mongoose's `>=20.19.0` is the binding floor among all of them, comfortably
below both 24 and 26.

**Disclosed limitation:** the sandbox this delivery's own development and
test runs were performed in has only Node **v22.23.4** installed, and has
no reachable way to install or switch to Node 24 or 26 (outbound access to
`nodejs.org` and any Node version-manager download is blocked there). So
while the `engines` field now declares and documents 24.x/26.x as the
supported production range, the actual test runs reported in this delivery
were executed against Node v22.23.4, not against 24 or 26 directly — this
is disclosed here rather than claimed otherwise. Nothing in the dependency
compatibility table above gives any reason to expect different behavior on
24 or 26; a real deployment should still run the suite once on its actual
target Node version as a final check.

## Setup (development)

```bash
npm install
cp .env.example .env   # then edit values, especially JWT_SECRET and MONGODB_URI
```

Start MongoDB locally (or point `MONGODB_URI` at any reachable instance), then:

```bash
npm run seed:admin   # creates the first admin account (interactive, or via
                      # SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD env vars)
npm start             # or: npm run dev (auto-restart on file changes)
```

The API listens on `PORT` (default `4000`).

## Health and readiness

- **`GET /health`** — liveness only: "is the Node process itself up and
  responding." Always returns `200 {"status":"ok"}` regardless of database
  state. Use this for a platform's liveness probe (should it restart the
  process?) — a brief database hiccup should not restart an otherwise-
  healthy process, which is why this check is deliberately DB-independent.
- **`GET /ready`** — readiness: "is this instance actually able to serve a
  real request right now," which for this app means "is MongoDB
  connected." Returns `200 {"status":"ready"}` when connected, or
  `503 {"status":"not_ready","database":"<state>"}` otherwise (`state` is
  one of `disconnected`/`connecting`/`disconnecting` — never a connection
  string, credential, or other infrastructure detail). Use this for a load
  balancer's readiness probe (should traffic be routed here right now?).

## Graceful shutdown

`src/server.js` listens for `SIGTERM` and `SIGINT` (what most hosting
platforms/process managers send on redeploy or restart) and, on the first
one received: stops accepting new HTTP connections, waits for in-flight
requests to finish, closes the MongoDB connection, then exits — or forces
exit after 10 seconds if something hangs, so a deploy is never stuck
waiting indefinitely. A second signal received mid-shutdown is a no-op
(the sequence only ever runs once). See `src/shutdown.js`.

## Environment variables

See `.env.example` for the authoritative, always-up-to-date list with
inline explanations. Summary (no real values given here):

| Variable | Required? | Purpose |
|---|---|---|
| `NODE_ENV` | Recommended | `production` enables the JWT/Mongo-URI startup guards, `Secure` cookies, `__Host-` CSRF cookie prefix, `autoIndex:false`, and the `cloud` (Cloudinary) storage default |
| `PORT` | No (default `4000`) | Listen port |
| `MONGODB_URI` | **Yes in production** (startup refuses without it) | MongoDB/Atlas connection string |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | No (default `10000`) | How long to wait for a reachable MongoDB server before failing |
| `MONGOOSE_AUTO_INDEX` | No (defaults by `NODE_ENV`) | Override automatic index building |
| `JWT_SECRET` | **Yes in production** (startup refuses without it) | Session-signing key |
| `JWT_EXPIRES_IN` | No (default `8h`) | Session lifetime |
| `ALLOWED_ORIGINS` | No | Extra allowed CSRF Origins, if the dashboard is ever served separately |
| `APP_ORIGIN` | Yes, if behind a TLS-terminating reverse proxy | Canonical public origin for CSRF Origin validation |
| `STORAGE_PROVIDER` | No (defaults by `NODE_ENV`: `local` in dev/test, `cloud` in production) | Explicit override of the image-storage backend |
| `LOCAL_UPLOAD_DIR` | No (default `uploads`) | Where `LocalDiskProvider` writes images |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Required whenever the resolved provider is `cloud` | Cloudinary credentials |
| `CLOUDINARY_FOLDER` | No (default `feeling-with-menu`) | Groups uploads under one Cloudinary folder |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | No (one-time) | Only read by `npm run seed:admin` |

## Image storage

Provider selection is environment-based: **local disk in development/test,
Cloudinary in production** — overridable either way via `STORAGE_PROVIDER`
(see table above). Both implementations satisfy one shared interface
(`src/services/storageProvider.js`): `upload(file, extension) -> {url,
key}`, `delete(key)` — nothing else in the app (`adminProductController.js`,
`adminSettingsController.js`) knows or cares which one is active.

### Local disk (development default)

Writes under `LOCAL_UPLOAD_DIR` (default `uploads/`), served back at
`/uploads/<generated-id>.<ext>`. No setup required. **Not suitable for
most production hosts**: if the host's filesystem is ephemeral (most
PaaS/container platforms, unless a persistent volume is explicitly
attached), every uploaded image is lost on the next restart/redeploy.

### Cloudinary (production default)

1. Create a free Cloudinary account at <https://cloudinary.com> (not done
   for you — no account was created or accessed during this phase).
2. From the Cloudinary dashboard, copy your **Cloud name**, **API Key**,
   and **API Secret**.
3. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   in your production environment (never commit these).
4. That's it — with `NODE_ENV=production` and no `STORAGE_PROVIDER`
   override, the app uses Cloudinary automatically. The app validates
   these three are set **at startup** (not just on first upload) and
   refuses to start otherwise, so a misconfiguration is caught immediately
   rather than on a customer/owner's first image upload.

Uploads are tagged under `CLOUDINARY_FOLDER` (default `feeling-with-menu`)
so they're easy to find in the Cloudinary media library. Existing local
images are **never** auto-uploaded to Cloudinary by this app — if you
switch an existing deployment from local to cloud storage, each product's
image must be re-uploaded manually through the dashboard; nothing here
does that migration for you.

## MongoDB Atlas (future deployment stage)

Not connected to in this phase — this is what you'll need when you do:

1. Create a free Atlas cluster at <https://www.mongodb.com/cloud/atlas>.
2. Create a database user and allow-list the IP(s)/network your host will
   connect from (or `0.0.0.0/0` if your host's outbound IPs aren't fixed —
   check Atlas's own guidance for your hosting setup).
3. Copy the Atlas-provided SRV connection string (starts with
   `mongodb+srv://`) and set it as `MONGODB_URI` in production. Mongoose's
   bundled MongoDB driver supports `mongodb+srv://` natively — no extra
   configuration needed.
4. In production, the app refuses to start if `MONGODB_URI` is unset —
   this is intentional, so a forgotten connection string fails loudly
   instead of silently trying to reach `localhost`.
5. Indexes: already declared explicitly on every model (`Category`,
   `Product`, `AddOn`, `User`) and build automatically on first connect in
   development/test; in production `autoIndex` is off by default (see
   `MONGOOSE_AUTO_INDEX` above) since indexes are expected to already
   exist from earlier development/staging runs against the same schema.
6. Seeding: `npm run seed:admin` is a separate, manual script — it is
   **never** invoked automatically by `npm start`/`src/server.js`, in any
   environment, and it refuses to create a second admin account if one
   already exists. Run it once, by hand, against your production database
   when you're ready to create the first real admin login.

## Production startup

```bash
npm install --omit=dev
npm start
```

No build step — static frontend (public menu + admin dashboard), no
bundler. Ensure `NODE_ENV=production`, `JWT_SECRET`, and `MONGODB_URI` are
set first (the app refuses to start otherwise); if using Cloudinary (the
production default), also set the three `CLOUDINARY_*` variables.

## Running the tests

Two suites, split because they have different infrastructure needs:

```bash
npm test              # unit tests — pure logic, no database, always runs
npm run test:integration   # full Express+Mongoose integration suite
npm run test:all      # both
```

**`npm test`** covers the storage-provider abstraction (real file I/O
against a temp directory), image magic-byte sniffing, the CSRF
double-submit comparison logic (including Origin/Referer validation and the
production `__Host-` cookie prefix), JWT signing, production `JWT_SECRET`
and `APP_ORIGIN` validation, the image-upload-cleanup-on-save-failure
logic, the fixed-vs-variant product pricing rules (schema-level
`.validate()`, no database needed), Multer's unsupported-MIME-type and
file-size-limit error normalization, and the error-handler's
normalization of Mongoose/duplicate-key/unknown errors. No network or
database access required.

As of this delivery (Phase 05B correction round), `npm test` reports **142
passed, 142 total** across 15 suites — this was run for real (not
estimated) immediately before writing this README update; run `npm test`
yourself at any time for the exact current count, since this number will
drift as tests are added in future rounds and this line will not always be
re-synced on every change.

**Executed vs. written — the distinction that matters for this project's
phase-gated review process:** every number above and in this file is from
a test that was actually run, with its real output captured. The
integration suite described next is **written** (code complete, intended
to cover the full controller/route layer) but has **not been executed in
this project's development sandbox**, for the environment reason
explained below — it is not reported as passing, and no specific test
count is claimed for it here, because no one has watched it run.

**Product pricing** (approved decision, code review round 2): a product is
either fixed-price (its own `price`) or variant-priced (each `variants[]`
entry has its own required, integer, non-negative `price`, in piastres) —
never both, and never neither. There is no `priceModifier`; each variant's
price is fully independent (e.g. Small = 5000, Medium = 6500, Large = 8000).
Switching a product between pricing modes via `PUT /api/admin/products/:id`
is explicit — send `price: null` to clear a fixed price when adding
variants, or `variants: []` to clear variants when setting a fixed price.

**`npm run test:integration`** (the full controller/route suite — public menu
filtering cascade, auth, CSRF end-to-end, session revocation, admin
provisioning, category/add-on/product CRUD, image upload and replacement
cleanup, Settings field whitelist) spins up a real, ephemeral MongoDB via
[`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server),
which downloads a `mongod` binary from `fastdl.mongodb.org` on first run.
**This requires outbound network access to that host.** In a sandboxed
environment without it, `globalSetup` fails before any test runs — this is an
environment limitation, not a defect in the suite or the application code. Run
it on a developer machine or in CI with normal internet access, or point
`MONGODB_URI_TEST` manually at any MongoDB instance (edit
`tests/globalSetup.js` to skip the download, or install `mongod` locally and
set `MONGODB_URI` directly) for the same tests to run against it.

`tests/globalSetup.js` and `tests/helpers/testApp.js`'s `connectTestDb()`
both fail fast with the full original error printed to stderr if MongoDB
never becomes reachable, rather than letting every suite sit at Jest's
30s `testTimeout` with no diagnostic — see the comments in those two files
for exactly what each failure mode looks like and why.

`connectTestDb()` also passes `runtimeAdapters: { os }` on
`mongoose.connect()`. Without it, `mongodb` driver `>=7.6.0` (pulled in
transitively by `mongoose@9.12.1`) loads the `os` module via a dynamic
`import()` to build its handshake client metadata; Jest's CommonJS test
runtime silently fails that import, so the handshake goes out with
incomplete metadata and the server rejects it with
`MongooseServerSelectionError: Missing required sub-document 'driver' in
the client metadata document` — not an environment problem, and not fixed
by retrying or raising timeouts. `runtimeAdapters: { os }` supplies the
module directly instead of importing it. See
[Automattic/mongoose#16596](https://github.com/Automattic/mongoose/issues/16596).

### If Jest reports "did not exit one second after the test run"

Run `npm run test:integration:debug` (adds `--detectOpenHandles`) and
read which handle type and creation stack Jest prints — that is the
authoritative answer; the notes below are what's already been checked
and hardened, not a substitute for that output.

- `tests/helpers/testApp.js`'s `listen()`/`closeServer()` now tracks every
  socket the test server accepts and force-destroys any still open at
  close time, rather than waiting for supertest's keep-alive connections
  to end on their own (`server.close()` alone only waits for that; see
  `tests/unit/testServerCleanup.test.js` for a test proving `closeServer()`
  stays fast even with a deliberately-held-open keep-alive connection).
- `disconnectTestDb()` now closes the MongoDB connection for any
  readyState other than "never connected" (0), not just "connected" (1) —
  the driver's connection-monitoring timers
  (`node_modules/mongodb/lib/sdam/monitor.js`) are only guaranteed
  cleared once `mongoose.disconnect()` actually runs.
- If a handle still shows up after both of those, `--detectOpenHandles`'s
  printed stack trace will point at exactly where it was created — report
  that back rather than guessing further.

### Troubleshooting the integration suite on Windows

If `npm test` (unit) passes but `npm run test:integration` fails with
`beforeAll()`/`connectTestDb()` timing out — not an explicit download
error — `mongodb-memory-server`'s `mongod.exe` is spawning but never
becoming reachable. This is almost always one of:

1. **Antivirus / Windows Defender** quarantining or real-time-scanning-
   locking the freshly-downloaded `mongod.exe` so it never actually runs.
2. **A missing Visual C++ Redistributable** — `mongod.exe` on Windows
   needs the Microsoft Visual C++ 2015–2022 Redistributable (x64)
   installed; without it the process can fail to start with no output
   mongodb-memory-server surfaces as a clean error.
3. **A local firewall** silently dropping the loopback TCP bind the
   spawned `mongod` tries to listen on.

Diagnose and fix, in PowerShell (run as the same user who runs the tests):

```powershell
# 1. Get verbose logging from mongodb-memory-server itself — run this
#    first; its output usually shows which of the above is actually
#    happening (download path, spawn command, mongod's own stdout/stderr).
$env:MONGOMS_DEBUG = "1"
npm run test:integration

# 2. Check whether the VC++ Redistributable (x64) is installed:
Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" -ErrorAction SilentlyContinue
# If this prints nothing, install "Microsoft Visual C++ 2015-2022
# Redistributable (x64)" from Microsoft's official download page, then
# retry.

# 3. Test whether antivirus real-time scanning is the cause (temporary,
#    as Administrator — re-enable immediately after testing):
Set-MpPreference -DisableRealtimeMonitoring $true
npm run test:integration
Set-MpPreference -DisableRealtimeMonitoring $false

# 4. Point the binary cache at a known folder so you can inspect exactly
#    what got downloaded/extracted:
$env:MONGOMS_DOWNLOAD_DIR = "C:\mongodb-memory-server-cache"
npm run test:integration
```

If none of the above resolves it, the most reliable fix is to bypass
`mongodb-memory-server`'s own download-and-spawn path entirely and point
it at a real, manually-installed `mongod.exe`:

```powershell
# Install "MongoDB Community Server" for Windows from MongoDB's official
# download page first, then:
$env:MONGOMS_SYSTEM_BINARY = "C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe"
npm run test:integration
```

This still runs against an ephemeral, isolated database (`mongod` is just
started against a temp data directory by mongodb-memory-server, same as
before) — never your real `MONGODB_URI` — so test-data isolation is
unaffected either way.

```
src/
  config/       env.js (centralized env reads), db.js (Mongoose connection)
  models/       Category, AddOn, Product, User, Settings
  middleware/   auth (JWT + tokenVersion), csrf (double-submit), upload (multer),
                rateLimit, validate (express-validator results), errorHandler
  controllers/  publicMenu, adminCategory, adminAddOn, adminProduct,
                adminUser, adminSettings, auth
  routes/       one router per controller, aggregated in adminRoutes.js
                (auth + CSRF mounted once, on the whole /api/admin tree)
  services/     storageProvider.js — the StorageProvider abstraction
                (LocalDiskProvider and CloudinaryProvider both fully
                implemented; selected by environment, see "Image storage" above)
  validators/   express-validator rule sets per resource
  scripts/      seedAdmin.js — one-time first-admin creation
tests/
  unit/         no database required
  integration/  full app + mongodb-memory-server
  helpers/      shared test app/auth helpers
```

## Security implementation summary

- **Passwords**: bcrypt (cost 11), `select: false` on `passwordHash` so it's
  never returned by a default query.
- **Sessions**: JWT in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` in
  production), 8h expiry. `tokenVersion` on the User document is checked on
  every request; incrementing it (`POST /api/admin/users/:id/revoke`, or
  `PATCH /api/admin/users/:id/status` with `status: 'inactive'`)
  invalidates all of that account's outstanding tokens immediately, with no
  server-side session store. `tokenVersion` only ever increases — reactivating
  a deactivated account never resets it, so a pre-deactivation token can
  never become valid again.
- **Production configuration**: `src/config/env.js` refuses to start when
  `NODE_ENV=production` and `JWT_SECRET` is missing or still set to the
  unsafe development default, or when `MONGODB_URI` is unset (Phase 05B —
  prevents a production deployment from silently falling back to a
  localhost database). `src/server.js` also eagerly constructs the
  resolved storage provider at startup, so a misconfigured Cloudinary
  deployment (missing credentials) fails immediately too, rather than only
  on the first real image upload.
- **Behind a reverse proxy** (nginx/Caddy/ALB terminating TLS, forwarding
  plain HTTP internally): set `APP_ORIGIN` (e.g.
  `https://menu.feelingwith.com`) so CSRF Origin validation compares
  against the real public origin instead of this process's internal,
  unencrypted view of the request. This app deliberately does **not** set
  `app.set('trust proxy', true)` — see the comment above `APP_ORIGIN` in
  `src/config/env.js` for why that would be unsafe here, and why
  `APP_ORIGIN` is the correct fix instead. Nothing else in the app reads
  `req.protocol`/`req.secure`/`req.ip`, so no other trust-proxy
  configuration is needed in this phase.
- **CSRF**: double-submit token — a second, non-`HttpOnly` `csrfToken`
  cookie (`__Host-csrfToken` in production, hardened against cross-
  subdomain cookie injection) issued at login, echoed back as
  `X-CSRF-Token` on every state-changing `/api/admin/*` request and on
  `POST /api/auth/logout`, compared with `crypto.timingSafeEqual`.
  `SameSite=Strict` is a second, independent layer, not the only one. A
  third, independent layer validates the request's `Origin` (falling back
  to `Referer`) against this app's own origin (or `ALLOWED_ORIGINS`);
  a request with neither header is rejected rather than trusted by
  default — see `src/middleware/csrf.js` for the full documented policy.
- **CORS**: not configured — this API is same-origin by design in this phase
  (the dashboard and API are intended to be served from the same Express app).
  See "Deviations" if a separate dashboard origin is introduced later.
- **Rate limiting**: `POST /api/auth/login` is limited to 10 attempts / 15 min
  / IP.
- **Validation**: `express-validator` on every admin write route; Mongoose
  schema validation underneath as a second layer.
- **Image uploads**: format allow-list (JPEG/PNG/WebP) enforced twice — by
  MIME type at the multer layer, and by magic-byte sniffing of the actual
  file content server-side (`src/utils/imageSniff.js`) — plus a 5 MB size
  ceiling. Uploaded files are renamed to a random id before storage, never
  the original filename.
- **No secrets in code**: everything reads through `src/config/env.js` from
  environment variables; `.env` is not committed (`.env.example` documents
  every variable).
- **Error handling**: one normalization point (`src/middleware/errorHandler.js`)
  — no stack traces or internals ever reach the client.
