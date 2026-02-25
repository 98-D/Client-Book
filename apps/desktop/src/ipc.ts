// apps/desktop/src/ipc.ts
import { BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import {
    appendRunEvent,
    createRun,
    deleteClient,
    deleteCredentialProfile,
    getClient,
    getCredentialProfile,
    getSessionJarByProfileScope,
    linkClientToProfile,
    listClientProfiles,
    listClients,
    listCredentialProfiles,
    requestCancelRun,
    setRunState,
    unlinkClientFromProfile,
    upsertClient,
    upsertCredentialProfile,
    upsertSessionJar,
} from "@clientbook/db";
import type { RunState as RunStateT } from "@clientbook/contract";
import { getDb } from "./db.js";
import { IPC } from "./ipcChannels.js";
import { encryptToB64 } from "./secureStore.js";
import { getAppPaths, jarStorageStatePath } from "./paths.js";
import { getWorkerStatus, startFlowIfWorkerConfigured } from "./workerHost.js";

// -------------------- Zod input validators --------------------

const IdZ = z.string().min(1);

const UpsertClientInputZ = z.object({
    id: IdZ.optional(),
    company_name: z.string().min(1),
    bn: z.string().regex(/^\d{9}$/),
    year_end_date: z.string().nullable().optional(),
    can: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
});

const UpsertProfileInputZ = z.object({
    id: IdZ.optional(),
    label: z.string().min(1),
    username: z.string().min(1),
    passwordPlain: z.string().min(1),
    notes: z.string().nullable().optional(),
});

const LinkInputZ = z.object({
    clientId: IdZ,
    profileId: IdZ,
});

const RunCreateInputZ = z.object({
    flow_id: z.string().min(1),
    flow_version: z.string().min(1).default("0.0.0"),
    client_id: IdZ.nullable().optional(),
    profile_id: IdZ,
    scope: z.string().min(1).default("rac"),
    input_json: z.string().min(2),
});

const RunListRecentInputZ = z.object({
    limit: z.number().int().min(1).max(200).default(50),
});

const RunGetEventsInputZ = z.object({
    runId: IdZ,
    afterSeq: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(200),
});

// -------------------- Helpers --------------------

function broadcastRunEvent(payload: unknown) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.RUNS_EVENT_PUSH, payload);
    }
}

function safeJson(obj: unknown): string {
    return JSON.stringify(obj ?? {});
}

// -------------------- Registration --------------------

