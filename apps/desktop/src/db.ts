// apps/desktop/src/db.ts
//
// ClientBook — DB bootstrap (Electron main)
// - Main process owns DB writes.
// - Opens SQLite once, applies migrations (via openDb).
// - Provides a safe getter and optional close for shutdown.
//
// Notes:
// - better-sqlite3 is synchronous: keep operations short and move heavy work to worker.
// - WAL mode is enabled in @clientbook/db/openDb pragmas.
// - If you later support multiple windows, they should all share this same DB handle.

import type { Db } from "@clientbook/db";
import { openDb } from "@clientbook/db";
import { getAppPaths } from "./paths.js";

let _db: Db | null = null;

export function getDb(): Db {
    if (_db) return _db;

    const { dbPath } = getAppPaths();

    try {
        _db = openDb(dbPath);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[desktop] Failed to open DB at ${dbPath}: ${msg}`);
    }

    return _db;
}

export function closeDb(): void {
    if (!_db) return;
    try {
        _db.close();
    } catch {
        // ignore
    } finally {
        _db = null;
    }
}