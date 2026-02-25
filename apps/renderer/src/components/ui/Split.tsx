import styles from "./Split.module.css";

export function Split(props: {
    leftTitle?: React.ReactNode;
    rightTitle?: React.ReactNode;
    left: React.ReactNode;
    right: React.ReactNode;
}) {
    return (
        <div className={styles.wrap}>
            <section className={styles.pane}>
                {props.leftTitle ? <header className={styles.head}>{props.leftTitle}</header> : null}
                <div className={`${styles.body} scroll`}>{props.left}</div>
            </section>

            <section className={styles.pane}>
                {props.rightTitle ? <header className={styles.head}>{props.rightTitle}</header> : null}
                <div className={`${styles.body} scroll`}>{props.right}</div>
            </section>
        </div>
    );
}