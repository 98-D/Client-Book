import styles from "./RunConsole.module.css";
import { useRunEvents } from "../../hooks/useRunEvents";

export function RunConsole({ runId }: { runId: string | null }) {
    const { hasRun, lines } = useRunEvents(runId);

    if (!hasRun) return <div className="muted">Select a run.</div>;

    return (
        <div className={styles.wrap}>
            {lines.length === 0 ? <div className="muted">No events.</div> : null}

            <div className={styles.list}>
                {lines.map((l) => (
                    <div key={l.key} className={styles.line}>
                        <div className={styles.left}>
                            <div className={styles.ts}>{(l.ts ?? "").slice(11, 19) || "—"}</div>
                            <div className={styles.kind}>{l.type}</div>
                        </div>

                        <div className={styles.main}>
                            {l.type === "state" ? (
                                <span className="kv"><span className="dot good" /><span>{l.state ?? l.msg ?? "state"}</span></span>
                            ) : (
                                <span className={l.level === "error" ? styles.err : l.level === "warn" ? styles.warn : ""}>
                  {l.msg ?? ""}
                </span>
                            )}

                            {l.payload ? <pre className={styles.payload}>{JSON.stringify(l.payload, null, 2)}</pre> : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}