import type { ClientbookIpcApi } from "@clientbook/contract";

declare global {
    interface Window {
        clientbook: ClientbookIpcApi;
    }
}

export {};