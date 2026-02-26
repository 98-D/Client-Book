// apps/desktop/src/main.ts
//
// ClientBook — Electron Main Process (production)
// Responsibilities
// - Single source of truth for DB writes (SQLite)
// - Registers IPC handlers
// - Creates the main BrowserWindow (frameless custom titlebar)
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

function installProcessGuards(): void {
    process.on("uncaughtException", (err) => {
        logErr("uncaughtException:", err);
    });

    process.on("unhandledRejection", (reason) => {
        logErr("unhandledRejection:", reason);
    });
}

async function bootstrap(): Promise<void> {
    const paths = getAppPaths();
    log("userData:", paths.userDataDir);

    // DB init + migrations (main process only)
    getDb();

    // IPC handlers (main process only)
    registerIpcHandlers();

    // Window
    await createMainWindow();
}

function focusFirstWindow(): void {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

installProcessGuards();

/**
 * Single instance lock should be requested ASAP.
 * This prevents two mains from racing and corrupting DB / worker state.
 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        focusFirstWindow();
    });

    app.on("window-all-closed", () => {
        // macOS: keep app open until cmd+q
        if (process.platform !== "darwin") app.quit();
    });

    app.on("activate", () => {
        // macOS: recreate window when dock icon clicked and no windows exist
        if (BrowserWindow.getAllWindows().length === 0) {
            void createMainWindow();
        } else {
            focusFirstWindow();
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

    app
        .whenReady()
        .then(async () => {
            await bootstrap();
            log("ready");
        })
        .catch((err) => {
            logErr("bootstrap failed:", err);
            app.quit();
        });
}