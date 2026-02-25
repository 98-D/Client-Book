// apps/desktop/src/workerHost.ts
//
// ClientBook — Automation Worker Host (production-grade stub + real process wiring)
//
// Goals
// - Main process owns DB writes; worker emits events/state only.
// - Worker is an external Node/Electron child process (spawn) with a strict JSON-lines protocol.
// - Safe in dev + packaged mode.
// - Robust to crash, hang, partial output, and backpressure.
// - Does NOT require the worker to exist yet: fails runs with actionable message.
//
// Protocol (stdin/stdout as NDJSON; one JSON object per line)
//   Main -> Worker:
//     { t:"hello", v:1, runId }
//     { t:"run.start", v:1, runId, flowId, flowVersion, clientId, profileId, jarId, jarPath, inputJson }
//     { t:"run.cancel", v:1, runId }
//     { t:"run.ping", v:1, runId }
//
//   Worker -> Main:
//     { t:"event", v:1, runId, event:{ type, level?, message?, payload? } }
//     { t:"state", v:1, runId, state, extra? }
//     { t:"ready", v:1 }
//     { t:"error", v:1, runId?, message, details? }
//
// Notes
// - startFlowIfWorkerConfigured currently supports a single active run per app session.
//   (Easy to expand to multiple runs by mapping runId -> session.)
// - You can make the worker a long-lived singleton. That’s what we do here.
//
// ------------------------------------------------------------------------------------------

import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import path from "node:path";
import type { RunState as RunStateT } from "@clientbook/contract";

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

// single-run mapping (upgrade later if needed)
let active: WorkerSession | null = null;

// ------------------------------------------------------------------------------------------
// Worker entry resolution
// ------------------------------------------------------------------------------------------

function defaultWorkerEntryGuess(): string {
    // Dev: repo root is process.cwd(). Packaged: put worker in resources or set env.
    // We keep the "guess" dev-friendly.
    const base = app.isPackaged ? process.resourcesPath : process.cwd();
    return path.resolve(base, "packages", "worker", "dist", "main.js");
}

export function getWorkerEntryPath(): string | null {
    const env = process.env.CLIENTBOOK_WORKER_ENTRY?.trim();
    if (env) return path.resolve(env);
    return defaultWorkerEntryGuess();
}

function getNodeBinary(): string {
    // Electron main process: process.execPath points to electron.exe
    // For a pure node worker, we prefer NODE_BINARY if set, else use "node" from PATH.
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
// JSON-lines transport
// ------------------------------------------------------------------------------------------

function writeMsg(msg: HostMsg) {
    if (!child || child.killed) throw new Error("Worker process is not running");
    child.stdin.write(JSON.stringify(msg) + "\n");
}

function safeLogFallback(ev: WorkerEvent) {
    // eslint-disable-next-line no-console
    console.log(`[workerHost] ${ev.level ?? "info"} ${ev.type}: ${ev.message ?? ""}`);
}

function handleWorkerMsg(msg: WorkerMsg) {
    if (msg.t === "ready") {
        ready = true;
        return;
    }

    if (msg.t === "event") {
        if (active && active.runId === msg.runId) active.onEvent(msg.event);
        else safeLogFallback(msg.event);
        return;
    }

    if (msg.t === "state") {
        if (active && active.runId === msg.runId) {
            // extra is untyped; we pass it through as-is
            active.onState(msg.state, msg.extra as any);
        }
        return;
    }

    if (msg.t === "error") {
        const errMsg = msg.message || "Worker error";
        const runId = msg.runId;

        if (runId && active && active.runId === runId) {
            active.onEvent({
                type: "log",
                level: "error",
                message: errMsg,
                payload: msg.details ?? {},
            });
            active.onState("failed", {
                finished_at: new Date().toISOString(),
                error_json: JSON.stringify({ message: errMsg, details: msg.details ?? null }),
            });
            active = null;
        } else {
            // eslint-disable-next-line no-console
            console.error("[workerHost] worker error:", errMsg, msg.details ?? "");
        }
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
            const m = trimmed.length > 2000 ? trimmed.slice(0, 2000) + "…" : trimmed;
            if (active) {
                active.onEvent({ type: "log", level: "info", message: m });
            } else {
                // eslint-disable-next-line no-console
                console.log("[workerHost] stdout:", m);
            }
            return;
        }

        const msg = parsed as WorkerMsg;
        handleWorkerMsg(msg);
    });

    proc.stderr.on("data", (buf) => {
        const text = buf.toString("utf8");
        const m = text.length > 2000 ? text.slice(0, 2000) + "…" : text;

        if (active) {
            active.onEvent({ type: "log", level: "warn", message: m });
        } else {
            // eslint-disable-next-line no-console
            console.warn("[workerHost] stderr:", m);
        }
    });
}

