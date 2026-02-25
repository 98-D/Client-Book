import { z } from "zod";

export const ClientRowZ = z.object({
    id: z.string(),
    company_name: z.string(),
    bn: z.string(),
    year_end_date: z.string().nullable().optional(),
    can: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    tags_json: z.string().optional(),
});
export type ClientRow = z.infer<typeof ClientRowZ>;

export const ProfileRowZ = z.object({
    id: z.string(),
    label: z.string(),
    username: z.string(),
    notes: z.string().nullable().optional(),
    last_used_at: z.string().nullable().optional(),
});
export type ProfileRow = z.infer<typeof ProfileRowZ>;

export const ClientProfileLinkRowZ = z.object({
    profile_id: z.string(),
    is_default: z.union([z.literal(0), z.literal(1)]),
    label: z.string(),
    username: z.string(),
});
export type ClientProfileLinkRow = z.infer<typeof ClientProfileLinkRowZ>;

export const RunRowZ = z.object({
    id: z.string(),
    flow_id: z.string(),
    flow_version: z.string(),
    client_id: z.string().nullable().optional(),
    profile_id: z.string(),
    jar_id: z.string().nullable().optional(),
    state: z.string(),
    input_json: z.string(),
    output_json: z.string().nullable().optional(),
    error_json: z.string().nullable().optional(),
    queued_at: z.string().optional(),
});
export type RunRow = z.infer<typeof RunRowZ>;

export const RunEventRowZ = z.object({
    run_id: z.string(),
    seq: z.number(),
    ts: z.string(),
    type: z.string(),
    level: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    payload_json: z.string(),
});
export type RunEventRow = z.infer<typeof RunEventRowZ>;

export const RunPushEventZ = z.object({
    type: z.string(),
    runId: z.string(),
    level: z.string().optional(),
    message: z.string().optional(),
    payload: z.unknown().optional(),
    ts: z.string().optional(),
    state: z.string().optional(),
});
export type RunPushEvent = z.infer<typeof RunPushEventZ>;