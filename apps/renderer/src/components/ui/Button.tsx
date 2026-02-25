import styles from "./Button.module.css";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger";
    compact?: boolean;
};

export function Button({ variant = "ghost", compact, className, ...rest }: Props) {
    const cls = [styles.btn, styles[variant], compact ? styles.compact : "", className ?? ""]
        .filter(Boolean)
        .join(" ");
    return <button className={cls} {...rest} />;
}