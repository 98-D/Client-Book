// apps/renderer/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const isDev = mode === "development";

    return {
        plugins: [react()],

        // Keep paths simple + predictable for Electron.
        // This ensures built assets resolve correctly when loaded from file://
        base: "./",

        server: {
            port: 5173,
            strictPort: true,

            // Important for Electron: bind to localhost explicitly.
            // (Electron loads http://localhost:5173, not the LAN IP.)
            host: "127.0.0.1",

            // If you ever load using a different hostname, this prevents "Invalid Host header"
            // allowedHosts: ["localhost", "127.0.0.1"],

            // HMR can be finicky in Electron; this makes it explicit.
            hmr: {
                host: "127.0.0.1",
                protocol: "ws",
                port: 5173,
            },
        },

        build: {
            outDir: "dist",
            emptyOutDir: true,

            // In dev you usually want maps; in prod they bloat.
            sourcemap: isDev,

            target: "es2022",

            rollupOptions: {
                output: {
                    // More predictable file names (helps when debugging Electron load issues).
                    // If you prefer hashed filenames for caching, remove these.
                    entryFileNames: "assets/index.js",
                    chunkFileNames: "assets/chunk-[name].js",
                    assetFileNames: "assets/[name][extname]",
                },
            },
        },

        // Cleaner console output
        clearScreen: false,
    };
});