import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClientDraft, IsoDate } from "./types";
import styles from "./NewClientOverlay.module.css";

type AnchorRect = Readonly<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}>;

type Props = {
    open: boolean;
    anchor: AnchorRect | null;
    initial?: ClientDraft;
    onClose: () => void;
    onSave: (draft: ClientDraft) => Promise<void> | void;
};

function emptyDraft(): ClientDraft {
    return {
        company_name: "",
        bn: "",
        year_end_date: null,
        can: null,
        notes: null,
        tags: [],
    };
}

function cleanDigits9(s: string): string {
    return s.replace(/\D/g, "").slice(0, 9);
}

function isValidYmd(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const dt = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s;
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

export function NewClientOverlay({ open, anchor, initial, onClose, onSave }: Props) {
    const [draft, setDraft] = useState<ClientDraft>(() => initial ?? emptyDraft());
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [more, setMore] = useState(false);

    const cardRef = useRef<HTMLDivElement | null>(null);
    const firstInputRef = useRef<HTMLInputElement | null>(null);

    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(initial ?? emptyDraft());
        setErr(null);
        setMore(false);
    }, [open, initial]);

    // keyboard shortcuts
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void handleSave();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, onClose]);

    // focus first input
    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => firstInputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open]);

    const bnOk = useMemo(() => /^\d{9}$/.test(draft.bn.trim()), [draft.bn]);

    const yeStr = useMemo(() => String(draft.year_end_date ?? ""), [draft.year_end_date]);
    const yeOk = useMemo(() => {
        const t = yeStr.trim();
        if (!t.length) return true;
        return isValidYmd(t);
    }, [yeStr]);

    const canStr = useMemo(() => String(draft.can ?? ""), [draft.can]);
    const canOk = useMemo(() => {
        const t = canStr.trim();
        if (!t.length) return true;
        return /^\d{9}$/.test(t);
    }, [canStr]);

    const canSave = useMemo(() => {
        const companyOk = draft.company_name.trim().length > 0;
        return companyOk && bnOk && yeOk && canOk && !saving;
    }, [draft.company_name, bnOk, yeOk, canOk, saving]);

    const recalc = useMemo(() => {
        return () => {
            if (!open) return;
            if (!anchor) return;

            const card = cardRef.current;
            const pad = 8;

            const cw = card?.getBoundingClientRect().width ?? 360;
            const ch = card?.getBoundingClientRect().height ?? 220;

            // default: bottom-start under button
            let left = anchor.left;
            let top = anchor.bottom + 6;

            left = clamp(left, pad, window.innerWidth - cw - pad);

            // if would overflow bottom, flip above
            if (top + ch + pad > window.innerHeight) {
                top = anchor.top - ch - 6;
            }
            top = clamp(top, pad, window.innerHeight - ch - pad);

            setPos({ top, left });
        };
    }, [open, anchor]);

    useLayoutEffect(() => {
        if (!open) return;
        // ensure we measure after render
        requestAnimationFrame(recalc);
    }, [open, anchor, more, recalc]);

    useEffect(() => {
        if (!open) return;
        if (!anchor) return;

        const on = () => recalc();
        window.addEventListener("resize", on);
        window.addEventListener("scroll", on, true);
        return () => {
            window.removeEventListener("resize", on);
            window.removeEventListener("scroll", on, true);
        };
    }, [open, anchor, recalc]);

    async function handleSave() {
        if (!canSave) return;

        try {
            setSaving(true);
            setErr(null);

            const company_name = draft.company_name.trim();
            const bn = draft.bn.trim();

            const yeT = yeStr.trim();
            const year_end_date = yeT.length ? (yeT as IsoDate) : null;

            const canT = canStr.trim();
            const can = canT.length ? canT : null;

            const notesT = String(draft.notes ?? "").trim();
            const notes = notesT.length ? notesT : null;

            const tags = (draft.tags ?? []).map((t) => t.trim()).filter(Boolean);

            await onSave({ ...draft, company_name, bn, year_end_date, can, notes, tags });
            onClose();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to save client");
        } finally {
            setSaving(false);
        }
    }

    if (!open || !anchor) return null;

    return createPortal(
        <div className={styles.portal} aria-hidden={!open}>
            {/* click-away catcher (no dark overlay) */}
            <div
                className={styles.backdrop}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            />

            <div
                ref={cardRef}
                className={styles.card}
                role="dialog"
                aria-modal="false"
                aria-label="New client"
                style={pos ? { top: pos.top, left: pos.left } : undefined}
            >
                <div className={styles.header}>
                    <div className={styles.title}>New client</div>
                    <button className="btn sm ghost" onClick={onClose} type="button" aria-label="Close">
                        ✕
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.grid}>
                        <label className={styles.field + " " + styles.span2}>
                            <div className={styles.label}>Company</div>
                            <input
                                ref={firstInputRef}
                                className={"inp" + (draft.company_name.trim().length ? "" : " invalid")}
                                value={draft.company_name}
                                onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
                                placeholder="Acme Inc."
                                spellCheck={false}
                            />
                        </label>

                        <label className={styles.field}>
                            <div className={styles.label}>BN</div>
                            <input
                                className={"inp mono" + (bnOk ? "" : " invalid")}
                                value={draft.bn}
                                onChange={(e) => setDraft((d) => ({ ...d, bn: cleanDigits9(e.target.value) }))}
                                placeholder="123456789"
                                inputMode="numeric"
                                spellCheck={false}
                            />
                        </label>

                        <label className={styles.field}>
                            <div className={styles.label}>YE</div>
                            <input
                                className={"inp mono" + (yeOk ? "" : " invalid")}
                                value={yeStr}
                                onChange={(e) => {
                                    const t = e.target.value.trim();
                                    setDraft((d) => ({ ...d, year_end_date: t.length ? (t as IsoDate) : null }));
                                }}
                                placeholder="YYYY-MM-DD"
                                spellCheck={false}
                            />
                        </label>

                        <label className={styles.field}>
                            <div className={styles.label}>CAN</div>
                            <input
                                className={"inp mono" + (canOk ? "" : " invalid")}
                                value={canStr}
                                onChange={(e) => {
                                    const t = cleanDigits9(e.target.value);
                                    setDraft((d) => ({ ...d, can: t.length ? t : null }));
                                }}
                                placeholder="(optional)"
                                inputMode="numeric"
                                spellCheck={false}
                            />
                        </label>

                        <div className={styles.field}>
                            <div className={styles.label}>More</div>
                            <button className="btn sm ghost" onClick={() => setMore((v) => !v)} type="button">
                                {more ? "Hide" : "Notes + tags"}
                            </button>
                        </div>

                        {more ? (
                            <>
                                <label className={styles.field + " " + styles.span2}>
                                    <div className={styles.label}>Tags</div>
                                    <input
                                        className="inp"
                                        value={(draft.tags ?? []).join(", ")}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                tags: e.target.value
                                                    .split(",")
                                                    .map((t) => t.trim())
                                                    .filter(Boolean),
                                            }))
                                        }
                                        placeholder="corp, gst, payroll"
                                        spellCheck={false}
                                    />
                                </label>

                                <label className={styles.field + " " + styles.span2}>
                                    <div className={styles.label}>Notes</div>
                                    <textarea
                                        className={styles.notes}
                                        value={String(draft.notes ?? "")}
                                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                                        placeholder="Optional…"
                                        rows={3}
                                        spellCheck={false}
                                    />
                                </label>
                            </>
                        ) : null}
                    </div>

                    {err ? <div className={styles.error}>{err}</div> : null}
                </div>

                <div className={styles.footer}>
                    <div className={styles.hint}>Esc · Ctrl/⌘+Enter</div>
                    <div className={styles.footerBtns}>
                        <button className="btn sm ghost" onClick={onClose} disabled={saving} type="button">
                            Cancel
                        </button>
                        <button className="btn sm" onClick={handleSave} disabled={!canSave} type="button">
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}