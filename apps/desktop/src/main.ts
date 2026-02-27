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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerIpcHandlers } from "./ipc.js";
import { createMainWindow } from "./window.js";
import { getDb } from "./db.js";
import { getAppPaths } from "./paths.js";
import { shutdownWorker } from "./workerHost.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * Runtime icon path.
 * IMPORTANT: ensure build copies `src/assets/*` -> `dist/assets/*`
 * so these exist next to compiled main.js at runtime.
 */
function getIconPath(): string | undefined {
    const assetsDir = path.join(__dirname, "assets");
    const ico = path.join(assetsDir, "icon.ico");
    const png = path.join(assetsDir, "icon.png");

    // Windows taskbar prefers .ico. Linux generally likes png.
    if (process.platform === "win32") return ico;
    return png;
}

async function bootstrap(): Promise<void> {
    const paths = getAppPaths();
    log("userData:", paths.userDataDir);

    // Windows: helps grouping + pinned icon behavior
    if (process.platform === "win32") {
        // choose a stable id; must match your app identity
        app.setAppUserModelId("com.clientbook.desktop");
    }

    // macOS Dock icon (dev + prod)
    if (process.platform === "darwin") {
        try {
            const iconPath = getIconPath();
            if (iconPath) app.dock.setIcon(iconPath);
        } catch (e) {
            logErr("dock.setIcon failed:", e);
        }
    }

    // DB init + migrations (main process only)
    getDb();

    // IPC handlers (main process only)
    registerIpcHandlers();

    // Window (pass icon hint through env so window.ts can consume without circular deps)
    // If you control createMainWindow signature, better to pass as param.
    process.env.CLIENTBOOK_ICON_PATH = getIconPath() ?? "";

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