import styles from "./PathRow.module.css";

type PathRowProps = {
    label: string;
    value: string | null;
    onPick: () => void;
    placeholder: string;
};

export function PathRow({ label, value, onPick, placeholder }: PathRowProps) {
    const valueClass = value
        ? `${styles.pathRowValue} ${styles.isFilled}`
        : `${styles.pathRowValue} ${styles.pathRowValueEmpty}`;

    return (
        <div className={styles.pathRow}>
            <span className={styles.pathRowLabel}>{label}</span>
            <div className={valueClass}>{value ?? placeholder}</div>
            <button className="btn btn--ghost" onClick={onPick}>
                Browse
            </button>
        </div>
    );
}