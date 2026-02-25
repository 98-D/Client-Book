// packages/db/src/openDb.ts
//
// ClientBook — SQLite open/migrate (production)
// - Opens better-sqlite3 database
// - Applies pragmas (WAL, FK, busy_timeout, etc.)
// - Applies pending migrations transactionally
// - Protects against partial migration application
//
// Notes:
// - Open once in Electron main; keep handle for app lifetime.
// - With WAL, concurrent readers are fine; writers should remain single-owner (main).

import Database from "better-sqlite3";
import { MIGRATIONS, type Migration } from "./migrations.js";

export type Db = Database.Database;

function applyPragmas(db: Db) {
    // Always enforce FK constraints
    db.pragma("foreign_keys = ON");

    // WAL for better concurrency and crash resilience
    db.pragma("journal_mode = WAL");

    // Good balance of durability vs perf for desktop apps
    db.pragma("synchronous = NORMAL");

    // Keep temp in memory where possible
    db.pragma("temp_store = MEMORY");

    // Avoid "database is locked" flakiness under light contention
    db.pragma("busy_timeout = 5000");

    // Optional: keep WAL from growing too much (pages). Tweak as desired.
    // db.pragma("wal_autocheckpoint = 1000");
}

function ensureMigrationsTable(db: Db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

function getCurrentVersion(db: Db): number {
    const row = db
        .prepare(`SELECT MAX(version) AS v FROM schema_migrations`)
        .get() as { v: number | null };
    return row.v ?? 0;
}

function applyMigration(db: Db, m: Migration) {
    // Run migration SQL then record it
    db.exec(m.sql);
    db.prepare(`INSERT INTO schema_migrations(version, name) VALUES (?, ?)`).run(
        m.version,
        m.name
    );
}

function applyMigrations(db: Db) {
    ensureMigrationsTable(db);

    const current = getCurrentVersion(db);
    const pending = MIGRATIONS.filter((m) => m.version > current).sort(
        (a, b) => a.version - b.version
    );

    if (pending.length === 0) return;

    // Transaction ensures all-or-nothing migrations on startup
    const tx = db.transaction(() => {
        for (const m of pending) applyMigration(db, m);
    });

    tx();
}

/**
 * Open a SQLite database at dbPath, apply pragmas, apply migrations, and return handle.
 */
export function openDb(dbPath: string): Db {
    const db = new Database(dbPath);

    try {
        applyPragmas(db);
        applyMigrations(db);
        return db;
    } catch (err) {
        // If startup failed, try to close handle to avoid locked file.
        try {
            db.close();
        } catch {
            // ignore
        }
        throw err;
    }
}