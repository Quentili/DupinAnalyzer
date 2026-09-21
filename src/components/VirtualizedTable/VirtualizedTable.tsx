import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RowData, SortConfig } from "../../types";
import { hexToRgba, parseFileId, sortRows } from "../../utils/helpers";
import styles from "./VirtualizedTable.module.css";

type VirtualizedTableProps = {
    columns: string[];
    rows: RowData[];
    catColor: string;
    onRowClick: (fileId: string, lineIndex: number) => void;
};

export function VirtualizedTable({ columns, rows, catColor, onRowClick }: VirtualizedTableProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    const [sortConfig, setSortConfig] = useState<SortConfig>({
        column: null,
        direction: "none",
        fileSortKey: "name",
    });

    const handleFileHeaderClick = () => {
        setSortConfig((prev) => {
            if (prev.column !== "FILE") {
                return { column: "FILE", direction: "asc", fileSortKey: "name" };
            }
            if (prev.fileSortKey === "name" && prev.direction === "asc") {
                return { column: "FILE", direction: "desc", fileSortKey: "name" };
            }
            if (prev.fileSortKey === "name" && prev.direction === "desc") {
                return { column: "FILE", direction: "desc", fileSortKey: "modTime" };
            }
            return { column: null, direction: "none", fileSortKey: "name" };
        });
    };

    const handleColumnHeaderClick = (col: string) => {
        setSortConfig((prev) => {
            if (prev.column !== col) {
                return { column: col, direction: "asc" };
            }
            if (prev.direction === "asc") {
                return { column: col, direction: "desc" };
            }
            return { column: null, direction: "none" };
        });
    };

    const sortedRows = useMemo(() => {
        return sortRows(rows, sortConfig);
    }, [rows, sortConfig]);

    const rowVirtualizer = useVirtualizer({
        count: sortedRows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 35,
        overscan: 5,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

    const getFileSortLabel = () => {
        if (sortConfig.column !== "FILE" || sortConfig.direction === "none") return "";
        if (sortConfig.fileSortKey === "name") {
            return sortConfig.direction === "asc" ? " ▲ A-Z" : " ▼ Z-A";
        }
        if (sortConfig.fileSortKey === "modTime") return " ▼ Mod. Time";
        return "";
    };

    const getColSortLabel = (col: string) => {
        if (sortConfig.column !== col || sortConfig.direction === "none") return "";
        return sortConfig.direction === "asc" ? " ▲" : " ▼";
    };

    return (
        <div className={styles.tableWrapper} ref={parentRef}>
            <table className={styles.catTable}>
                <thead>
                    <tr>
                        <th
                            title="Click to toggle sort: Name A-Z -> Name Z-A -> Mod Time -> None"
                            onClick={handleFileHeaderClick}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            FILE{getFileSortLabel()}
                        </th>
                        {columns.map((c) => {
                            const cleanCol = c.startsWith("!") ? c.slice(1) : c;
                            return (
                                <th
                                    key={c}
                                    title="Click to toggle sort: A-Z -> Z-A -> None"
                                    onClick={() => handleColumnHeaderClick(c)}
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                >
                                    {cleanCol.toUpperCase()}
                                    {getColSortLabel(c)}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {virtualItems.length > 0 && (
                        <tr>
                            <td
                                style={{ height: `${virtualItems[0].start}px`, padding: 0, border: 0 }}
                                colSpan={columns.length + 1}
                            />
                        </tr>
                    )}

                    {virtualItems.map((virtualRow) => {
                        const row = sortedRows[virtualRow.index];
                        const parsedFile = parseFileId(row.fileId);

                        return (
                            <tr
                                key={virtualRow.index}
                                style={{
                                    height: `${virtualRow.size}px`,
                                    backgroundColor: hexToRgba(catColor, 0.12),
                                }}
                                className={`${styles.rowHover} ${styles.clickableRow}`}
                                onClick={() => onRowClick(row.fileId, row.lineIndex)}
                                title={`${parsedFile.filePath}\nClick to open at line ${row.lineIndex + 1}`}
                            >
                                <td className={styles.catFileId}>{parsedFile.fileName || "log"}</td>
                                {columns.map((c) => {
                                    const cleanCol = c.startsWith("!") ? c.slice(1) : c;
                                    const val = row.values[c] ?? row.values[cleanCol] ?? "-";
                                    return <td key={c}>{val}</td>;
                                })}
                            </tr>
                        );
                    })}

                    {virtualItems.length > 0 && (
                        <tr>
                            <td
                                style={{
                                    height: `${rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end}px`,
                                    padding: 0,
                                    border: 0,
                                }}
                                colSpan={columns.length + 1}
                            />
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}