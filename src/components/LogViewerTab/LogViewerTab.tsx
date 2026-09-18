import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LogTab } from "../../types";
import { AdaptiveErrorIcon, AdaptiveSearchIcon } from "../Icons/Icons";
import styles from "./LogViewerTab.module.css";

type LogViewerTabProps = {
    tab: LogTab;
    onLoadMore?: () => void;
    onLoadPrev?: () => void;
};

export function LogViewerTab({ tab, onLoadMore, onLoadPrev }: LogViewerTabProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [matchCursor, setMatchCursor] = useState(0);
    const [isScrolledToTarget, setIsScrolledToTarget] = useState(false);

    const initialScrollDoneRef = useRef(false);
    const prevFirstLineIndexRef = useRef(tab.firstLineIndex);

    const rowVirtualizer = useVirtualizer({
        count: tab.lines.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 22,
        overscan: 12,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

    const localHighlightIndex = useMemo(() => {
        return tab.highlightLine - tab.firstLineIndex;
    }, [tab.highlightLine, tab.firstLineIndex]);

    useLayoutEffect(() => {
        const prevFirst = prevFirstLineIndexRef.current;
        const currentFirst = tab.firstLineIndex;

        if (currentFirst < prevFirst && parentRef.current) {
            const addedLines = prevFirst - currentFirst;
            parentRef.current.scrollTop += addedLines * 22;
        }

        prevFirstLineIndexRef.current = tab.firstLineIndex;
    }, [tab.firstLineIndex, tab.lines.length]);

    useEffect(() => {
        initialScrollDoneRef.current = false;
        setIsScrolledToTarget(false);
        prevFirstLineIndexRef.current = tab.firstLineIndex;
    }, [tab.fileId, tab.highlightLine]);

    useEffect(() => {
        if (tab.loading || tab.lines.length === 0 || initialScrollDoneRef.current) return;

        if (localHighlightIndex >= 0 && localHighlightIndex < tab.lines.length) {
            const id = requestAnimationFrame(() => {
                rowVirtualizer.scrollToIndex(localHighlightIndex, { align: "center" });
                initialScrollDoneRef.current = true;
                const timer = setTimeout(() => {
                    setIsScrolledToTarget(true);
                }, 150);
                return () => clearTimeout(timer);
            });
            return () => cancelAnimationFrame(id);
        } else {
            setIsScrolledToTarget(true);
        }
    }, [localHighlightIndex, tab.lines.length, tab.loading, tab.fileId]);

    useEffect(() => {
        if (tab.loading || tab.loadingMore || !isScrolledToTarget) return;
        if (!virtualItems.length) return;

        const lastItem = virtualItems[virtualItems.length - 1];
        if (onLoadMore && lastItem && lastItem.index >= tab.lines.length - 20) {
            onLoadMore();
        }

        const firstItem = virtualItems[0];
        if (
            onLoadPrev &&
            firstItem &&
            firstItem.index <= 10 &&
            tab.firstLineIndex > 0
        ) {
            onLoadPrev();
        }
    }, [
        virtualItems,
        tab.lines.length,
        tab.loading,
        tab.loadingMore,
        isScrolledToTarget,
        onLoadMore,
        onLoadPrev,
        tab.firstLineIndex,
    ]);

    const matchIndices = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        const idxs: number[] = [];
        tab.lines.forEach((line, i) => {
            if (line.toLowerCase().includes(q)) idxs.push(i);
        });
        return idxs;
    }, [searchQuery, tab.lines]);

    const matchSet = useMemo(() => new Set(matchIndices), [matchIndices]);

    useEffect(() => {
        setMatchCursor(0);
        if (matchIndices.length > 0) {
            rowVirtualizer.scrollToIndex(matchIndices[0], { align: "center" });
        }
    }, [searchQuery]);

    function goToMatch(dir: 1 | -1) {
        if (matchIndices.length === 0) return;
        const next = (matchCursor + dir + matchIndices.length) % matchIndices.length;
        setMatchCursor(next);
        rowVirtualizer.scrollToIndex(matchIndices[next], { align: "center" });
    }

    function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            goToMatch(e.shiftKey ? -1 : 1);
        }
    }

    return (
        <div className={styles.logview}>
            <div className={styles.logviewToolbar}>
                <div className="search-box">
                    <AdaptiveSearchIcon className="search-icon" />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search in file..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                    />
                </div>

                {searchQuery.trim() && (
                    <div className={styles.logviewMatchNav}>
                        <span className={styles.logviewMatchCount}>
                            {matchIndices.length > 0 ? `${matchCursor + 1}/${matchIndices.length}` : "0/0"}
                        </span>
                        <button
                            className="btn btn--ghost"
                            onClick={() => goToMatch(-1)}
                            disabled={matchIndices.length === 0}
                            title="Previous match"
                        >
                            ↑
                        </button>
                        <button
                            className="btn btn--ghost"
                            onClick={() => goToMatch(1)}
                            disabled={matchIndices.length === 0}
                            title="Next match"
                        >
                            ↓
                        </button>
                    </div>
                )}

                <div className={styles.logviewInfo}>
                    {tab.loading ? (
                        "Loading…"
                    ) : (
                        <>
                            {tab.lines.length} lines
                            {tab.loadingMore && " (loading more…)"}
                        </>
                    )}
                    {" · "}
                    line {tab.highlightLine + 1}
                </div>
            </div>

            {tab.error && (
                <div className="banner banner--error">
                    <AdaptiveErrorIcon className="banner__icon" /> {tab.error}
                </div>
            )}

            <div className={`${styles.logviewBody} table-wrapper`} ref={parentRef}>
                {tab.loading ? (
                    <div className="empty-state">Loading file…</div>
                ) : tab.lines.length === 0 ? (
                    <div className="empty-state">File is empty.</div>
                ) : (
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                        {virtualItems.map((virtualRow) => {
                            const line = tab.lines[virtualRow.index];
                            const isHighlighted = virtualRow.index === localHighlightIndex;
                            const isMatch = matchSet.has(virtualRow.index);
                            const isActiveMatch = isMatch && matchIndices[matchCursor] === virtualRow.index;
                            return (
                                <div
                                    key={virtualRow.index}
                                    className={[
                                        styles.logviewLine,
                                        isHighlighted ? styles.logviewLineHighlight : "",
                                        isMatch ? styles.logviewLineMatch : "",
                                        isActiveMatch ? styles.logviewLineActiveMatch : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <span className={styles.logviewLineno}>{tab.firstLineIndex + virtualRow.index + 1}</span>
                                    <span className={styles.logviewLinetext}>{line}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}