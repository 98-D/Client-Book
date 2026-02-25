import { useEffect, useMemo, useState } from "react";
import styles from "./Shell.module.css";
import { ClientsPage } from "../../pages/clients/ClientsPage";
import { ProfilesPage } from "../../pages/profiles/ProfilesPage";
import { RunsPage } from "../../pages/runs/RunsPage";
import { clientbook } from "../../api/clientbook";

type Tab = "clients" | "profiles" | "runs";

export function Shell() {
    const [tab, setTab] = useState<Tab>("clients");
    const [worker, setWorker] = useState<{ configured: boolean; running?: boolean; pid?: number | null } | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const s = await clientbook.workerStatus();
                if (alive) setWorker(s);
            } catch {
                if (alive) setWorker({ configured: false });
            }
        })();
        return () => { alive = false; };
    }, []);

    const status = useMemo(() => {
        if (!worker) return { cls: "warn", txt: "…" };
        if (!worker.configured) return { cls: "warn", txt: "worker: off" };
        if (worker.running) return { cls: "good", txt: `worker: on${worker.pid ? ` (pid ${worker.pid})` : ""}` };
        return { cls: "good", txt: "worker: ready" };
    }, [worker]);

    return (
        <div className={styles.app}>
            <aside className={styles.side}>
                <div className={styles.brand}>
                    <div className={styles.name}>ClientBook</div>
                    <div className="kv">
                        <span className={`dot ${status.cls}`} />
                        <span>{status.txt}</span>
                    </div>
                </div>

                <nav className={styles.nav}>
                    <button className={tab === "clients" ? styles.active : ""} onClick={() => setTab("clients")}>Clients</button>
                    <button className={tab === "profiles" ? styles.active : ""} onClick={() => setTab("profiles")}>CRA Profiles</button>
                    <button className={tab === "runs" ? styles.active : ""} onClick={() => setTab("runs")}>Runs</button>
                </nav>

                <div className={styles.foot}>
                    <div className="faint" style={{ fontSize: "12px" }}>dense • minimal • deterministic</div>
                </div>
            </aside>

            <main className={styles.main}>
                {tab === "clients" ? <ClientsPage /> : null}
                {tab === "profiles" ? <ProfilesPage /> : null}
                {tab === "runs" ? <RunsPage /> : null}
            </main>
        </div>
    );
}