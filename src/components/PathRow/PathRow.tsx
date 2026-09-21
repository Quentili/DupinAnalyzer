import styles from "./PathRow.module.css";
import { CloseIcon } from "../Icons/Icons";

type PathRowProps = {
    label: string;
    value: string | string[] | null;
    onPick: () => void;
    onRemove?: (path: string) => void;
    placeholder: string;
    buttonLabel?: string;
};

export function PathRow({ label, value, onPick, onRemove, placeholder, buttonLabel = "Browse" }: PathRowProps) {
    const paths = Array.isArray(value) ? value : value ? [value] : [];
    const isEmpty = paths.length === 0;

    const valueClass = isEmpty
        ? `${styles.pathRowValue} ${styles.pathRowValueEmpty}`
        : `${styles.pathRowValue} ${styles.isFilled}`;

    return (
        <div className={styles.pathRow}>
            <span className={styles.pathRowLabel}>{label}</span>
            <div className={valueClass}>
                {isEmpty ? (
                    placeholder
                ) : (
                    <ul className={styles.pathList}>
                        {paths.map((p) => (
                            <li key={p} className={styles.pathItem}>
                                <span className={styles.pathItemText} title={p}>{p}</span>
                                {onRemove && (
                                    <button
                                        type="button"
                                        className={styles.pathRemove}
                                        onClick={() => onRemove(p)}
                                        title="Remove"
                                    >
                                        <CloseIcon />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <button className="btn btn--ghost" onClick={onPick}>
                {buttonLabel}
            </button>
        </div>
    );
}