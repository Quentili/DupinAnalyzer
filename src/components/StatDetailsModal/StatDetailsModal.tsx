import { useMemo, useState } from "react";
import { AdaptiveSearchIcon, CloseIcon } from "../Icons/Icons";
import { CategoryTable } from "../../types";
import { dirname, parseFileId } from "../../utils/helpers";
import styles from "./StatDetailsModal.module.css";

type StatDetailsModalProps = {
    column: string;
    valuesMap: Record<string, number>;
    tables: Record<string, CategoryTable>;
    onOpenLog: (fileId: string, lineIndex: number) => void;
    onClose: () => void;
};

type Occurrence = { fileId: string; lineIndex: number };

const PAGE = 200;

export function StatDetailsModal({ column, valuesMap, tables, onOpenLog, onClose }: StatDetailsModalProps) {
    const [filterQuery, setFilterQuery] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [shown, setShown] = useState(PAGE);

    const isIgnored = column.startsWith("!");
    const cleanColumn = isIgnored ? column.slice(1) : column;

    const occurrences = useMemo(() => {
        const map = new Map<string, Occurrence[]>();
        const seen = new Set<string>();
        for (const table of Object.values(tables)) {
            for (const row of table.rows) {
                const val = row.values[column];
                if (!val) continue;
                const key = `${val}\u0000${row.fileId}\u0000${row.lineIndex}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const list = map.get(val);
                if (list) list.push({ fileId: row.fileId, lineIndex: row.lineIndex });
                else map.set(val, [{ fileId: row.fileId, lineIndex: row.lineIndex }]);
            }
        }
        return map;
    }, [tables, column]);

    const entries = Object.entries(valuesMap).sort((a, b) => b[1] - a[1]);
    const filtered = entries.filter(([val]) => val.toLowerCase().includes(filterQuery.toLowerCase()));

    const toggle = (val: string) => {
        setExpanded((cur) => (cur === val ? null : val));
        setShown(PAGE);
    };

    const openOccurrence = (o: Occurrence) => {
        onOpenLog(o.fileId, o.lineIndex);
        onClose();
    };

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
                            filtered.map(([val, count]) => {
                                const isOpen = expanded === val;
                                const list = isOpen ? occurrences.get(val) ?? [] : [];
                                const files = isOpen ? new Set(list.map((o) => o.fileId)).size : 0;

                                return (
                                    <div key={val} className={styles.valueGroup}>
                                        <div
                                            className={`${styles.modalValueItem} ${styles.modalValueClickable} ${isOpen ? styles.modalValueOpen : ""}`}
                                            onClick={() => toggle(val)}
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={isOpen}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    toggle(val);
                                                }
                                            }}
                                        >
                                            <span className={styles.modalValText}>
                                                <span className={styles.chevron}>{isOpen ? "▾" : "▸"}</span>
                                                {val}
                                            </span>
                                            <span className={styles.modalValBadge}>
                                                {count} {count === 1 ? "occurrence" : "occurrences"}
                                            </span>
                                        </div>

                                        {isOpen && (
                                            <div className={`${styles.occPanel} fade-in`}>
                                                <div className={styles.occHeader}>
                                                    {list.length} {list.length === 1 ? "line" : "lines"} in {files}{" "}
                                                    {files === 1 ? "file" : "files"}. Click to open.
                                                </div>
                                                <div className={styles.occList}>
                                                    {list.slice(0, shown).map((o, i) => {
                                                        const { fileName, filePath } = parseFileId(o.fileId);
                                                        const dir = dirname(filePath);
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={`${o.fileId}:${o.lineIndex}:${i}`}
                                                                className={styles.occItem}
                                                                title={filePath}
                                                                onClick={() => openOccurrence(o)}
                                                            >
                                                                <span className={styles.occFile}>{fileName}</span>
                                                                {dir && <span className={styles.occDir}>{dir}</span>}
                                                                <span className={styles.occLine}>line {o.lineIndex + 1}</span>
                                                            </button>
                                                        );
                                                    })}
                                                    {list.length > shown && (
                                                        <button
                                                            type="button"
                                                            className={`btn btn--ghost ${styles.occMore}`}
                                                            onClick={() => setShown((s) => s + PAGE)}
                                                        >
                                                            Show more ({list.length - shown} left)
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}