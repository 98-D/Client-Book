// packages/db/src/zod.ts
import { z } from "zod";
import { RunState } from "@clientbook/contract";

// -------------------------------------------------------------------------------------// Helpers
// -------------------------------------------------------------------------------------

/**
 * ISO-ish timestamp string (SQLite DEFAULT uses strftime(...'Z')).
 * Keep loose at first; tighten later if you want strict RFC3339.
 */
export const IsoTs = z.string().min(10);

/** Generic string ID (UUIDs etc). */
export const Id = z.string().min(1);

// Common JSON text columns (stored as TEXT).
export const JsonText = z.string();

/** Stored as TEXT '[]' of string tags. */
export const TagsJsonText = JsonText.default("[]");

// -------------------------------------------------------------------------------------
// Row schemas (mirror SQLite column names exactly)
// -------------------------------------------------------------------------------------

export const ClientRowZ = z.object({
    id: Id,
    company_name: z.string().min(1),
    bn: z.string().regex(/^\d{9}$/),
    year_end_date: z.string().nullable(),
    can: z.string().nullable(),
    notes: z.string().nullable(),
    tags_json: TagsJsonText,
    created_at: IsoTs,
    updated_at: IsoTs,
});

export const CredentialProfileRowZ = z.object({
    id: Id,
    label: z.string().min(1),
    username: z.string().min(1),
    password_enc_b64: z.string().min(1),
    notes: z.string().nullable(),
    created_at: IsoTs,
    updated_at: IsoTs,
    last_used_at: IsoTs.nullable(),
});

export const ClientProfileLinkRowZ = z.object({
    client_id: Id,
    profile_id: Id,
    is_default: z.union([z.literal(0), z.literal(1)]),
    created_at: IsoTs,
});

export const SessionJarRowZ = z.object({
    id: Id,
    profile_id: Id,
    scope: z.string().min(1),
    storage_state_path: z.string().min(1),
    metadata_json: JsonText.default("{}"),
    created_at: IsoTs,
    updated_at: IsoTs,
    last_validated_at: IsoTs.nullable(),
    last_success_at: IsoTs.nullable(),
    invalidated_at: IsoTs.nullable(),
    invalidated_reason: z.string().nullable(),
});

export const RunRowZ = z.object({
    id: Id,
    flow_id: z.string().min(1),
    flow_version: z.string().min(1),
    client_id: Id.nullable(),
    profile_id: Id,
    jar_id: Id.nullable(),
    state: RunState,
    input_json: JsonText,
    output_json: JsonText.nullable(),
    error_json: JsonText.nullable(),
    queued_at: IsoTs,
    started_at: IsoTs.nullable(),
    finished_at: IsoTs.nullable(),
    cancel_requested_at: IsoTs.nullable(),
    created_at: IsoTs,
    updated_at: IsoTs,
});

export const RunEventRowZ = z.object({
    id: z.number().int().nonnegative(),
    run_id: Id,
    seq: z.number().int().nonnegative(),
    ts: IsoTs,
    type: z.string().min(1),
    level: z.string().nullable(),
    message: z.string().nullable(),
    payload_json: JsonText.default("{}"),
});

export const RunArtifactRowZ = z.object({
    id: Id,
    run_id: Id,
    kind: z.string().min(1),
    path: z.string().min(1),
    filename: z.string().nullable(),
    mime: z.string().nullable(),
    bytes: z.number().int().nullable(),
    sha256: z.string().nullable(),
    created_at: IsoTs,
});

// -------------------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------------------

export type ClientRow = z.infer<typeof ClientRowZ>;
export type CredentialProfileRow = z.infer<typeof CredentialProfileRowZ>;
export type ClientProfileLinkRow = z.infer<typeof ClientProfileLinkRowZ>;
export type SessionJarRow = z.infer<typeof SessionJarRowZ>;
export type RunRow = z.infer<typeof RunRowZ>;
export type RunEventRow = z.infer<typeof RunEventRowZ>;
export type RunArtifactRow = z.infer<typeof RunArtifactRowZ>;

// -------------------------------------------------------------------------------------
// Parsing helpers (nice for query boundaries)
// -------------------------------------------------------------------------------------

export function parseClientRow(row: unknown): ClientRow {
    return ClientRowZ.parse(row);
}
export function parseCredentialProfileRow(row: unknown): CredentialProfileRow {
    return CredentialProfileRowZ.parse(row);
}
export function parseSessionJarRow(row: unknown): SessionJarRow {
    return SessionJarRowZ.parse(row);
}
export function parseRunRow(row: unknown): RunRow {
    return RunRowZ.parse(row);
}
export function parseRunEventRow(row: unknown): RunEventRow {
    return RunEventRowZ.parse(row);
}
export function parseRunArtifactRow(row: unknown): RunArtifactRow {
    return RunArtifactRowZ.parse(row);
}