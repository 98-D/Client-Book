// apps/desktop/src/preload.ts
//
// ClientBook — Preload (CommonJS output -> dist/preload.cjs)
// Keep this file self-contained so it cannot fail due to ESM/CJS import mismatches.

import { contextBridge, ipcRenderer } from "electron";

type Unsubscribe = () => void;
type RunEventPayload = unknown;

type WorkerStatus = Readonly<{
    configured: boolean;
    entryPath: string | null;
    running?: boolean;
    pid?: number | null;
}>;

type WindowResultOk = Readonly<{ ok: true }>;
type WindowResultMax = Readonly<{ maximized: boolean }>;

// IMPORTANT: keep these strings in sync with apps/desktop/src/ipcChannels.ts
const IPC = Object.freeze({
    CLIENTS_LIST: "clients:list",
    CLIENTS_GET: "clients:get",
    CLIENTS_UPSERT: "clients:upsert",
    CLIENTS_DELETE: "clients:delete",

    PROFILES_LIST: "profiles:list",
    PROFILES_GET: "profiles:get",
    PROFILES_UPSERT: "profiles:upsert",
    PROFILES_DELETE: "profiles:delete",

    LINKS_LIST_FOR_CLIENT: "links:listForClient",
    LINKS_LINK: "links:link",
    LINKS_UNLINK: "links:unlink",
    LINKS_SET_DEFAULT: "links:setDefault",

    RUNS_CREATE: "runs:create",
    RUNS_REQUEST_CANCEL: "runs:requestCancel",
    RUNS_LIST_RECENT: "runs:listRecent",
    RUNS_GET_EVENTS: "runs:getEvents",
    RUNS_EVENT_PUSH: "runs:eventPush",

    WORKER_STATUS: "worker:status",

    WINDOW_MINIMIZE: "window:minimize",
    WINDOW_TOGGLE_MAXIMIZE: "window:toggleMaximize",
    WINDOW_IS_MAXIMIZED: "window:isMaximized",
    WINDOW_CLOSE: "window:close",
} as const);

type ClientBookApi = Readonly<{
    version: 1;

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
        status(): Promise<WorkerStatus>;
    }>;

    window: Readonly<{
        minimize(): Promise<WindowResultOk>;
        toggleMaximize(): Promise<WindowResultMax>;
        isMaximized(): Promise<WindowResultMax>;
        close(): Promise<WindowResultOk>;
    }>;
}>;

const ALLOWED_INVOKE_CHANNELS = new Set<string>([
    IPC.CLIENTS_LIST,
    IPC.CLIENTS_GET,
    IPC.CLIENTS_UPSERT,
    IPC.CLIENTS_DELETE,

    IPC.PROFILES_LIST,
    IPC.PROFILES_GET,
    IPC.PROFILES_UPSERT,
    IPC.PROFILES_DELETE,

    IPC.LINKS_LIST_FOR_CLIENT,
    IPC.LINKS_LINK,
    IPC.LINKS_UNLINK,
    IPC.LINKS_SET_DEFAULT,

    IPC.RUNS_CREATE,
    IPC.RUNS_REQUEST_CANCEL,
    IPC.RUNS_LIST_RECENT,
    IPC.RUNS_GET_EVENTS,

    IPC.WORKER_STATUS,

    IPC.WINDOW_MINIMIZE,
    IPC.WINDOW_TOGGLE_MAXIMIZE,
    IPC.WINDOW_IS_MAXIMIZED,
    IPC.WINDOW_CLOSE,
]);

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
        return Promise.reject(new Error(`Blocked IPC invoke: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function onRunEvent(cb: (ev: RunEventPayload) => void): Unsubscribe {
    const handler = (_evt: Electron.IpcRendererEvent, payload: RunEventPayload) => {
        try {
            cb(payload);
        } catch {
            // never let renderer callback crash preload listener
        }
    };
    ipcRenderer.on(IPC.RUNS_EVENT_PUSH, handler);
    return () => ipcRenderer.removeListener(IPC.RUNS_EVENT_PUSH, handler);
}

const api: ClientBookApi = Object.freeze({
    version: 1,

    clients: Object.freeze({
        list: (search?: string) => invoke<any[]>(IPC.CLIENTS_LIST, search),
        get: (id: string) => invoke<any | null>(IPC.CLIENTS_GET, id),
        upsert: (input: unknown) => invoke<{ id: string }>(IPC.CLIENTS_UPSERT, input),
        delete: (id: string) => invoke<{ ok: true }>(IPC.CLIENTS_DELETE, id),
    }),

    profiles: Object.freeze({
        list: () => invoke<any[]>(IPC.PROFILES_LIST),
        get: (id: string) => invoke<any | null>(IPC.PROFILES_GET, id),
        upsert: (input: unknown) => invoke<{ id: string }>(IPC.PROFILES_UPSERT, input),
        delete: (id: string) => invoke<{ ok: true }>(IPC.PROFILES_DELETE, id),
    }),

    links: Object.freeze({
        listForClient: (clientId: string) => invoke<any[]>(IPC.LINKS_LIST_FOR_CLIENT, clientId),
        link: (clientId: string, profileId: string) =>
            invoke<{ ok: true }>(IPC.LINKS_LINK, { clientId, profileId }),
        unlink: (clientId: string, profileId: string) =>
            invoke<{ ok: true }>(IPC.LINKS_UNLINK, { clientId, profileId }),
        setDefault: (clientId: string, profileId: string) =>
            invoke<{ ok: true }>(IPC.LINKS_SET_DEFAULT, { clientId, profileId }),
    }),

    runs: Object.freeze({
        create: (input: unknown) =>
            invoke<{ runId: string; jarId: string; jarPath: string }>(IPC.RUNS_CREATE, input),
        cancel: (runId: string) => invoke<{ ok: true }>(IPC.RUNS_REQUEST_CANCEL, runId),
        listRecent: (limit = 50) => invoke<any[]>(IPC.RUNS_LIST_RECENT, { limit }),
        getEvents: (runId: string, afterSeq = 0, limit = 200) =>
            invoke<any[]>(IPC.RUNS_GET_EVENTS, { runId, afterSeq, limit }),
        onEvent: onRunEvent,
    }),

    worker: Object.freeze({
        status: () => invoke<WorkerStatus>(IPC.WORKER_STATUS),
    }),

    window: Object.freeze({
        minimize: () => invoke<WindowResultOk>(IPC.WINDOW_MINIMIZE),
        toggleMaximize: () => invoke<WindowResultMax>(IPC.WINDOW_TOGGLE_MAXIMIZE),
        isMaximized: () => invoke<WindowResultMax>(IPC.WINDOW_IS_MAXIMIZED),
        close: () => invoke<WindowResultOk>(IPC.WINDOW_CLOSE),
    }),
});

// If renderer says window.clientbook is undefined, preload isn't loading.
contextBridge.exposeInMainWorld("clientbook", api);