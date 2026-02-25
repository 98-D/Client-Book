// packages/db/src/queries.ts
//
// ClientBook — DB queries (production)
// - Strongly typed row shapes at the edges (better-sqlite3 returns unknownish objects)
// - No throwing on "not found" unless explicitly desired
// - Writes are kept small/fast (better-sqlite3 is sync)
// - Treat JSON columns as TEXT; caller can parse/validate with Zod if needed
//
// NOTE: Main process should own DB writes. If you later add a worker, have it emit
// events and let main persist them (avoid sqlite multi-writer contention).
//

import crypto from "node:crypto";
import type { Db } from "./openDb.js";
import type { RunState as RunStateT } from "@clientbook/contract";

function nowIso(): string {
    return new Date().toISOString();
}

function toJsonText(v: unknown): string {
    return JSON.stringify(v ?? {});
}

// -------------------- Clients --------------------

export type UpsertClientInput = {
    id?: string;
    company_name: string;
    bn: string; // 9 digits
    year_end_date?: string | null;
    can?: string | null;
    notes?: string | null;
    tags?: string[];
};

export type ClientRow = {
    id: string;
    company_name: string;
    bn: string;
    year_end_date: string | null;
    can: string | null;
    notes: string | null;
    tags_json: string;
    created_at: string;
    updated_at: string;
};

type IdRow = { id: string };

export function listClients(db: Db, search?: string): ClientRow[] {
    if (search && search.trim()) {
        const s = `%${search.trim().toLowerCase()}%`;
        return db
            .prepare(
                `
        SELECT *
        FROM clients
        WHERE lower(company_name) LIKE ? OR bn LIKE ?
        ORDER BY company_name ASC
      `
            )
            .all(s, s) as ClientRow[];
    }

    return db.prepare(`SELECT * FROM clients ORDER BY company_name ASC`).all() as ClientRow[];
}

export function getClient(db: Db, id: string): ClientRow | null {
    const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id) as ClientRow | undefined;
    return row ?? null;
}

export function upsertClient(db: Db, input: UpsertClientInput): string {
    const id = input.id ?? crypto.randomUUID();
    const tags_json = JSON.stringify(input.tags ?? []);

    const existing = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(id) as IdRow | undefined;

    if (existing) {
        db.prepare(
            `
      UPDATE clients SET
        company_name = ?,
        bn = ?,
        year_end_date = ?,
        can = ?,
        notes = ?,
        tags_json = ?,
        updated_at = ?
      WHERE id = ?
    `
        ).run(
            input.company_name,
            input.bn,
            input.year_end_date ?? null,
            input.can ?? null,
            input.notes ?? null,
            tags_json,
            nowIso(),
            id
        );
    } else {
        db.prepare(
            `
      INSERT INTO clients (
        id, company_name, bn, year_end_date, can, notes, tags_json, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `
        ).run(
            id,
            input.company_name,
            input.bn,
            input.year_end_date ?? null,
            input.can ?? null,
            input.notes ?? null,
            tags_json,
            nowIso(),
            nowIso()
        );
    }

    return id;
}

export function deleteClient(db: Db, id: string): void {
    db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);
}

// -------------------- Credential Profiles --------------------

export type UpsertCredentialProfileInput = {
    id?: string;
    label: string;
    username: string;
    password_enc_b64: string; // electron.safeStorage encrypted base64
    notes?: string | null;
};

export type CredentialProfileRow = {
    id: string;
    label: string;
    username: string;
    password_enc_b64: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    last_used_at: string | null;
};

export function listCredentialProfiles(db: Db): CredentialProfileRow[] {
    return db
        .prepare(`SELECT * FROM credential_profiles ORDER BY label ASC`)
        .all() as CredentialProfileRow[];
}

export function getCredentialProfile(db: Db, id: string): CredentialProfileRow | null {
    const row = db
        .prepare(`SELECT * FROM credential_profiles WHERE id = ?`)
        .get(id) as CredentialProfileRow | undefined;
    return row ?? null;
}

export function upsertCredentialProfile(db: Db, input: UpsertCredentialProfileInput): string {
    const id = input.id ?? crypto.randomUUID();

    const existing = db
        .prepare(`SELECT id FROM credential_profiles WHERE id = ?`)
        .get(id) as IdRow | undefined;

    if (existing) {
        db.prepare(
            `
      UPDATE credential_profiles SET
        label = ?,
        username = ?,
        password_enc_b64 = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `
        ).run(
            input.label,
            input.username,
            input.password_enc_b64,
            input.notes ?? null,
            nowIso(),
            id
        );
    } else {
        db.prepare(
            `
      INSERT INTO credential_profiles (
        id, label, username, password_enc_b64, notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?)
    `
        ).run(id, input.label, input.username, input.password_enc_b64, input.notes ?? null, nowIso(), nowIso());
    }

    return id;
}

