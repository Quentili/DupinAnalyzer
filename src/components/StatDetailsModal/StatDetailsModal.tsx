import { useState } from "react";
import { AdaptiveSearchIcon, CloseIcon } from "../Icons/Icons";
import styles from "./StatDetailsModal.module.css";

type StatDetailsModalProps = {
    column: string;
    valuesMap: Record<string, number>;
    onClose: () => void;
};

export function StatDetailsModal({ column, valuesMap, onClose }: StatDetailsModalProps) {
    const [filterQuery, setFilterQuery] = useState("");

    const isIgnored = column.startsWith("!");
    const cleanColumn = isIgnored ? column.slice(1) : column;

    const entries = Object.entries(valuesMap).sort((a, b) => b[1] - a[1]);
    const filtered = entries.filter(([val]) => val.toLowerCase().includes(filterQuery.toLowerCase()));

    return (
        <div className={`${styles.modalBackdrop} fade-in`} onClick={onClose}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <div>
                        <h2>Unique Values Breakdown</h2>
                        <p className={styles.modalSubtitle}>
                            Field: <span className={styles.highlight}>{cleanColumn.toUpperCase()}</span> ({entries.length} total unique)
                            {isIgnored && <span className={styles.ignoredBadge}> (Excluded from total summary)</span>}
                        </p>
                    </div>
                    <button className={styles.modalCloseBtn} onClick={onClose} title="Close">
                        <CloseIcon />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    <div className={`search-box ${styles.modalSearch}`}>
                        <AdaptiveSearchIcon className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder={`Search values in ${cleanColumn.toUpperCase()}...`}
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className={styles.modalValuesList}>
                        {filtered.length === 0 ? (
                            <div className="empty-state">No matching values found</div>
                        ) : (
                            filtered.map(([val, count]) => (
                                <div key={val} className={styles.modalValueItem}>
                                    <span className={styles.modalValText}>{val}</span>
                                    <span className={styles.modalValBadge}>
                                        {count} {count === 1 ? "occurrence" : "occurrences"}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}