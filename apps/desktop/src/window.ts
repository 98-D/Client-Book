// apps/desktop/src/window.ts
import { BrowserWindow, nativeTheme, shell } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDevRendererUrl, isDev } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePreloadPath(): string {
    // With the fixed setup, preload is ESM TS compiled to dist/preload.js
    const p = path.join(__dirname, "preload.js");
    if (!existsSync(p)) {
        // Helpful error that points to the real fix if build/copy is wrong
        throw new Error(
            `[desktop] preload not found at ${p}. Did you rename src/preload.cts -> src/preload.ts and rebuild?`
        );
    }
    return p;
}

export async function createMainWindow(): Promise<BrowserWindow> {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0b0b" : "#ffffff",
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            preload: resolvePreloadPath(),
        },
    });

    win.once("ready-to-show", () => win.show());

    // Block new windows; open external links in browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
    });

    // Block unexpected navigations (only allow our app content)
    win.webContents.on("will-navigate", (e, url) => {
        const devUrl = getDevRendererUrl();
        const allowed =
            (devUrl.length > 0 && url.startsWith(devUrl)) || url.startsWith("file://");

        if (!allowed) {
            e.preventDefault();
            void shell.openExternal(url);
        }
    });

    if (isDev()) {
        const url = getDevRendererUrl();
        await win.loadURL(url);
        win.webContents.openDevTools({ mode: "detach" });
    } else {
        // Expect renderer build output at apps/renderer/dist/index.html
        const indexHtml = path.resolve(
            process.cwd(),
            "apps",
            "renderer",
            "dist",
            "index.html"
        );

        if (!existsSync(indexHtml)) {
            throw new Error(
                `[desktop] renderer index.html not found at ${indexHtml}. Build the renderer first (apps/renderer) or adjust the path.`
            );
        }

        await win.loadFile(indexHtml);
    }

    return win;
}