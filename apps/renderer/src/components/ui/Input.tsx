import styles from "./Input.module.css";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
    const { mono, className, ...rest } = props;
    const cls = [styles.inp, mono ? styles.mono : "", className ?? ""].filter(Boolean).join(" ");
    return <input className={cls} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { mono?: boolean }) {
    const { mono, className, ...rest } = props;
    const cls = [styles.sel, mono ? styles.mono : "", className ?? ""].filter(Boolean).join(" ");
    return <select className={cls} {...rest} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const { className, ...rest } = props;
    const cls = [styles.ta, className ?? ""].filter(Boolean).join(" ");
    return <textarea className={cls} {...rest} />;
}

export function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className={styles.field}>
            <div className={styles.top}>
                <span className={styles.label}>{props.label}</span>
                {props.hint ? <span className={styles.hint}>{props.hint}</span> : null}
            </div>
            {props.children}
        </label>
    );
}