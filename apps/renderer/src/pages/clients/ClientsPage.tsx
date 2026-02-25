import { useEffect, useMemo, useState } from "react";
import styles from "./ClientsPage.module.css";
import { clientbook } from "../../api/clientbook";
import type { ClientRow } from "../../api/schemas";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Split } from "../../components/ui/Split";
import { DenseTable, DRow, DCell } from "../../components/ui/DenseTable";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { ClientForm } from "./ClientForm";

export function ClientsPage() {
    const [search, setSearch] = useState("");
    const q = useDebouncedValue(search, 140);

    const [rows, setRows] = useState<ClientRow[]>([]);
    const [sel, setSel] = useState<string | null>(null);

    async function refresh() {
        const r = await clientbook.clients.list(q);
        setRows(r);
        if (!sel && r[0]) setSel(r[0].id);
        if (sel && !r.some((x) => x.id === sel)) setSel(r[0]?.id ?? null);
    }

    useEffect(() => { refresh().catch(() => {}); }, [q]); // eslint-disable-line

    const selected = useMemo(() => rows.find((x) => x.id === sel) ?? null, [rows, sel]);

    return (
        <div className={styles.wrap}>
            <Split
                leftTitle={
                    <div className={styles.head}>
                        <div className={styles.title}>Clients</div>
                        <div className={styles.tools}>
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
                            <Button
                                variant="primary"
                                onClick={async () => {
                                    const id = await clientbook.clients.upsert({
                                        company_name: "New Client",
                                        bn: "000000000",
                                        year_end_date: null,
                                        can: null,
                                        notes: null,
                                    });
                                    await refresh();
                                    setSel(id);
                                }}
                            >
                                New
                            </Button>
                        </div>
                    </div>
                }
                left={
                    <DenseTable columns={["Company", "BN", "YE", "CAN"]}>
                        {rows.map((r) => (
                            <DRow key={r.id} active={r.id === sel} onClick={() => setSel(r.id)}>
                                <DCell>{r.company_name}</DCell>
                                <DCell mono dim>{r.bn}</DCell>
                                <DCell mono dim>{(r.year_end_date ?? "").slice(0, 10) || "—"}</DCell>
                                <DCell mono dim>{r.can ?? "—"}</DCell>
                            </DRow>
                        ))}
                    </DenseTable>
                }
                rightTitle={<div className={styles.title}>Inspector</div>}
                right={
                    <ClientForm
                        client={selected}
                        onSaved={refresh}
                        onDeleted={async () => { await refresh(); setSel(rows[0]?.id ?? null); }}
                    />
                }
            />
        </div>
    );
}