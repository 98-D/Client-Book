// apps/desktop/src/workerHost.ts
//
// ClientBook — Automation Worker Host (production)
// - Main process owns DB writes; worker emits events/state only.
// - Worker is an external Node child process (spawn) with a strict NDJSON protocol.
// - Safe in dev + packaged mode.
// - Robust to crash, hang, partial output, and backpressure.
// - Worker may not exist yet: we fail runs with actionable message.
//
// Protocol (stdin/stdout as NDJSON; one JSON object per line)
//
//   Main -> Worker:
//     { t:"hello", v:1, runId }
//     { t:"run.start", v:1, runId, flowId, flowVersion, clientId, profileId, jarId, jarPath, inputJson }
//     { t:"run.cancel", v:1, runId }
//     { t:"run.ping", v:1, runId }
//
//   Worker -> Main:
//     { t:"ready", v:1 }
//     { t:"event", v:1, runId, event:{ type, level?, message?, payload? } }
//     { t:"state", v:1, runId, state, extra? }
//     { t:"error", v:1, runId?, message, details? }
//
// ------------------------------------------------------------------------------------------

import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import path from "node:path";
import type { RunState as RunStateT } from "@clientbook/contract";

const SINGLE_RUN_MODE = true as const;

const READY_TIMEOUT_MS = 10_000;
const STARTING_SPIN_MS = 50;
const STARTING_TIMEOUT_MS = 10_000;

const MAX_STD_LINE = 2_000; // cap noisy output
const MAX_SEND_QUEUE = 500; // prevent unbounded memory if worker stalls

export type WorkerEvent = {
    type: string;
    level?: "debug" | "info" | "warn" | "error";
    message?: string;
    payload?: unknown;
};

export type StartFlowArgs = {
    runId: string;
    flow_id: string;
    flow_version: string;
    client_id: string | null;
    profile_id: string;
    jar_id: string;
    jar_path: string;
    input_json: string;

    onEvent: (ev: WorkerEvent) => void;
    onState: (
        state: RunStateT,
        extra?: Partial<{
            started_at: string | null;
            finished_at: string | null;
            output_json: string | null;
            error_json: string | null;
            jar_id: string | null;
        }>
    ) => void;
};

export type WorkerStatus = {
    configured: boolean;
    entryPath: string | null;
    running: boolean;
    pid: number | null;
};

type HostMsg =
    | { t: "hello"; v: 1; runId: string }
    | {
    t: "run.start";
    v: 1;
    runId: string;
    flowId: string;
    flowVersion: string;
    clientId: string | null;
    profileId: string;
    jarId: string;
    jarPath: string;
    inputJson: string;
}
    | { t: "run.cancel"; v: 1; runId: string }
    | { t: "run.ping"; v: 1; runId: string };

type WorkerMsg =
    | { t: "ready"; v: 1 }
    | { t: "event"; v: 1; runId: string; event: WorkerEvent }
    | {
    t: "state";
    v: 1;
    runId: string;
    state: RunStateT;
    extra?: Record<string, unknown>;
}
    | { t: "error"; v: 1; runId?: string; message: string; details?: unknown };

type WorkerSession = {
    runId: string;
    onEvent: (ev: WorkerEvent) => void;
    onState: StartFlowArgs["onState"];
};

let child: ChildProcessWithoutNullStreams | null = null;
let rl: ReturnType<typeof createInterface> | null = null;

let ready = false;
let starting = false;

// Multiple sessions map (SINGLE_RUN_MODE may still enforce max 1 active run)
const sessions = new Map<string, WorkerSession>();

// NDJSON send queue for backpressure handling
let sendQueue: string[] = [];
let sending = false;

// ------------------------------------------------------------------------------------------
// Worker entry resolution
// ------------------------------------------------------------------------------------------

function defaultWorkerEntryGuess(): string {
    // Dev-friendly guess and a packaged-friendly guess.
    if (app.isPackaged) {
        // Expect worker shipped alongside app resources:
        //   resources/worker/main.js   (recommended)
        return path.resolve(process.resourcesPath, "worker", "main.js");
    }

    // Dev: repo root is process.cwd()
    return path.resolve(process.cwd(), "packages", "worker", "dist", "main.js");
}

export function getWorkerEntryPath(): string | null {
    const env = process.env.CLIENTBOOK_WORKER_ENTRY?.trim();
    if (env) return path.resolve(env);
    return defaultWorkerEntryGuess();
}

function getNodeBinary(): string {
    // Electron main: process.execPath points to electron.exe, not node.
    // Prefer env override. Otherwise assume node is on PATH.
    const env = process.env.CLIENTBOOK_NODE_BINARY?.trim();
    if (env) return env;
    return "node";
}

