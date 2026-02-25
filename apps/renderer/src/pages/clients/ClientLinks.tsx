import { useEffect, useMemo, useState } from "react";
import styles from "./ClientLinks.module.css";
import { clientbook } from "../../api/clientbook";
import type { ClientProfileLinkRow, ProfileRow } from "../../api/schemas";
import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Input";

export function ClientLinks({ clientId }: { clientId: string }) {
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [links, setLinks] = useState<ClientProfileLinkRow[]>([]);
    const [pick, setPick] = useState<string>("");

    async function refresh() {
        const [p, l] = await Promise.all([
            clientbook.profiles.list(),
            clientbook.links.listForClient(clientId),
        ]);
        setProfiles(p);
        setLinks(l);
        setPick(p[0]?.id ?? "");
    }

    useEffect(() => { refresh().catch(() => {}); }, [clientId]);

    const linked = useMemo(() => new Set(links.map((x) => x.profile_id)), [links]);
    const available = useMemo(() => profiles.filter((p) => !linked.has(p.id)), [profiles, linked]);

    return (
        <div className={styles.wrap}>
            <div className={styles.title}>CRA Profiles</div>

            <div className={styles.row}>
                <Field label="Link">
                    <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                        {available.length === 0 ? <option value="">No available profiles</option> : null}
                        {available.map((p) => (
                            <option key={p.id} value={p.id}>{p.label} — {p.username}</option>
                        ))}
                    </Select>
                </Field>
                <Button
                    variant="primary"
                    disabled={!pick || available.length === 0}
                    onClick={async () => { await clientbook.links.link(clientId, pick); await refresh(); }}
                >
                    Link
                </Button>
            </div>

            <div className={styles.list}>
                {links.length === 0 ? <div className="muted">No links.</div> : null}

                {links.map((l) => (
                    <div key={l.profile_id} className={styles.item}>
                        <div className={styles.main}>
                            <div className={styles.name}>{l.label}</div>
                            <div className={`muted mono ${styles.user}`}>{l.username}</div>
                        </div>

                        <div className={styles.actions}>
                            {l.is_default === 1 ? (
                                <span className="kv"><span className="dot good" /><span>default</span></span>
                            ) : (
                                <Button compact onClick={async () => { await clientbook.links.setDefault(clientId, l.profile_id); await refresh(); }}>
                                    Default
                                </Button>
                            )}

                            <Button compact variant="danger" onClick={async () => {
                                await clientbook.links.unlink(clientId, l.profile_id);
                                await refresh();
                            }}>
                                Unlink
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}