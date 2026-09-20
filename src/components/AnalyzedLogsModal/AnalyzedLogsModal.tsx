import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { parseFileId } from "../../utils/helpers";
import { CategoryTable } from "../../types";
import styles from "./AnalyzedLogsModal.module.css";
import { AdaptiveSearchIcon } from "../Icons/Icons";

type AnalyzedLogsModalProps = {
    tables: Record<string, CategoryTable>;
    telegramId: string;
    onClose: () => void;
};

export function AnalyzedLogsModal({ tables, telegramId, onClose }: AnalyzedLogsModalProps) {
    const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const hasTelegramId = telegramId.trim().length > 0;

    const uniqueLogs = useMemo(() => {
        const logSet = new Set<string>();
        Object.values(tables).forEach((catTable) => {
            catTable.rows.forEach((row) => {
                const { fileName } = parseFileId(row.fileId);
                if (fileName) logSet.add(fileName);
            });
        });
        return Array.from(logSet).sort();
    }, [tables]);

    const filteredLogs = useMemo(() => {
        if (!searchQuery.trim()) return uniqueLogs;
        const query = searchQuery.toLowerCase();
        return uniqueLogs.filter((fileName) => fileName.toLowerCase().includes(query));
    }, [uniqueLogs, searchQuery]);

    const handleToggle = (fileName: string) => {
        setSelectedLogs((prev) =>
            prev.includes(fileName)
                ? prev.filter((name) => name !== fileName)
                : [...prev, fileName]
        );
    };

    const isAllFilteredSelected =
        filteredLogs.length > 0 &&
        filteredLogs.every((name) => selectedLogs.includes(name));

    const handleToggleAll = () => {
        if (isAllFilteredSelected) {
            setSelectedLogs((prev) => prev.filter((name) => !filteredLogs.includes(name)));
        } else {
            setSelectedLogs((prev) => Array.from(new Set([...prev, ...filteredLogs])));
        }
    };

    const handleGet = async (fileName?: string) => {
        const targets = fileName ? [fileName] : selectedLogs;
        if (targets.length === 0) return;
        if (!hasTelegramId) return;

        try {
            await invoke("get_analyzed_logs", { logs: targets, telegramId });
        } catch (error) {
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3>
                        Analyzed Logs ({filteredLogs.length}
                        {filteredLogs.length !== uniqueLogs.length ? ` / ${uniqueLogs.length}` : ""})
                    </h3>
                    <button className={styles.closeBtn} onClick={onClose}>&times;</button>
                </div>

                {!hasTelegramId && (
                    <div className="banner banner--error" style={{ margin: "0 0 12px" }}>
                        Set a Telegram ID on the Control Panel to enable GET.
                    </div>
                )}

                <div className={styles.actions}>
                    <button type="button" className="btn btn--secondary btn--small" onClick={handleToggleAll}>
                        {isAllFilteredSelected ? "Deselect" : "Select"}
                    </button>

                    <div className={styles.searchBox}>
                        <AdaptiveSearchIcon className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search logs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: "100%", paddingRight: searchQuery ? "28px" : undefined }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.clearSearchBtn}
                                onClick={() => setSearchQuery("")}
                            >
                                &times;
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        className="btn btn--primary btn--small"
                        disabled={selectedLogs.length === 0 || !hasTelegramId}
                        onClick={() => handleGet()}
                    >
                        GET SELECTED ({selectedLogs.length})
                    </button>
                </div>

                <div className={styles.list}>
                    {filteredLogs.length === 0 ? (
                        <div className={styles.emptyMessage}>
                            No log files found matching "{searchQuery}"
                        </div>
                    ) : (
                        filteredLogs.map((fileName) => (
                            <div
                                key={fileName}
                                className={styles.row}
                                onClick={() => handleToggle(fileName)}
                            >
                                <div className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={selectedLogs.includes(fileName)}
                                        onChange={() => { }}
                                    />
                                    <span>{fileName}</span>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--small"
                                    disabled={!hasTelegramId}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleGet(fileName);
                                    }}
                                >
                                    GET
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}