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

    const cardRef = useRef<HTMLDivElement | null>(null);
    const firstInputRef = useRef<HTMLInputElement | null>(null);

    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const ids = useMemo(() => {
        const s = Math.random().toString(36).slice(2, 8);
        return {
            name: `cb_name_${s}`,
            ye: `cb_ye_${s}`,
            bn: `cb_bn_${s}`,
            can: `cb_can_${s}`,
            notes: `cb_notes_${s}`,
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        setDraft(initial ?? emptyDraft());
        setErr(null);
    }, [open, initial]);

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

    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => firstInputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open]);

    const companyOk = useMemo(() => draft.company_name.trim().length > 0, [draft.company_name]);
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

    const canSave = useMemo(
        () => companyOk && bnOk && yeOk && canOk && !saving,
        [companyOk, bnOk, yeOk, canOk, saving]
    );

    const recalc = useMemo(() => {
        return () => {
            if (!open) return;
            if (!anchor) return;

            const card = cardRef.current;
            const pad = 8;
            const gap = 7;

            const rect = card?.getBoundingClientRect();
            const cw = rect?.width ?? 320;
            const ch = rect?.height ?? 260;

            let left = anchor.left;
            let top = anchor.bottom + gap;

            left = clamp(left, pad, window.innerWidth - cw - pad);

            if (top + ch + pad > window.innerHeight) {
                top = anchor.top - ch - gap;
            }
            top = clamp(top, pad, window.innerHeight - ch - pad);

            setPos({ top, left });
        };
    }, [open, anchor]);

    useLayoutEffect(() => {
        if (!open) return;
        requestAnimationFrame(recalc);
    }, [open, anchor, recalc]);

    useEffect(() => {
        if (!open) return;
        const el = cardRef.current;
        if (!el) return;
        if (typeof ResizeObserver === "undefined") return;

        const ro = new ResizeObserver(() => recalc());
        ro.observe(el);
        return () => ro.disconnect();
    }, [open, recalc]);

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

            const tags = draft.tags ?? [];

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
                aria-label="Create client"
                style={pos ? { top: pos.top, left: pos.left } : undefined}
            >
                <div className={styles.body}>
                    <div className={styles.rows}>
                        <div className={styles.row}>
                            <label className={styles.rowLabel} htmlFor={ids.name}>
                                Name
                            </label>
                            <input
                                id={ids.name}
                                ref={firstInputRef}
                                className={`${styles.inp} ${companyOk ? "" : styles.invalid}`}
                                value={draft.company_name}
                                onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
                                placeholder="Acme Inc."
                                spellCheck={false}
                            />
                        </div>

                        <div className={styles.row}>
                            <label className={styles.rowLabel} htmlFor={ids.ye}>
                                YE
                            </label>
                            <input
                                id={ids.ye}
                                className={`${styles.inp} ${styles.mono} ${yeOk ? "" : styles.invalid}`}
                                value={yeStr}
                                onChange={(e) => {
                                    const t = e.target.value.trim();
                                    setDraft((d) => ({ ...d, year_end_date: t.length ? (t as IsoDate) : null }));
                                }}
                                placeholder="YYYY-MM-DD"
                                spellCheck={false}
                            />
                        </div>

                        <div className={styles.row}>
                            <label className={styles.rowLabel} htmlFor={ids.bn}>
                                BN
                            </label>
                            <input
                                id={ids.bn}
                                className={`${styles.inp} ${styles.mono} ${bnOk ? "" : styles.invalid}`}
                                value={draft.bn}
                                onChange={(e) => setDraft((d) => ({ ...d, bn: cleanDigits9(e.target.value) }))}
                                placeholder="123456789"
                                inputMode="numeric"
                                spellCheck={false}
                            />
                        </div>

                        <div className={styles.row}>
                            <label className={styles.rowLabel} htmlFor={ids.can}>
                                CAN
                            </label>
                            <input
                                id={ids.can}
                                className={`${styles.inp} ${styles.mono} ${canOk ? "" : styles.invalid}`}
                                value={canStr}
                                onChange={(e) => {
                                    const t = cleanDigits9(e.target.value);
                                    setDraft((d) => ({ ...d, can: t.length ? t : null }));
                                }}
                                placeholder="Optional"
                                inputMode="numeric"
                                spellCheck={false}
                            />
                        </div>

                        <div className={styles.notesRow}>
                            <label className={styles.notesLabel} htmlFor={ids.notes}>
                                Notes
                            </label>
                            <textarea
                                id={ids.notes}
                                className={styles.notes}
                                value={String(draft.notes ?? "")}
                                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                                placeholder="Optional…"
                                rows={2}
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    {err ? <div className={styles.error}>{err}</div> : null}
                </div>

                <div className={styles.footer}>
                    <div className={styles.hint}>Esc · Ctrl/⌘+Enter</div>
                    <div className={styles.footerBtns}>
                        <button className={styles.btnGhost} onClick={onClose} disabled={saving} type="button">
                            Cancel
                        </button>
                        <button className={styles.btnPrimary} onClick={handleSave} disabled={!canSave} type="button">
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}