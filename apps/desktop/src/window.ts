// apps/desktop/src/window.ts
import { BrowserWindow, shell } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const TITLEBAR_HEIGHT = 34;

function getDevRendererUrl(): string {
    return (
        process.env.CLIENTBOOK_DEV_URL ??
        process.env.ELECTRON_RENDERER_URL ??
        process.env.VITE_DEV_SERVER_URL ??
        ""
    );
}

function resolvePreloadPath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));

    // Prefer CommonJS preload that Electron will load synchronously and reliably.
    const candidates = [
        path.join(here, "preload.cjs"),
        path.join(here, "preload.js"),
        path.join(here, "preload.mjs"),

        // fallback(s) if you ever decide to place preload in a folder
        path.join(here, "preload", "index.cjs"),
        path.join(here, "preload", "index.js"),
        path.join(here, "preload", "index.mjs"),
    ];

    const found = candidates.find(existsSync);
    if (!found) {
        throw new Error(
            ["Preload not found. Searched:", ...candidates.map((c) => `  - ${c}`)].join("\n")
        );
    }
    return found;
}

function resolveProdIndexHtml(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));

    const candidates = [path.join(here, "renderer", "index.html"), path.join(here, "index.html")];
    const found = candidates.find(existsSync);
    if (!found) {
        throw new Error(
            [
                "Renderer index.html not found. Searched:",
                ...candidates.map((c) => `  - ${c}`),
                "",
                "Fix: ensure copy:renderer copies renderer dist into apps/desktop/dist/renderer/",
            ].join("\n")
        );
    }
    return found;
}

export async function createMainWindow(): Promise<BrowserWindow> {
    const devUrl = getDevRendererUrl();
    const isDev = devUrl.trim().length > 0;

    const preloadPath = resolvePreloadPath();
    // eslint-disable-next-line no-console
    console.log("[desktop] preload:", preloadPath);

    const win = new BrowserWindow({
        width: 650,
        height: 550,
        minWidth: 625,
        minHeight: 400,
        backgroundColor: "#0b0b0c",
        frame: false,
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: "#0b0b0c",
            symbolColor: "#cfcfd2",
            height: TITLEBAR_HEIGHT,
        },
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
        },
    });

    // Block unexpected navigations; open external links in OS browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
    });

    win.webContents.on("will-navigate", (e, url) => {
        const okDev = isDev && url.startsWith(devUrl);
        const okProd = !isDev && url.startsWith("file://");
        if (okDev || okProd) return;
        e.preventDefault();
        void shell.openExternal(url);
    });

    if (isDev) {
        await win.loadURL(devUrl);
    } else {
        const indexHtml = resolveProdIndexHtml();
        await win.loadURL(pathToFileURL(indexHtml).toString());
    }

    return win;
}