import styles from "./DenseTable.module.css";

export function DenseTable(props: { columns: string[]; children: React.ReactNode }) {
    return (
        <div className={styles.table}>
            <div className={styles.head}>
                {props.columns.map((c) => (
                    <div key={c} className={styles.hcell}>{c}</div>
                ))}
            </div>
            <div className={styles.body}>{props.children}</div>
        </div>
    );
}

export function DRow(props: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
    const cls = [styles.row, props.active ? styles.active : "", props.onClick ? styles.click : ""]
        .filter(Boolean)
        .join(" ");
    return (
        <div className={cls} onClick={props.onClick} role={props.onClick ? "button" : undefined}>
            {props.children}
        </div>
    );
}

export function DCell(props: { mono?: boolean; dim?: boolean; children: React.ReactNode }) {
    const cls = [styles.cell, props.mono ? styles.mono : "", props.dim ? styles.dim : ""]
        .filter(Boolean)
        .join(" ");
    return <div className={cls}>{props.children}</div>;
}