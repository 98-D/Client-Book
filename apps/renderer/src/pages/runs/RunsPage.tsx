import { useEffect, useMemo, useState } from "react";
import styles from "./RunsPage.module.css";
import { clientbook } from "../../api/clientbook";
import type { ClientRow, ProfileRow, RunRow } from "../../api/schemas";
import { Split } from "../../components/ui/Split";
import { DenseTable, DRow, DCell } from "../../components/ui/DenseTable";
import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Input";
import { RunConsole } from "./RunConsole";

export function RunsPage() {
    const [runs, setRuns] = useState<RunRow[]>([]);
    const [clients, setClients] = useState<ClientRow[]>([]);
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);

    const [selRun, setSelRun] = useState<string | null>(null);
    const [flowId, setFlowId] = useState("rac.openClient");
    const [clientId, setClientId] = useState<string>("");
    const [profileId, setProfileId] = useState<string>("");

    async function refresh() {
        const [r, c, p] = await Promise.all([
            clientbook.runs.listRecent(80),
            clientbook.clients.list(""),
            clientbook.profiles.list(),
        ]);
        setRuns(r);
        setClients(c);
        setProfiles(p);
        if (!selRun && r[0]) setSelRun(r[0].id);
        if (!clientId && c[0]) setClientId(c[0].id);
        if (!profileId && p[0]) setProfileId(p[0].id);
    }

    useEffect(() => { refresh().catch(() => {}); }, []); // eslint-disable-line

    const currentRun = useMemo(() => runs.find((x) => x.id === selRun) ?? null, [runs, selRun]);
    const currentClient = useMemo(() => clients.find((x) => x.id === clientId) ?? null, [clients, clientId]);

    return (
        <div className={styles.wrap}>
            <Split
                leftTitle={
                    <div className={styles.head}>
                        <div className={styles.title}>Runs</div>

                        <div className={styles.controls}>
                            <Field label="Flow">
                                <Select value={flowId} onChange={(e) => setFlowId(e.target.value)}>
                                    <option value="rac.openClient">rac.openClient</option>
                                </Select>
                            </Field>

                            <Field label="Client">
                                <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.company_name} — {c.bn}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Profile">
                                <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                                    {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.label} — {p.username}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Button
                                variant="primary"
                                disabled={!currentClient || !profileId}
                                onClick={async () => {
                                    if (!currentClient) return;
                                    const input_json = JSON.stringify({ bn: currentClient.bn, companyName: currentClient.company_name });

                                    const res = await clientbook.runs.create({
                                        flow_id: flowId,
                                        flow_version: "0.0.0",
                                        client_id: currentClient.id,
                                        profile_id: profileId,
                                        scope: "rac",
                                        input_json,
                                    });

                                    await refresh();
                                    setSelRun(res.runId);
                                }}
                            >
                                Start
                            </Button>

                            <Button onClick={() => refresh().catch(() => {})}>Refresh</Button>
                        </div>
                    </div>
                }
                left={
                    <DenseTable columns={["Flow", "State", "Queued", "Run"]}>
                        {runs.map((r) => (
                            <DRow key={r.id} active={r.id === selRun} onClick={() => setSelRun(r.id)}>
                                <DCell>{r.flow_id}</DCell>
                                <DCell dim>{r.state}</DCell>
                                <DCell dim>{(r.queued_at ?? "").slice(0, 19).replace("T", " ") || "—"}</DCell>
                                <DCell mono dim>{r.id.slice(0, 8)}…</DCell>
                            </DRow>
                        ))}
                    </DenseTable>
                }
                rightTitle={
                    <div className={styles.rightHead}>
                        <div className={styles.title}>Console</div>
                        {currentRun ? (
                            <div className={styles.rightTools}>
                <span className="kv">
                  <span className={`dot ${currentRun.state === "failed" ? "bad" : currentRun.state === "paused" ? "warn" : "good"}`} />
                  <span>{currentRun.state}</span>
                </span>
                                <Button compact variant="danger" onClick={async () => {
                                    await clientbook.runs.cancel(currentRun.id);
                                }}>Cancel</Button>
                            </div>
                        ) : null}
                    </div>
                }
                right={<RunConsole runId={selRun} />}
            />
        </div>
    );
}