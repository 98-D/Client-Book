import { useEffect, useMemo, useState } from "react";
import styles from "./ClientForm.module.css";
import type { ClientRow } from "../../api/schemas";
import { clientbook } from "../../api/clientbook";
import { Button } from "../../components/ui/Button";
import { Field, Input, TextArea } from "../../components/ui/Input";
import { ClientLinks } from "./ClientLinks";

export function ClientForm(props: {
    client: ClientRow | null;
    onSaved: () => void;
    onDeleted: () => void;
}) {
    const c = props.client;

    const [company, setCompany] = useState(c?.company_name ?? "");
    const [bn, setBn] = useState(c?.bn ?? "");
    const [ye, setYe] = useState(c?.year_end_date ?? "");
    const [can, setCan] = useState(c?.can ?? "");
    const [notes, setNotes] = useState(c?.notes ?? "");

    useEffect(() => {
        setCompany(c?.company_name ?? "");
        setBn(c?.bn ?? "");
        setYe(c?.year_end_date ?? "");
        setCan(c?.can ?? "");
        setNotes(c?.notes ?? "");
    }, [c?.id]);

    const dirty = useMemo(() => {
        if (!c) return false;
        return (
            company !== c.company_name ||
            bn !== c.bn ||
            (ye || null) !== (c.year_end_date ?? null) ||
            (can || null) !== (c.can ?? null) ||
            (notes || null) !== (c.notes ?? null)
        );
    }, [c, company, bn, ye, can, notes]);

    if (!c) return <div className="muted">Select a client.</div>;

    return (
        <div className={styles.wrap}>
            <div className={styles.top}>
                <div className={styles.h1}>{c.company_name}</div>
                <div className={styles.actions}>
                    <Button variant="primary" disabled={!dirty} onClick={async () => {
                        await clientbook.clients.upsert({
                            id: c.id,
                            company_name: company.trim() || "Unnamed",
                            bn: bn.trim(),
                            year_end_date: ye.trim() ? ye.trim() : null,
                            can: can.trim() ? can.trim() : null,
                            notes: notes.trim() ? notes.trim() : null,
                        });
                        props.onSaved();
                    }}>Save</Button>

                    <Button variant="danger" onClick={async () => {
                        if (!confirm("Delete this client?")) return;
                        await clientbook.clients.remove(c.id);
                        props.onDeleted();
                    }}>Delete</Button>
                </div>
            </div>

            <div className={styles.grid}>
                <Field label="Company">
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                </Field>

                <Field label="BN" hint="9 digits">
                    <Input mono value={bn} onChange={(e) => setBn(e.target.value)} placeholder="123456789" />
                </Field>

                <Field label="Year-end" hint="YYYY-MM-DD">
                    <Input mono value={ye ?? ""} onChange={(e) => setYe(e.target.value)} placeholder="2025-12-31" />
                </Field>

                <Field label="CAN">
                    <Input mono value={can ?? ""} onChange={(e) => setCan(e.target.value)} placeholder="optional" />
                </Field>
            </div>

            <Field label="Notes">
                <TextArea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
            </Field>

            <div className="hr" />

            <ClientLinks clientId={c.id} />
        </div>
    );
}