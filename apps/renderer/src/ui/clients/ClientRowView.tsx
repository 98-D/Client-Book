// apps/renderer/src/ui/clients/ClientRowView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientDraft, ClientId, ClientRow, IsoDate } from "./types";
import { Popover } from "../popover/Popover";
import styles from "./ClientRowView.module.css";

function cleanBn(s: string) {
    return s.replace(/[^\d]/g, "").slice(0, 9);
}

function cleanCan(s: string) {
    return s.replace(/[^\d]/g, "").slice(0, 9);
}

function isValidYmd(s: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const dt = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s;
}

// New-row sentinel: keep it in UI only (not a real ClientId)
const NEW_ROW_ID = "__new__" as const;
type NewRowId = typeof NEW_ROW_ID;

export type ClientRowViewRow = ClientRow | Readonly<{ id: NewRowId } & Omit<ClientRow, "id">>;

export function ClientRowView(props: {
    row: ClientRowViewRow;
    busy: boolean;

    // Save returns {id} (matches preload) or string if you prefer; we ignore return in UI.
    onSave: (draft: ClientDraft) => Promise<{ id: string } | string | void>;

    // Delete supports real ids and the NEW_ROW sentinel to cancel/remove draft rows
    onDelete: (id: ClientId | NewRowId) => Promise<void> | void;
}) {
    const r = props.row;
    const isNew = r.id === NEW_ROW_ID;

    const [editing, setEditing] = useState(isNew);
    const [openMore, setOpenMore] = useState(false);

    const [company, setCompany] = useState((r as any).company_name ?? "");
    const [bn, setBn] = useState((r as any).bn ?? "");
    const [ye, setYe] = useState((r as any).year_end_date ?? "");
    const [can, setCan] = useState((r as any).can ?? "");
    const [notes, setNotes] = useState((r as any).notes ?? "");
    const [tags, setTags] = useState((((r as any).tags ?? []) as string[]).join(", ") ?? "");

    const companyRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        // If parent refreshed, keep in sync unless actively editing
        if (editing) return;

        setCompany((r as any).company_name ?? "");
        setBn((r as any).bn ?? "");
        setYe((r as any).year_end_date ?? "");
        setCan((r as any).can ?? "");
        setNotes((r as any).notes ?? "");
        setTags((((r as any).tags ?? []) as string[]).join(", ") ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        r.id,
        (r as any).company_name,
        (r as any).bn,
        (r as any).year_end_date,
        (r as any).can,
        (r as any).notes,
        JSON.stringify((r as any).tags ?? []),
        editing,
    ]);

    useEffect(() => {
        if (editing) companyRef.current?.focus();
    }, [editing]);

    const hasChanges = useMemo(() => {
        const t = (((r as any).tags ?? []) as string[]).join(", ") ?? "";
        return (
            company !== ((r as any).company_name ?? "") ||
            bn !== ((r as any).bn ?? "") ||
            ye !== ((r as any).year_end_date ?? "") ||
            can !== ((r as any).can ?? "") ||
            notes !== ((r as any).notes ?? "") ||
            tags !== t
        );
    }, [company, bn, ye, can, notes, tags, r]);

    const bnOk = bn.length === 0 ? false : bn.length === 9;
    const yeOk = ye.length === 0 ? true : isValidYmd(ye);
    const canOk = can.length === 0 ? true : can.length === 9;

    const saveDisabled = props.busy || company.trim().length === 0 || !bnOk || !yeOk || !canOk || !hasChanges;

    async function commitSave() {
        const draft: ClientDraft = {
            id: isNew ? undefined : (r.id as ClientId),
            company_name: company.trim(),
            bn,
            year_end_date: ye.trim().length ? (ye.trim() as IsoDate) : null,
            can: can.trim().length ? can.trim() : null,
            notes: notes.trim().length ? notes : null,
            tags: tags
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
        };

        await props.onSave(draft);

        setEditing(false);
        setOpenMore(false);
    }

    function cancel() {
        if (isNew) {
            void props.onDelete(NEW_ROW_ID);
            return;
        }

        setEditing(false);
        setOpenMore(false);

        setCompany((r as any).company_name ?? "");
        setBn((r as any).bn ?? "");
        setYe((r as any).year_end_date ?? "");
        setCan((r as any).can ?? "");
        setNotes((r as any).notes ?? "");
        setTags((((r as any).tags ?? []) as string[]).join(", ") ?? "");
    }

    return (
        <div className={`${styles.row} ${editing ? styles.editing : ""}`}>
            <div className={styles.cell}>
                <input
                    ref={companyRef}
                    className={`cellInput ${styles.companyInput}`}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    onFocus={() => setEditing(true)}
                    placeholder="Company name"
                    spellCheck={false}
                />
            </div>

            <div className={styles.cell}>
                <input
                    className={"cellInput mono" + (bnOk ? "" : " invalid")}
                    value={bn}
                    onChange={(e) => setBn(cleanBn(e.target.value))}
                    onFocus={() => setEditing(true)}
                    placeholder="123456789"
                    inputMode="numeric"
                    spellCheck={false}
                />
            </div>

            <div className={styles.cell}>
                <input
                    className={"cellInput mono" + (yeOk ? "" : " invalid")}
                    value={ye}
                    onChange={(e) => setYe(e.target.value.trim())}
                    onFocus={() => setEditing(true)}
                    placeholder="YYYY-MM-DD"
                    spellCheck={false}
                />
            </div>

            <div className={styles.cell}>
                <input
                    className={"cellInput mono" + (canOk ? "" : " invalid")}
                    value={can}
                    onChange={(e) => setCan(cleanCan(e.target.value))}
                    onFocus={() => setEditing(true)}
                    placeholder="(optional)"
                    inputMode="numeric"
                    spellCheck={false}
                />
            </div>

            <div className={styles.cell}>
                <div className={styles.actions}>
                    <button className="btn sm" disabled={saveDisabled} onClick={() => void commitSave()} type="button">
                        {props.busy ? "…" : "Save"}
                    </button>

                    <button
                        className="btn sm ghost"
                        onClick={() => setOpenMore((v) => !v)}
                        disabled={props.busy}
                        type="button"
                    >
                        More
                    </button>

                    <button
                        className="btn sm danger ghost"
                        onClick={() => void props.onDelete(r.id as any)}
                        disabled={props.busy || isNew}
                        title="Delete client"
                        type="button"
                    >
                        Del
                    </button>

                    <button className="btn sm ghost" onClick={cancel} disabled={props.busy || (!editing && !hasChanges)} type="button">
                        Esc
                    </button>
                </div>

                <Popover open={openMore} onOpenChange={setOpenMore} align="end">
                    <div className={styles.popoverCard}>
                        <div className={styles.popoverTitle}>Notes</div>
                        <textarea
                            className={styles.textarea}
                            value={notes}
                            onChange={(e) => {
                                setEditing(true);
                                setNotes(e.target.value);
                            }}
                            placeholder="Anything you want…"
                        />

                        <div className={styles.popoverTitle} style={{ marginTop: 10 }}>
                            Tags <span className={styles.muted}>(comma-separated)</span>
                        </div>
                        <input
                            className="cellInput"
                            value={tags}
                            onChange={(e) => {
                                setEditing(true);
                                setTags(e.target.value);
                            }}
                            placeholder="corp, gst, payroll…"
                            spellCheck={false}
                        />

                        <div className={styles.popoverFooter}>
                            <button className="btn sm" disabled={saveDisabled} onClick={() => void commitSave()} type="button">
                                Save
                            </button>
                            <button className="btn sm ghost" onClick={cancel} type="button">
                                Cancel
                            </button>
                        </div>
                    </div>
                </Popover>
            </div>

            {/* keyboard handling */}
            <div
                tabIndex={-1}
                onKeyDown={(e) => {
                    if (!editing) return;
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void commitSave();
                    }
                    if (e.key === "Escape") {
                        e.preventDefault();
                        cancel();
                    }
                }}
            />
        </div>
    );
}