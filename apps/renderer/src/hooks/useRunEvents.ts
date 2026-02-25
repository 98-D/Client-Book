import { useEffect, useMemo, useRef, useState } from "react";
import { clientbook } from "../api/clientbook";
import type { RunEventRow, RunPushEvent } from "../api/schemas";

type Line = {
    key: string;
    ts?: string;
    level?: string;
    type: "log" | "state";
    msg?: string;
    payload?: unknown;
    state?: string;
};

function safeJson(s: string): any {
    try { return JSON.parse(s); } catch { return null; }
}

export function useRunEvents(runId: string | null) {
    const [lines, setLines] = useState<Line[]>([]);
    const maxSeq = useRef(0);

    useEffect(() => {
        let unsub: null | (() => void) = null;
        let alive = true;

        (async () => {
            setLines([]);
            maxSeq.current = 0;
            if (!runId) return;

            const rows = await clientbook.runs.getEvents(runId, 0, 350);
            if (!alive) return;

            ingestRows(rows);

            unsub = clientbook.runs.onEvent((ev: RunPushEvent) => {
                if (ev.runId !== runId) return;
                const line: Line = {
                    key: `${ev.runId}:${ev.ts ?? Math.random().toString(16).slice(2)}`,
                    ts: ev.ts,
                    type: ev.type === "state" ? "state" : "log",
                    level: ev.level,
                    msg: ev.message,
                    payload: ev.payload,
                    state: ev.state,
                };
                setLines((p) => trim([...p, line], 900));
            });
        })().catch(() => {});

        return () => {
            alive = false;
            if (unsub) unsub();
        };

        function ingestRows(rows: RunEventRow[]) {
            if (!rows.length) return;
            maxSeq.current = Math.max(maxSeq.current, ...rows.map((r) => r.seq));
            const mapped: Line[] = rows.map((r) => ({
                key: `${r.run_id}:${r.seq}`,
                ts: r.ts,
                type: r.type === "state" ? "state" : "log",
                level: r.level ?? undefined,
                msg: r.message ?? undefined,
                payload: safeJson(r.payload_json),
                state: r.type === "state" ? safeJson(r.payload_json)?.state : undefined,
            }));
            setLines((p) => trim(dedupe([...p, ...mapped]), 900));
        }
    }, [runId]);

    const hasRun = useMemo(() => !!runId, [runId]);

    return { hasRun, lines };
}

function trim<T>(arr: T[], max: number) {
    if (arr.length <= max) return arr;
    return arr.slice(arr.length - max);
}

function dedupe(lines: Line[]) {
    const seen = new Set<string>();
    const out: Line[] = [];
    for (const l of lines) {
        if (seen.has(l.key)) continue;
        seen.add(l.key);
        out.push(l);
    }
    return out;
}