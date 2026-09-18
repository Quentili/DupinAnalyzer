import { useState, useCallback } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { LogTab, ViewerEvent } from "../types";
import { joinPath } from "../utils/helpers";

const PAGE_SIZE = 500;

export const useLogTabs = (
    logPath: string | null,
    onOpenTab: () => void,
    onCloseAll: () => void
) => {
    const [logTabs, setLogTabs] = useState<LogTab[]>([]);
    const [activeLogFileId, setActiveLogFileId] = useState<string | null>(null);

    async function openRowLog(fileId: string, lineIndex: number) {
        const page = Math.floor(lineIndex / PAGE_SIZE);
        const firstLineIndex = page * PAGE_SIZE;

        const existing = logTabs.find((t) => t.fileId === fileId);
        if (existing) {
            const isLoaded =
                lineIndex >= existing.firstLineIndex &&
                lineIndex < existing.firstLineIndex + existing.lines.length;

            if (isLoaded) {
                setLogTabs((prev) =>
                    prev.map((t) => (t.fileId === fileId ? { ...t, highlightLine: lineIndex } : t))
                );
                setActiveLogFileId(fileId);
                onOpenTab();
                return;
            }
        }

        const filePath = logPath ? joinPath(logPath, fileId) : fileId;

        const newTab: LogTab = {
            fileId,
            filePath,
            lines: [],
            highlightLine: lineIndex,
            firstLineIndex,
            loading: true,
            loadingMore: false,
            nextPageToFetch: page + 1,
            prevPageToFetch: page - 1,
            hasMore: true,
            error: null,
        };

        setLogTabs((prev) => {
            const filtered = prev.filter((t) => t.fileId !== fileId);
            return [...filtered, newTab];
        });
        setActiveLogFileId(fileId);
        onOpenTab();

        const onEvent = new Channel<ViewerEvent>();
        onEvent.onmessage = (msg) => {
            if (msg.event === "readFile") {
                setLogTabs((prev) =>
                    prev.map((t) =>
                        t.fileId === fileId
                            ? {
                                ...t,
                                lines: msg.data.payload,
                                hasMore: msg.data.hasMore,
                                loading: false,
                            }
                            : t
                    )
                );
            }
        };

        try {
            await invoke("open_log_at_line", { page, filePath, onEvent });
        } catch (e) {
            setLogTabs((prev) =>
                prev.map((t) => (t.fileId === fileId ? { ...t, loading: false, error: String(e) } : t))
            );
        }
    }

    const fetchNextPage = useCallback((fileId: string) => {
        setLogTabs((prev) => {
            const tab = prev.find((t) => t.fileId === fileId);
            if (!tab || tab.loading || tab.loadingMore || !tab.hasMore) {
                return prev;
            }

            const pageToFetch = tab.nextPageToFetch;
            const onEvent = new Channel<ViewerEvent>();

            onEvent.onmessage = (msg) => {
                if (msg.event === "readFile") {
                    setLogTabs((current) =>
                        current.map((t) =>
                            t.fileId === fileId
                                ? {
                                    ...t,
                                    lines: [...t.lines, ...msg.data.payload],
                                    nextPageToFetch: t.nextPageToFetch + 1,
                                    hasMore: msg.data.hasMore,
                                    loadingMore: false,
                                }
                                : t
                        )
                    );
                }
            };

            invoke("open_log_at_line", { page: pageToFetch, filePath: tab.filePath, onEvent }).catch((e) => {
                setLogTabs((current) =>
                    current.map((t) => (t.fileId === fileId ? { ...t, loadingMore: false, error: String(e) } : t))
                );
            });

            return prev.map((t) => (t.fileId === fileId ? { ...t, loadingMore: true } : t));
        });
    }, []);

    const fetchPrevPage = useCallback((fileId: string): Promise<number> => {
        return new Promise((resolve) => {
            setLogTabs((prev) => {
                const tab = prev.find((t) => t.fileId === fileId);
                if (!tab || tab.loading || tab.loadingMore || tab.prevPageToFetch < 0) {
                    resolve(0);
                    return prev;
                }

                const pageToFetch = tab.prevPageToFetch;
                const onEvent = new Channel<ViewerEvent>();

                onEvent.onmessage = (msg) => {
                    if (msg.event === "readFile") {
                        const fetchedLines = msg.data.payload;
                        setLogTabs((current) =>
                            current.map((t) =>
                                t.fileId === fileId
                                    ? {
                                        ...t,
                                        lines: [...fetchedLines, ...t.lines],
                                        firstLineIndex: pageToFetch * PAGE_SIZE,
                                        prevPageToFetch: t.prevPageToFetch - 1,
                                        loadingMore: false,
                                    }
                                    : t
                            )
                        );
                        resolve(fetchedLines.length);
                    }
                };

                invoke("open_log_at_line", { page: pageToFetch, filePath: tab.filePath, onEvent }).catch((e) => {
                    setLogTabs((current) =>
                        current.map((t) => (t.fileId === fileId ? { ...t, loadingMore: false, error: String(e) } : t))
                    );
                    resolve(0);
                });

                return prev.map((t) => (t.fileId === fileId ? { ...t, loadingMore: true } : t));
            });
        });
    }, []);

    function closeLogTab(fileId: string) {
        setLogTabs((prev) => {
            const remaining = prev.filter((t) => t.fileId !== fileId);
            setActiveLogFileId((cur) => (cur !== fileId ? cur : remaining[remaining.length - 1]?.fileId ?? null));
            if (remaining.length === 0) onCloseAll();
            return remaining;
        });
    }

    const activeLogTab = logTabs.find((t) => t.fileId === activeLogFileId) ?? null;

    return {
        logTabs,
        activeLogFileId,
        activeLogTab,
        setActiveLogFileId,
        openRowLog,
        fetchNextPage,
        fetchPrevPage,
        closeLogTab,
    };
};