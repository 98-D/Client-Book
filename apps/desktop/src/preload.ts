// apps/desktop/src/preload.ts
//
// ClientBook — Preload (production)
// - Exposes a minimal, typed, stable API to the renderer via contextBridge
// - No Node exposure in renderer (contextIsolation on)
// - All calls go through ipcRenderer.invoke with validated channels
// - Provides subscribe/unsubscribe for run event stream
//
// IMPORTANT:
// - Keep this surface small and versionable.
// - Do not pass secrets (plaintext passwords) back to renderer.
// - Renderer should treat this API as the ONLY bridge to main.

import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./ipcChannels.js";

type Unsubscribe = () => void;

type RunEventPayload = unknown;

type ClientBookApi = Readonly<{
    clients: Readonly<{
        list(search?: string): Promise<any[]>;
        get(id: string): Promise<any | null>;
        upsert(input: unknown): Promise<{ id: string }>;
        delete(id: string): Promise<{ ok: true }>;
    }>;

    profiles: Readonly<{
        list(): Promise<any[]>;
        get(id: string): Promise<any | null>;
        upsert(input: unknown): Promise<{ id: string }>;
        delete(id: string): Promise<{ ok: true }>;
    }>;

    links: Readonly<{
        listForClient(clientId: string): Promise<any[]>;
        link(clientId: string, profileId: string): Promise<{ ok: true }>;
        unlink(clientId: string, profileId: string): Promise<{ ok: true }>;
        setDefault(clientId: string, profileId: string): Promise<{ ok: true }>;
    }>;

    runs: Readonly<{
        create(input: unknown): Promise<{ runId: string; jarId: string; jarPath: string }>;
        cancel(runId: string): Promise<{ ok: true }>;
        listRecent(limit?: number): Promise<any[]>;
        getEvents(runId: string, afterSeq?: number, limit?: number): Promise<any[]>;
        onEvent(cb: (ev: RunEventPayload) => void): Unsubscribe;
    }>;

    worker: Readonly<{
        status(): Promise<{ configured: boolean; entryPath: string | null; running?: boolean; pid?: number | null }>;
    }>;
}>;

function onRunEvent(cb: (ev: RunEventPayload) => void): Unsubscribe {
    const handler = (_evt: Electron.IpcRendererEvent, payload: RunEventPayload) => cb(payload);
    ipcRenderer.on(IPC.RUNS_EVENT_PUSH, handler);
    return () => ipcRenderer.removeListener(IPC.RUNS_EVENT_PUSH, handler);
}

const api: ClientBookApi = Object.freeze({
    clients: Object.freeze({
        list: (search?: string) => ipcRenderer.invoke(IPC.CLIENTS_LIST, search),
        get: (id: string) => ipcRenderer.invoke(IPC.CLIENTS_GET, id),
        upsert: (input: unknown) => ipcRenderer.invoke(IPC.CLIENTS_UPSERT, input),
        delete: (id: string) => ipcRenderer.invoke(IPC.CLIENTS_DELETE, id),
    }),

    profiles: Object.freeze({
        list: () => ipcRenderer.invoke(IPC.PROFILES_LIST),
        get: (id: string) => ipcRenderer.invoke(IPC.PROFILES_GET, id),
        upsert: (input: unknown) => ipcRenderer.invoke(IPC.PROFILES_UPSERT, input),
        delete: (id: string) => ipcRenderer.invoke(IPC.PROFILES_DELETE, id),
    }),

    links: Object.freeze({
        listForClient: (clientId: string) => ipcRenderer.invoke(IPC.LINKS_LIST_FOR_CLIENT, clientId),
        link: (clientId: string, profileId: string) => ipcRenderer.invoke(IPC.LINKS_LINK, { clientId, profileId }),
        unlink: (clientId: string, profileId: string) => ipcRenderer.invoke(IPC.LINKS_UNLINK, { clientId, profileId }),
        setDefault: (clientId: string, profileId: string) =>
            ipcRenderer.invoke(IPC.LINKS_SET_DEFAULT, { clientId, profileId }),
    }),

    runs: Object.freeze({
        create: (input: unknown) => ipcRenderer.invoke(IPC.RUNS_CREATE, input),
        cancel: (runId: string) => ipcRenderer.invoke(IPC.RUNS_REQUEST_CANCEL, runId),
        listRecent: (limit = 50) => ipcRenderer.invoke(IPC.RUNS_LIST_RECENT, { limit }),
        getEvents: (runId: string, afterSeq = 0, limit = 200) =>
            ipcRenderer.invoke(IPC.RUNS_GET_EVENTS, { runId, afterSeq, limit }),
        onEvent: onRunEvent,
    }),

    worker: Object.freeze({
        status: () => ipcRenderer.invoke(IPC.WORKER_STATUS),
    }),
});

contextBridge.exposeInMainWorld("clientbook", api);