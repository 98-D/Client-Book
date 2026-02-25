// apps/desktop/src/ipcChannels.ts
//
// ClientBook — IPC Channel Registry (production)
// - Single source of truth for IPC channel names.
// - Keep stable over time (treat as API).
// - Use consistent namespaces: "clients:*", "profiles:*", "links:*", "runs:*", "worker:*".
//

export const IPC = Object.freeze({
    // Clients
    CLIENTS_LIST: "clients:list",
    CLIENTS_GET: "clients:get",
    CLIENTS_UPSERT: "clients:upsert",
    CLIENTS_DELETE: "clients:delete",

    // Credential profiles
    PROFILES_LIST: "profiles:list",
    PROFILES_GET: "profiles:get",
    PROFILES_UPSERT: "profiles:upsert",
    PROFILES_DELETE: "profiles:delete",

    // Client ↔ profile links
    LINKS_LIST_FOR_CLIENT: "links:listForClient",
    LINKS_LINK: "links:link",
    LINKS_UNLINK: "links:unlink",
    LINKS_SET_DEFAULT: "links:setDefault",

    // Runs
    RUNS_CREATE: "runs:create",
    RUNS_REQUEST_CANCEL: "runs:cancel",
    RUNS_LIST_RECENT: "runs:listRecent",
    RUNS_GET_EVENTS: "runs:getEvents",

    // Run event push (main → renderer)
    RUNS_EVENT_PUSH: "runs:event",

    // Worker (status/control)
    WORKER_STATUS: "worker:status",
} as const);

export type IpcChannel = (typeof IPC)[keyof typeof IPC];