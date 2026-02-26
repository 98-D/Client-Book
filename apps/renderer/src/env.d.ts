/// <reference types="vite/client" />

import type { ClientBookApi } from "@clientbook/contract";

declare global {
    /**
     * Electron preload bridge (renderer → main)
     *
     * This is the SINGLE SOURCE OF TRUTH.
     * Full interface lives in @clientbook/contract (added as workspace:* dependency).
     * No more duplication or simplified types.
     */
    interface Window {
        /** Full typed ClientBook API (clients, profiles, links, runs, worker, window controls) */
        clientbook?: ClientBookApi;
    }
}

export {};