export function deleteCredentialProfile(db: Db, id: string): void {
    db.prepare(`DELETE FROM credential_profiles WHERE id = ?`).run(id);
}

export function markCredentialProfileUsed(db: Db, id: string): void {
    db.prepare(
        `
    UPDATE credential_profiles
    SET last_used_at = ?, updated_at = ?
    WHERE id = ?
  `
    ).run(nowIso(), nowIso(), id);
}

// -------------------- Client ↔ Profile Links --------------------

export type ClientProfileLinkRow = {
    profile_id: string;
    is_default: 0 | 1;
    label: string;
    username: string;
};

export function linkClientToProfile(
    db: Db,
    clientId: string,
    profileId: string,
    opts?: { is_default?: boolean }
): void {
    const isDefault: 0 | 1 = opts?.is_default ? 1 : 0;

    // If setting default, clear any other defaults for this client first.
    if (isDefault === 1) {
        db.prepare(`UPDATE client_profile_links SET is_default = 0 WHERE client_id = ?`).run(clientId);
    }

    db.prepare(
        `
    INSERT INTO client_profile_links (client_id, profile_id, is_default)
    VALUES (?, ?, ?)
    ON CONFLICT(client_id, profile_id) DO UPDATE SET
      is_default = excluded.is_default
  `
    ).run(clientId, profileId, isDefault);
}

export function unlinkClientFromProfile(db: Db, clientId: string, profileId: string): void {
    db.prepare(`DELETE FROM client_profile_links WHERE client_id = ? AND profile_id = ?`).run(
        clientId,
        profileId
    );
}

export function listClientProfiles(db: Db, clientId: string): ClientProfileLinkRow[] {
    return db
        .prepare(
            `
      SELECT
        l.profile_id,
        l.is_default,
        p.label,
        p.username
      FROM client_profile_links l
      JOIN credential_profiles p ON p.id = l.profile_id
      WHERE l.client_id = ?
      ORDER BY l.is_default DESC, p.label ASC
    `
        )
        .all(clientId) as ClientProfileLinkRow[];
}

export function getDefaultProfileForClient(db: Db, clientId: string): { profile_id: string } | null {
    const row = db
        .prepare(
            `
      SELECT profile_id
      FROM client_profile_links
      WHERE client_id = ? AND is_default = 1
      LIMIT 1
    `
        )
        .get(clientId) as { profile_id: string } | undefined;

    return row ?? null;
}

// -------------------- Session Jars --------------------

export type SessionJarRow = {
    id: string;
    profile_id: string;
    scope: string;
    storage_state_path: string;
    metadata_json: string;
    created_at: string;
    updated_at: string;
    last_validated_at: string | null;
    last_success_at: string | null;
    invalidated_at: string | null;
    invalidated_reason: string | null;
};

export function getSessionJarByProfileScope(db: Db, profileId: string, scope: string): SessionJarRow | null {
    const row = db
        .prepare(
            `
      SELECT * FROM session_jars
      WHERE profile_id = ? AND scope = ?
    `
        )
        .get(profileId, scope) as SessionJarRow | undefined;

    return row ?? null;
}

export function upsertSessionJar(db: Db, args: {
    id?: string;
    profile_id: string;
    scope: string;
    storage_state_path: string;
    metadata_json?: string;
}): string {
    const existing = getSessionJarByProfileScope(db, args.profile_id, args.scope);
    const id = existing?.id ?? args.id ?? crypto.randomUUID();

    if (existing) {
        db.prepare(
            `
      UPDATE session_jars SET
        storage_state_path = ?,
        metadata_json = ?,
        updated_at = ?
      WHERE id = ?
    `
        ).run(
            args.storage_state_path,
            args.metadata_json ?? existing.metadata_json ?? "{}",
            nowIso(),
            id
        );
    } else {
        db.prepare(
            `
      INSERT INTO session_jars (
        id, profile_id, scope, storage_state_path, metadata_json, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?)
    `
        ).run(
            id,
            args.profile_id,
            args.scope,
            args.storage_state_path,
            args.metadata_json ?? "{}",
            nowIso(),
            nowIso()
        );
    }

    return id;
}