function teardownWorker(reason: string) {
    ready = false;
    starting = false;

    try {
        rl?.close();
    } catch {
        // ignore
    }
    rl = null;

    const proc = child;
    child = null;

    if (active) {
        active.onEvent({
            type: "log",
            level: "error",
            message: `Worker stopped: ${reason}`,
        });
        active.onState("failed", {
            finished_at: new Date().toISOString(),
            error_json: JSON.stringify({ message: `Worker stopped: ${reason}` }),
        });
        active = null;
    }

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
        // wait until ready or timeout
        const start = Date.now();
        while (starting && Date.now() - start < 10_000) {
            await new Promise((r) => setTimeout(r, 50));
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

    const proc = spawn(node, [entryPath], {
        cwd: process.cwd(),
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
        teardownWorker(`spawn error: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Wait for ready message (max 10s)
    const start = Date.now();
    while (!ready && Date.now() - start < 10_000) {
        await new Promise((r) => setTimeout(r, 25));
        if (!child || child.killed) break;
    }

    starting = false;

    if (!child || child.killed) throw new Error("Worker failed to start");
    if (!ready) throw new Error("Worker did not send ready signal");
}

// ------------------------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------------------------

/**
 * Start a flow via the automation worker.
 *
 * Behavior:
 * - If worker isn't configured or doesn't exist: fail run with actionable message.
 * - If worker is running but busy with another run: fail fast (for now).
 * - Otherwise starts the run and streams events/states back through callbacks.
 *
 * NOTE: This host is designed so that Electron main remains authoritative:
 * - you still update DB state in ipc.ts via onEvent/onState hooks.
 */
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

        args.onState("failed", {
            finished_at: new Date().toISOString(),
            error_json: JSON.stringify({
                message:
                    "Worker not configured. Build packages/worker and/or set CLIENTBOOK_WORKER_ENTRY.",
            }),
        });

        return;
    }

    if (active && active.runId !== args.runId) {
        args.onEvent({
            type: "log",
            level: "error",
            message:
                "Worker is already running another job (single-run mode). Cancel the active run first.",
            payload: { activeRunId: active.runId },
        });

        args.onState("failed", {
            finished_at: new Date().toISOString(),
            error_json: JSON.stringify({
                message: "Worker busy (single-run mode).",
                activeRunId: active.runId,
            }),
        });

        return;
    }

    await ensureWorkerRunning();

    active = {
        runId: args.runId,
        onEvent: args.onEvent,
        onState: args.onState,
    };

    // greet (optional; helps worker align logs with run)
    try {
        writeMsg({ t: "hello", v: 1, runId: args.runId });
    } catch {
        // ignore
    }

    // start run
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

/**
 * Optional helper to request cancellation of a run.
 * (Wire this from IPC later; worker must implement t:"run.cancel".)
 */
export function cancelActiveRun(runId: string): void {
    if (!child || child.killed) return;
    if (!active || active.runId !== runId) return;
    try {
        writeMsg({ t: "run.cancel", v: 1, runId });
    } catch {
        // ignore
    }
}

/**
 * Optional helper for diagnostics.
 */
export function shutdownWorker(): void {
    if (!child || child.killed) return;
    teardownWorker("shutdown requested");
}