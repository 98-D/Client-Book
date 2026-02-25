// packages/db/src/migrations.ts
//
// ClientBook — SQLite migrations (production)
// - Migrations are append-only and ordered by version.
// - Each migration is a single SQL string, executed inside a transaction by openDb().
// - Uses UTC timestamps in ISO-ish format from SQLite strftime(...'Z').
// - foreign_keys enforced by pragmas in openDb().

export type Migration = Readonly<{
    version: number;
    name: string;
    sql: string;
}>;

// UTC ISO-ish timestamp (SQLite)
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export const MIGRATIONS: readonly Migration[] = [
    {
        version: 1,
        name: "init",
        sql: `
-- schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (${NOW})
);

-- clients
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  company_name  TEXT NOT NULL,
  bn            TEXT NOT NULL,
  year_end_date TEXT,              -- YYYY-MM-DD (app-level validation)
  can           TEXT,              -- corporate access number (optional)
  notes         TEXT,
  tags_json     TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  created_at    TEXT NOT NULL DEFAULT (${NOW}),
  updated_at    TEXT NOT NULL DEFAULT (${NOW}),
  CHECK (bn GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
);

CREATE INDEX IF NOT EXISTS idx_clients_bn ON clients(bn);
CREATE INDEX IF NOT EXISTS idx_clients_company_name ON clients(company_name);

CREATE TRIGGER IF NOT EXISTS trg_clients_updated_at
AFTER UPDATE ON clients
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE clients SET updated_at = (${NOW}) WHERE id = NEW.id;
END;

-- credential_profiles (username + encrypted password blob stored as base64)
CREATE TABLE IF NOT EXISTS credential_profiles (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  username         TEXT NOT NULL,
  password_enc_b64 TEXT NOT NULL, -- encrypted via electron.safeStorage (or keytar)
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (${NOW}),
  updated_at       TEXT NOT NULL DEFAULT (${NOW}),
  last_used_at     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_credential_profiles_label
ON credential_profiles(label);

CREATE TRIGGER IF NOT EXISTS trg_credential_profiles_updated_at
AFTER UPDATE ON credential_profiles
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE credential_profiles SET updated_at = (${NOW}) WHERE id = NEW.id;
END;

-- client <-> profile links
CREATE TABLE IF NOT EXISTS client_profile_links (
  client_id   TEXT NOT NULL,
  profile_id  TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0, -- 0/1
  created_at  TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (client_id, profile_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES credential_profiles(id) ON DELETE CASCADE,
  CHECK (is_default IN (0,1))
);

-- only one default profile per client
CREATE UNIQUE INDEX IF NOT EXISTS uidx_client_default_profile
ON client_profile_links(client_id)
WHERE is_default = 1;

CREATE INDEX IF NOT EXISTS idx_client_profile_links_profile
ON client_profile_links(profile_id);

-- session_jars (Playwright storageState path registry)
CREATE TABLE IF NOT EXISTS session_jars (
  id                 TEXT PRIMARY KEY,
  profile_id         TEXT NOT NULL,
  scope              TEXT NOT NULL, -- e.g. 'rac' (later: 'cra-portal', etc.)
  storage_state_path TEXT NOT NULL, -- absolute path to JSON file
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (${NOW}),
  updated_at         TEXT NOT NULL DEFAULT (${NOW}),
  last_validated_at  TEXT,
  last_success_at    TEXT,
  invalidated_at     TEXT,
  invalidated_reason TEXT,
  FOREIGN KEY (profile_id) REFERENCES credential_profiles(id) ON DELETE CASCADE
);

-- one jar per (profile, scope)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_session_jars_profile_scope
ON session_jars(profile_id, scope);

CREATE TRIGGER IF NOT EXISTS trg_session_jars_updated_at
AFTER UPDATE ON session_jars
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE session_jars SET updated_at = (${NOW}) WHERE id = NEW.id;
END;

-- automation_runs (also serves as a queue)
CREATE TABLE IF NOT EXISTS automation_runs (
  id                  TEXT PRIMARY KEY,
  flow_id             TEXT NOT NULL,
  flow_version        TEXT NOT NULL,
  client_id           TEXT,
  profile_id          TEXT NOT NULL,
  jar_id              TEXT,
  state               TEXT NOT NULL, -- constrained below
  input_json          TEXT NOT NULL,
  output_json         TEXT,
  error_json          TEXT,
  queued_at           TEXT NOT NULL DEFAULT (${NOW}),
  started_at          TEXT,
  finished_at         TEXT,
  cancel_requested_at TEXT,
  created_at          TEXT NOT NULL DEFAULT (${NOW}),
  updated_at          TEXT NOT NULL DEFAULT (${NOW}),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (profile_id) REFERENCES credential_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (jar_id) REFERENCES session_jars(id) ON DELETE SET NULL,
  CHECK (state IN ('queued','running','paused','succeeded','failed','canceled'))
);

CREATE INDEX IF NOT EXISTS idx_runs_state_queued_at
ON automation_runs(state, queued_at);

CREATE INDEX IF NOT EXISTS idx_runs_profile
ON automation_runs(profile_id);

CREATE INDEX IF NOT EXISTS idx_runs_client
ON automation_runs(client_id);

CREATE TRIGGER IF NOT EXISTS trg_runs_updated_at
AFTER UPDATE ON automation_runs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE automation_runs SET updated_at = (${NOW}) WHERE id = NEW.id;
END;

-- run_events (append-only log)
CREATE TABLE IF NOT EXISTS run_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  ts           TEXT NOT NULL DEFAULT (${NOW}),
  type         TEXT NOT NULL,       -- 'log' | 'state' | 'pause' | etc.
  level        TEXT,                -- 'debug'|'info'|'warn'|'error' (optional)
  message      TEXT,                -- short text (optional)
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_seq
ON run_events(run_id, seq);

-- run_artifacts (downloads, screenshots, PDFs, etc.)
CREATE TABLE IF NOT EXISTS run_artifacts (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- 'download' | 'screenshot' | 'pdf' | ...
  path       TEXT NOT NULL,   -- absolute path
  filename   TEXT,
  mime       TEXT,
  bytes      INTEGER,
  sha256     TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_artifacts_run
ON run_artifacts(run_id);
`,
    },
] as const;