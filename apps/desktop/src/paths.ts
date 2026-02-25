// apps/desktop/src/paths.ts
//
// ClientBook — Paths (production)
// - Centralizes all app-owned filesystem locations.
// - Ensures directories exist before use.
// - Keeps session jars deterministic + scoped by profile + scope.
// - Uses Electron app.getPath("userData") so everything is per-user and portable.
//
// Notes:
// - Avoid writing anywhere outside userData to prevent permission issues.
// - The "scope" allows multiple independent sessions (e.g. "rac", "cra-portal").
//

import path from "node:path";
import { app } from "electron";
import { mkdirSync, existsSync } from "node:fs";

export type AppPaths = Readonly<{
    userDataDir: string;
    dbPath: string;
    jarsRootDir: string;
    artifactsRootDir: string;
    logsRootDir: string;
}>;

export function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function getAppPaths(): AppPaths {
    const userDataDir = app.getPath("userData");

    const dbPath = path.join(userDataDir, "clientbook.sqlite");

    const jarsRootDir = path.join(userDataDir, "session-jars");
    const artifactsRootDir = path.join(userDataDir, "artifacts");
    const logsRootDir = path.join(userDataDir, "logs");

    // Ensure roots exist early so later code can assume they exist.
    ensureDir(userDataDir);
    ensureDir(jarsRootDir);
    ensureDir(artifactsRootDir);
    ensureDir(logsRootDir);

    return { userDataDir, dbPath, jarsRootDir, artifactsRootDir, logsRootDir };
}

function safeSegment(s: string): string {
    // Keep it simple: prevent path traversal and Windows-invalid chars.
    const t = (s ?? "").trim();
    if (!t) return "_";
    return t
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/\.+/g, ".")
        .slice(0, 120);
}

export function jarDir(args: { jarsRootDir: string; profileId: string; scope: string }): string {
    const profile = safeSegment(args.profileId);
    const scope = safeSegment(args.scope);
    return path.join(args.jarsRootDir, profile, scope);
}

export function jarStorageStatePath(args: {
    jarsRootDir: string;
    profileId: string;
    scope: string;
}): string {
    const dir = jarDir(args);
    ensureDir(dir);
    return path.join(dir, "storageState.json");
}

export function runArtifactsDir(args: {
    artifactsRootDir: string;
    runId: string;
}): string {
    const dir = path.join(args.artifactsRootDir, safeSegment(args.runId));
    ensureDir(dir);
    return dir;
}