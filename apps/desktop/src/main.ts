// apps/desktop/src/main.ts
//
// ClientBook — Electron Main Process (production)
// Responsibilities
// - Single source of truth for DB writes (SQLite)
// - Registers IPC handlers
// - Creates the main BrowserWindow
// - Hardens navigation / lifetime behavior
// - Centralizes startup error handling and logging
//
// Notes
// - Keep main process stable: automation runs in a separate worker process.
// - Avoid doing heavy work before app.whenReady().
// - Prefer fail-fast on critical startup issues (DB / preload / renderer path).

import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./ipc.js";
import { createMainWindow } from "./window.js";
import { getDb } from "./db.js";
import { getAppPaths } from "./paths.js";
import { shutdownWorker } from "./workerHost.js";

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[desktop]", ...args);
}

function logErr(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.error("[desktop]", ...args);
}

function installProcessGuards() {
    process.on("uncaughtException", (err) => {
        logErr("uncaughtException:", err);
    });

    process.on("unhandledRejection", (reason) => {
        logErr("unhandledRejection:", reason);
    });
}

async function bootstrap(): Promise<void> {
    // Ensure userData + roots exist
    const paths = getAppPaths();
    log("userData:", paths.userDataDir);

    // Init DB (migrations happen here). This must happen in main process.
    getDb();

    // IPC
    registerIpcHandlers();

    // Window
    await createMainWindow();
}

app.on("window-all-closed", () => {
    // macOS: keep app open until cmd+q
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    // macOS: recreate window when dock icon clicked and no windows exist
    if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
    }
});

app.on("before-quit", () => {
    // Best-effort shutdown of worker
    try {
        shutdownWorker();
    } catch {
        // ignore
    }
});

installProcessGuards();

app
    .whenReady()
    .then(async () => {
        // Optional: keep single-instance lock (prevents DB contention)
        const gotLock = app.requestSingleInstanceLock();
        if (!gotLock) {
            app.quit();
            return;
        }

        app.on("second-instance", () => {
            // Focus existing window
            const win = BrowserWindow.getAllWindows()[0];
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
            }
        });

        await bootstrap();
        log("ready");
    })
    .catch((err) => {
        logErr("bootstrap failed:", err);
        app.quit();
    });