export function invalidateSessionJar(db: Db, jarId: string, reason?: string): void {
    db.prepare(
        `
    UPDATE session_jars SET
      invalidated_at = ?,
      invalidated_reason = ?,
      updated_at = ?
    WHERE id = ?
  `
    ).run(nowIso(), reason ?? "invalidated", nowIso(), jarId);
}

export function markSessionJarSuccess(db: Db, jarId: string): void {
    db.prepare(
        `
    UPDATE session_jars SET
      last_success_at = ?,
      updated_at = ?
    WHERE id = ?
  `
    ).run(nowIso(), nowIso(), jarId);
}

export function markSessionJarValidated(db: Db, jarId: string): void {
    db.prepare(
        `
    UPDATE session_jars SET
      last_validated_at = ?,
      updated_at = ?
    WHERE id = ?
  `
    ).run(nowIso(), nowIso(), jarId);
}

// -------------------- Runs + Events --------------------

export type CreateRunInput = {
    flow_id: string;
    flow_version: string;
    client_id?: string | null;
    profile_id: string;
    jar_id?: string | null;
    input_json: string;
};

export type AutomationRunRow = {
    id: string;
    flow_id: string;
    flow_version: string;
    client_id: string | null;
    profile_id: string;
    jar_id: string | null;
    state: RunStateT;
    input_json: string;
    output_json: string | null;
    error_json: string | null;
    queued_at: string;
    started_at: string | null;
    finished_at: string | null;
    cancel_requested_at: string | null;
    created_at: string;
    updated_at: string;
};

type RunSeqRow = { m: number | null };

export function createRun(db: Db, args: CreateRunInput): string {
    const id = crypto.randomUUID();
    db.prepare(
        `
    INSERT INTO automation_runs (
      id, flow_id, flow_version, client_id, profile_id, jar_id,
      state, input_json, queued_at, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `
    ).run(
        id,
        args.flow_id,
        args.flow_version,
        args.client_id ?? null,
        args.profile_id,
        args.jar_id ?? null,
        "queued",
        args.input_json,
        nowIso(),
        nowIso(),
        nowIso()
    );
    return id;
}

export function requestCancelRun(db: Db, runId: string): void {
    db.prepare(
        `
    UPDATE automation_runs SET
      cancel_requested_at = COALESCE(cancel_requested_at, ?),
      updated_at = ?
    WHERE id = ?
  `
    ).run(nowIso(), nowIso(), runId);
}

export function setRunState(
    db: Db,
    runId: string,
    state: RunStateT,
    extra?: Partial<{
        started_at: string | null;
        finished_at: string | null;
        output_json: string | null;
        error_json: string | null;
        jar_id: string | null;
    }>
): void {
    db.prepare(
        `
    UPDATE automation_runs SET
      state = ?,
      jar_id = COALESCE(?, jar_id),
      started_at = COALESCE(?, started_at),
      finished_at = COALESCE(?, finished_at),
      output_json = COALESCE(?, output_json),
      error_json = COALESCE(?, error_json),
      updated_at = ?
    WHERE id = ?
  `
    ).run(
        state,
        extra?.jar_id ?? null,
        extra?.started_at ?? null,
        extra?.finished_at ?? null,
        extra?.output_json ?? null,
        extra?.error_json ?? null,
        nowIso(),
        runId
    );
}

export type RunEventLevel = "debug" | "info" | "warn" | "error";

export type RunEventRow = {
    id: number;
    run_id: string;
    seq: number;
    ts: string;
    type: string;
    level: string | null;
    message: string | null;
    payload_json: string;
};

export function appendRunEvent(db: Db, runId: string, event: {
    type: string;
    level?: RunEventLevel;
    message?: string;
    payload: unknown;
}): number {
    const row = db
        .prepare(`SELECT COALESCE(MAX(seq),0) AS m FROM run_events WHERE run_id = ?`)
        .get(runId) as RunSeqRow;

    const nextSeq = (row.m ?? 0) + 1;

    db.prepare(
        `
    INSERT INTO run_events (run_id, seq, ts, type, level, message, payload_json)
    VALUES (?,?,?,?,?,?,?)
  `
    ).run(
        runId,
        nextSeq,
        nowIso(),
        event.type,
        event.level ?? null,
        event.message ?? null,
        toJsonText(event.payload)
    );

    return nextSeq;
}