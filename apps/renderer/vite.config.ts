// apps/renderer/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],

    // Keep paths simple + predictable for Electron.
    base: "./",

    server: {
        port: 5173,
        strictPort: true,
    },

    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        target: "es2022",
    },
});