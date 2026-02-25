// apps/desktop/src/env.ts
//
// ClientBook — Environment helpers
// - Determines whether we're running with a dev renderer URL (Vite/React dev server)
// - Centralizes env var names so they're consistent across scripts and platforms
//
// Supported env vars (first match wins):
// - CLIENTBOOK_DEV_URL
// - ELECTRON_RENDERER_URL
// - VITE_DEV_SERVER_URL

const DEV_URL_KEYS = [
    "CLIENTBOOK_DEV_URL",
    "ELECTRON_RENDERER_URL",
    "VITE_DEV_SERVER_URL",
] as const;

export function getDevRendererUrl(): string {
    for (const k of DEV_URL_KEYS) {
        const v = process.env[k];
        if (typeof v === "string") {
            const t = v.trim();
            if (t.length > 0) return t;
        }
    }
    return "";
}

export function isDev(): boolean {
    return getDevRendererUrl().length > 0;
}