import { useEffect, useMemo, useState } from "react";
import styles from "./ProfilesPage.module.css";
import { clientbook } from "../../api/clientbook";
import type { ProfileRow } from "../../api/schemas";
import { Split } from "../../components/ui/Split";
import { DenseTable, DRow, DCell } from "../../components/ui/DenseTable";
import { Button } from "../../components/ui/Button";
import { ProfileForm } from "./ProfileForm";

export function ProfilesPage() {
    const [rows, setRows] = useState<ProfileRow[]>([]);
    const [sel, setSel] = useState<string | null>(null);

    async function refresh() {
        const r = await clientbook.profiles.list();
        setRows(r);
        if (!sel && r[0]) setSel(r[0].id);
        if (sel && !r.some((x) => x.id === sel)) setSel(r[0]?.id ?? null);
    }

    useEffect(() => { refresh().catch(() => {}); }, []); // eslint-disable-line

    const selected = useMemo(() => rows.find((x) => x.id === sel) ?? null, [rows, sel]);

    return (
        <div className={styles.wrap}>
            <Split
                leftTitle={
                    <div className={styles.head}>
                        <div className={styles.title}>CRA Profiles</div>
                        <Button variant="primary" onClick={() => setSel("__new__")}>New</Button>
                    </div>
                }
                left={
                    <DenseTable columns={["Label", "User", "Last used", "Notes"]}>
                        {rows.map((r) => (
                            <DRow key={r.id} active={r.id === sel} onClick={() => setSel(r.id)}>
                                <DCell>{r.label}</DCell>
                                <DCell mono dim>{r.username}</DCell>
                                <DCell dim>{r.last_used_at ? r.last_used_at.slice(0, 10) : "—"}</DCell>
                                <DCell dim>{r.notes ? "•" : "—"}</DCell>
                            </DRow>
                        ))}
                    </DenseTable>
                }
                rightTitle={<div className={styles.title}>Inspector</div>}
                right={
                    <ProfileForm
                        mode={sel === "__new__" ? "new" : "edit"}
                        profile={sel === "__new__" ? null : selected}
                        onSaved={async (id) => { await refresh(); setSel(id); }}
                        onDeleted={async () => { await refresh(); setSel(rows[0]?.id ?? null); }}
                        onDone={async () => { await refresh(); setSel(rows[0]?.id ?? null); }}
                    />
                }
            />
        </div>
    );
}