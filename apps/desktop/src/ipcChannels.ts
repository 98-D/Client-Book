// apps/desktop/src/ipcChannels.ts
//
// ClientBook — IPC Channel Registry (production)
// - Single source of truth for IPC channel names.
// - Treat as a versioned API surface (renderer <-> main).
// - Namespaces are stable: "clients:*", "profiles:*", "links:*", "runs:*", "worker:*", "window:*".
// - Keep values lowercase and colon-delimited.
//
// NOTE: Any rename here is a breaking change unless you keep an alias.
// If you ever need to migrate, add OLD_* aliases and support both in main.

export const IPC = Object.freeze({
    // -------------------- Clients --------------------
    CLIENTS_LIST: "clients:list",
    CLIENTS_GET: "clients:get",
    CLIENTS_UPSERT: "clients:upsert",
    CLIENTS_DELETE: "clients:delete",

    // -------------------- Credential profiles --------------------
    PROFILES_LIST: "profiles:list",
    PROFILES_GET: "profiles:get",
    PROFILES_UPSERT: "profiles:upsert",
    PROFILES_DELETE: "profiles:delete",

    // -------------------- Client ↔ profile links --------------------
    LINKS_LIST_FOR_CLIENT: "links:listForClient",
    LINKS_LINK: "links:link",
    LINKS_UNLINK: "links:unlink",
    LINKS_SET_DEFAULT: "links:setDefault",

    // -------------------- Runs --------------------
    RUNS_CREATE: "runs:create",
    RUNS_REQUEST_CANCEL: "runs:requestCancel",
    RUNS_LIST_RECENT: "runs:listRecent",
    RUNS_GET_EVENTS: "runs:getEvents",

    // main → renderer push stream
    RUNS_EVENT_PUSH: "runs:eventPush",

    // -------------------- Worker --------------------
    WORKER_STATUS: "worker:status",

    // -------------------- Window controls --------------------
    WINDOW_MINIMIZE: "window:minimize",
    WINDOW_TOGGLE_MAXIMIZE: "window:toggleMaximize",
    WINDOW_IS_MAXIMIZED: "window:isMaximized",
    WINDOW_CLOSE: "window:close",
} as const);

export type IpcKey = keyof typeof IPC;
export type IpcChannel = (typeof IPC)[IpcKey];

// Optional helpers if you want stricter typing at call sites
export type IpcRegistry = typeof IPC;
export function isIpcChannel(x: string): x is IpcChannel {
    return (Object.values(IPC) as readonly string[]).includes(x);
}