export function registerIpcHandlers() {
    const db = getDb();

    // Clients
    ipcMain.handle(IPC.CLIENTS_LIST, (_evt, search: unknown) => {
        const s = typeof search === "string" ? search : undefined;
        return listClients(db, s);
    });

    ipcMain.handle(IPC.CLIENTS_GET, (_evt, id: unknown) => {
        const clientId = IdZ.parse(id);
        return getClient(db, clientId);
    });

    ipcMain.handle(IPC.CLIENTS_UPSERT, (_evt, input: unknown) => {
        const parsed = UpsertClientInputZ.parse(input);
        const id = upsertClient(db, parsed);
        return { id };
    });

    ipcMain.handle(IPC.CLIENTS_DELETE, (_evt, id: unknown) => {
        const clientId = IdZ.parse(id);
        deleteClient(db, clientId);
        return { ok: true as const };
    });

    // Profiles
    ipcMain.handle(IPC.PROFILES_LIST, () => {
        const rows = listCredentialProfiles(db);
        return rows.map((r) => ({
            id: r.id,
            label: r.label,
            username: r.username,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            last_used_at: r.last_used_at,
        }));
    });

    ipcMain.handle(IPC.PROFILES_GET, (_evt, id: unknown) => {
        const profileId = IdZ.parse(id);
        const r = getCredentialProfile(db, profileId);
        if (!r) return null;
        return {
            id: r.id,
            label: r.label,
            username: r.username,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            last_used_at: r.last_used_at,
        };
    });

    ipcMain.handle(IPC.PROFILES_UPSERT, (_evt, input: unknown) => {
        const parsed = UpsertProfileInputZ.parse(input);
        const password_enc_b64 = encryptToB64(parsed.passwordPlain);

        const id = upsertCredentialProfile(db, {
            id: parsed.id,
            label: parsed.label,
            username: parsed.username,
            password_enc_b64,
            notes: parsed.notes ?? null,
        });

        return { id };
    });

    ipcMain.handle(IPC.PROFILES_DELETE, (_evt, id: unknown) => {
        const profileId = IdZ.parse(id);
        deleteCredentialProfile(db, profileId);
        return { ok: true as const };
    });

    // Links
    ipcMain.handle(IPC.LINKS_LIST_FOR_CLIENT, (_evt, clientId: unknown) => {
        const cid = IdZ.parse(clientId);
        return listClientProfiles(db, cid);
    });

    ipcMain.handle(IPC.LINKS_LINK, (_evt, input: unknown) => {
        const { clientId, profileId } = LinkInputZ.parse(input);
        linkClientToProfile(db, clientId, profileId, { is_default: false });
        return { ok: true as const };
    });

    ipcMain.handle(IPC.LINKS_UNLINK, (_evt, input: unknown) => {
        const { clientId, profileId } = LinkInputZ.parse(input);
        unlinkClientFromProfile(db, clientId, profileId);
        return { ok: true as const };
    });

    ipcMain.handle(IPC.LINKS_SET_DEFAULT, (_evt, input: unknown) => {
        const { clientId, profileId } = LinkInputZ.parse(input);
        linkClientToProfile(db, clientId, profileId, { is_default: true });
        return { ok: true as const };
    });

    // Runs
    ipcMain.handle(IPC.RUNS_CREATE, async (_evt, input: unknown) => {
        const parsed = RunCreateInputZ.parse(input);

        // Reserve jar path (even before worker writes file)
        const { jarsRootDir } = getAppPaths();
        const jarPath = jarStorageStatePath({
            jarsRootDir,
            profileId: parsed.profile_id,
            scope: parsed.scope,
        });

        const existingJar = getSessionJarByProfileScope(db, parsed.profile_id, parsed.scope);
        const jarId = upsertSessionJar(db, {
            id: existingJar?.id,
            profile_id: parsed.profile_id,
            scope: parsed.scope,
            storage_state_path: jarPath,
            metadata_json: existingJar?.metadata_json ?? "{}",
        });

        const runId = createRun(db, {
            flow_id: parsed.flow_id,
            flow_version: parsed.flow_version,
            client_id: parsed.client_id ?? null,
            profile_id: parsed.profile_id,
            jar_id: jarId,
            input_json: parsed.input_json,
        });

        appendRunEvent(db, runId, {
            type: "log",
            level: "info",
            message: `Run queued: ${parsed.flow_id}@${parsed.flow_version}`,
            payload: { flow_id: parsed.flow_id, flow_version: parsed.flow_version },
        });

        broadcastRunEvent({
            type: "log",
            runId,
            level: "info",
            message: `Run queued: ${parsed.flow_id}@${parsed.flow_version}`,
            ts: new Date().toISOString(),
        });

        try {
            setRunState(db, runId, "running" satisfies RunStateT, {
                started_at: new Date().toISOString(),
                jar_id: jarId,
            });

            appendRunEvent(db, runId, {
                type: "state",
                level: "info",
                message: "State -> running",
                payload: { state: "running" },
            });

            broadcastRunEvent({
                type: "state",
                runId,
                state: "running",
                ts: new Date().toISOString(),
            });

            await startFlowIfWorkerConfigured({
                runId,
                flow_id: parsed.flow_id,
                flow_version: parsed.flow_version,
                client_id: parsed.client_id ?? null,
                profile_id: parsed.profile_id,
                jar_id: jarId,
                jar_path: jarPath,
                input_json: parsed.input_json,
                onEvent: (ev) => {
                    appendRunEvent(db, runId, {
                        type: ev.type,
                        level: ev.level,
                        message: ev.message,
                        payload: ev.payload,
                    });
                    broadcastRunEvent({
                        type: ev.type,
                        runId,
                        level: ev.level,
                        message: ev.message,
                        payload: ev.payload,
                        ts: new Date().toISOString(),
                    });
                },
                onState: (state, extra) => {
                    setRunState(db, runId, state, extra);
                    appendRunEvent(db, runId, {
                        type: "state",
                        level: "info",
                        message: `State -> ${state}`,
                        payload: { state, ...(extra ?? {}) },
                    });
                    broadcastRunEvent({
                        type: "state",
                        runId,
                        state,
                        ts: new Date().toISOString(),
                    });
                },
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to start run";
            setRunState(db, runId, "failed" satisfies RunStateT, {
                finished_at: new Date().toISOString(),
                error_json: safeJson({ message: msg }),
            });
            appendRunEvent(db, runId, {
                type: "log",
                level: "error",
                message: msg,
                payload: { error: msg },
            });
            broadcastRunEvent({
                type: "log",
                runId,
                level: "error",
                message: msg,
                ts: new Date().toISOString(),
            });
        }

        return { runId, jarId, jarPath };
    });

    ipcMain.handle(IPC.RUNS_REQUEST_CANCEL, (_evt, runId: unknown) => {
        const rid = IdZ.parse(runId);
        requestCancelRun(db, rid);
        appendRunEvent(db, rid, {
            type: "log",
            level: "warn",
            message: "Cancel requested",
            payload: {},
        });
        broadcastRunEvent({
            type: "log",
            runId: rid,
            level: "warn",
            message: "Cancel requested",
            ts: new Date().toISOString(),
        });
        return { ok: true as const };
    });

    ipcMain.handle(IPC.RUNS_LIST_RECENT, (_evt, input: unknown) => {
        const { limit } = RunListRecentInputZ.parse(input ?? {});
        const rows = db
            .prepare(
                `
                    SELECT *
                    FROM automation_runs
                    ORDER BY queued_at DESC
                        LIMIT ?
                `
            )
            .all(limit);
        return rows;
    });

    ipcMain.handle(IPC.RUNS_GET_EVENTS, (_evt, input: unknown) => {
        const { runId, afterSeq, limit } = RunGetEventsInputZ.parse(input);
        const rows = db
            .prepare(
                `
                    SELECT *
                    FROM run_events
                    WHERE run_id = ? AND seq > ?
                    ORDER BY seq ASC
                        LIMIT ?
                `
            )
            .all(runId, afterSeq, limit);
        return rows;
    });

    ipcMain.handle(IPC.WORKER_STATUS, () => getWorkerStatus());
}