export function getWorkerStatus(): WorkerStatus {
    const entryPath = getWorkerEntryPath();
    const configured = !!entryPath && existsSync(entryPath);
    return {
        configured,
        entryPath: configured ? entryPath : null,
        running: !!child && !child.killed,
        pid: child?.pid ?? null,
    };
}

// ------------------------------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------------------------------

function nowIso(): string {
    return new Date().toISOString();
}

function isTerminalState(s: RunStateT): boolean {
    // Keep permissive: your contract includes "failed" and likely "closed".
    return s === ("failed" as RunStateT) || s === ("closed" as RunStateT);
}

function clip(s: string): string {
    return s.length > MAX_STD_LINE ? s.slice(0, MAX_STD_LINE) + "…" : s;
}

function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
}

function safeLogFallback(ev: WorkerEvent) {
    // eslint-disable-next-line no-console
    console.log(`[workerHost] ${ev.level ?? "info"} ${ev.type}: ${ev.message ?? ""}`);
}

// ------------------------------------------------------------------------------------------
// NDJSON transport with backpressure
// ------------------------------------------------------------------------------------------

function enqueueSend(line: string) {
    if (!child || child.killed) throw new Error("Worker process is not running");

    if (sendQueue.length >= MAX_SEND_QUEUE) {
        // drop oldest to avoid unbounded memory; keep last N
        sendQueue = sendQueue.slice(Math.floor(MAX_SEND_QUEUE / 2));
    }
    sendQueue.push(line);
    void flushSendQueue();
}

async function flushSendQueue(): Promise<void> {
    if (sending) return;
    if (!child || child.killed) return;

    sending = true;
    try {
        while (sendQueue.length > 0) {
            if (!child || child.killed) break;

            const line = sendQueue.shift()!;
            const ok = child.stdin.write(line);

            if (!ok) {
                await new Promise<void>((resolve) => {
                    if (!child || child.killed) return resolve();
                    child.stdin.once("drain", () => resolve());
                });
            }
        }
    } finally {
        sending = false;
    }
}

function writeMsg(msg: HostMsg) {
    const line = JSON.stringify(msg) + "\n";
    enqueueSend(line);
}

// ------------------------------------------------------------------------------------------
// Worker message handling
// ------------------------------------------------------------------------------------------

function failAllSessions(reason: string, details?: unknown) {
    for (const s of sessions.values()) {
        s.onEvent({
            type: "log",
            level: "error",
            message: `Worker stopped: ${reason}`,
            payload: details ?? {},
        });
        s.onState("failed" as RunStateT, {
            finished_at: nowIso(),
            error_json: JSON.stringify({ message: `Worker stopped: ${reason}`, details: details ?? null }),
        });
    }
    sessions.clear();
}

function handleWorkerMsg(msg: WorkerMsg) {
    if (msg.t === "ready") {
        ready = true;
        return;
    }

    if (msg.t === "event") {
        const s = sessions.get(msg.runId);
        if (s) s.onEvent(msg.event);
        else safeLogFallback(msg.event);
        return;
    }

    if (msg.t === "state") {
        const s = sessions.get(msg.runId);
        if (s) {
            s.onState(msg.state, msg.extra as any);
            if (isTerminalState(msg.state)) {
                sessions.delete(msg.runId);
            }
        }
        return;
    }

    if (msg.t === "error") {
        const errMsg = msg.message || "Worker error";
        const runId = msg.runId;

        if (runId) {
            const s = sessions.get(runId);
            if (s) {
                s.onEvent({
                    type: "log",
                    level: "error",
                    message: errMsg,
                    payload: msg.details ?? {},
                });
                s.onState("failed" as RunStateT, {
                    finished_at: nowIso(),
                    error_json: JSON.stringify({ message: errMsg, details: msg.details ?? null }),
                });
                sessions.delete(runId);
                return;
            }
        }

        // eslint-disable-next-line no-console
        console.error("[workerHost] worker error:", errMsg, msg.details ?? "");
    }
}

function startLineReader(proc: ChildProcessWithoutNullStreams) {
    rl?.close();
    rl = createInterface({ input: proc.stdout });

    rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            // non-JSON output; treat as a log line
            const m = clip(trimmed);
            const only = sessions.size === 1 ? Array.from(sessions.values())[0] : null;
            if (only) only.onEvent({ type: "log", level: "info", message: m });
            else {
                // eslint-disable-next-line no-console
                console.log("[workerHost] stdout:", m);
            }
            return;
        }

        handleWorkerMsg(parsed as WorkerMsg);
    });

    proc.stderr.on("data", (buf) => {
        const m = clip(buf.toString("utf8"));
        const only = sessions.size === 1 ? Array.from(sessions.values())[0] : null;
        if (only) only.onEvent({ type: "log", level: "warn", message: m });
        else {
            // eslint-disable-next-line no-console
            console.warn("[workerHost] stderr:", m);
        }
    });
}

// ------------------------------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------------------------------

function teardownWorker(reason: string, details?: unknown) {
    ready = false;
    starting = false;

    try {
        rl?.close();
    } catch {
        // ignore
    }
    rl = null;

    if (sessions.size > 0) failAllSessions(reason, details);

    const proc = child;
    child = null;

    sendQueue = [];
    sending = false;

    if (proc && !proc.killed) {
        try {
            proc.kill();
        } catch {
            // ignore
        }
    }
}

async function ensureWorkerRunning(): Promise<void> {
    if (child && !child.killed && ready) return;

    if (starting) {
        const start = Date.now();
        while (starting && Date.now() - start < STARTING_TIMEOUT_MS) {
            await sleep(STARTING_SPIN_MS);
            if (child && !child.killed && ready) return;
        }
        if (!ready) throw new Error("Worker did not become ready in time");
        return;
    }

    const entryPath = getWorkerEntryPath();
    if (!entryPath || !existsSync(entryPath)) {
        throw new Error(
            "Worker entry not found. Build packages/worker and/or set CLIENTBOOK_WORKER_ENTRY to the built entry."
        );
    }

    starting = true;
    ready = false;

    const node = getNodeBinary();
    const env = {
        ...process.env,
        CLIENTBOOK_WORKER: "1",
        CLIENTBOOK_APP_USER_DATA: app.getPath("userData"),
    };

    const cwd = app.isPackaged ? process.resourcesPath : process.cwd();

    const proc = spawn(node, [entryPath], {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
    });

    child = proc;
    startLineReader(proc);

    proc.on("exit", (code, signal) => {
        teardownWorker(`exit code=${code ?? "?"} signal=${signal ?? "?"}`);
    });

    proc.on("error", (err) => {
        teardownWorker(`spawn error: ${err instanceof Error ? err.message : String(err)}`, err);
    });

    // Wait for ready message
    const start = Date.now();
    while (!ready && Date.now() - start < READY_TIMEOUT_MS) {
        await sleep(25);
        if (!child || child.killed) break;
    }

    starting = false;

    if (!child || child.killed) throw new Error("Worker failed to start");
    if (!ready) throw new Error("Worker did not send ready signal");
}

// ------------------------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------------------------

export async function startFlowIfWorkerConfigured(args: StartFlowArgs): Promise<void> {
    const entryPath = getWorkerEntryPath();
    const configured = !!entryPath && existsSync(entryPath);

    if (!configured) {
        args.onEvent({
            type: "log",
            level: "warn",
            message:
                "Automation worker not configured yet. Build packages/worker and/or set CLIENTBOOK_WORKER_ENTRY to the worker dist entry.",
            payload: { hint: "Set CLIENTBOOK_WORKER_ENTRY" },
        });

        args.onState("failed" as RunStateT, {
            finished_at: nowIso(),
            error_json: JSON.stringify({
                message: "Worker not configured. Build packages/worker and/or set CLIENTBOOK_WORKER_ENTRY.",
            }),
        });

        return;
    }

    if (SINGLE_RUN_MODE) {
        const other = Array.from(sessions.keys()).find((rid) => rid !== args.runId);
        if (other) {
            args.onEvent({
                type: "log",
                level: "error",
                message: "Worker is already running another job (single-run mode). Cancel the active run first.",
                payload: { activeRunId: other },
            });

            args.onState("failed" as RunStateT, {
                finished_at: nowIso(),
                error_json: JSON.stringify({
                    message: "Worker busy (single-run mode).",
                    activeRunId: other,
                }),
            });

            return;
        }
    }

    await ensureWorkerRunning();

    sessions.set(args.runId, {
        runId: args.runId,
        onEvent: args.onEvent,
        onState: args.onState,
    });

    // greet (optional; helps worker align logs with run)
    try {
        writeMsg({ t: "hello", v: 1, runId: args.runId });
    } catch {
        // ignore
    }

    writeMsg({
        t: "run.start",
        v: 1,
        runId: args.runId,
        flowId: args.flow_id,
        flowVersion: args.flow_version,
        clientId: args.client_id,
        profileId: args.profile_id,
        jarId: args.jar_id,
        jarPath: args.jar_path,
        inputJson: args.input_json,
    });
}

export function cancelRun(runId: string): void {
    if (!child || child.killed) return;
    if (!sessions.has(runId)) return;

    try {
        writeMsg({ t: "run.cancel", v: 1, runId });
    } catch {
        // ignore
    }
}

export function pingRun(runId: string): void {
    if (!child || child.killed) return;
    if (!sessions.has(runId)) return;

    try {
        writeMsg({ t: "run.ping", v: 1, runId });
    } catch {
        // ignore
    }
}

export function shutdownWorker(): void {
    if (!child || child.killed) return;
    teardownWorker("shutdown requested");
}