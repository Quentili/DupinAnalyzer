import { useState, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { AnalysEvent, CategoryTable, RowData, Status } from "../types";
import { parsePayloadItem } from "../utils/helpers";

export const useResearch = (logPath: string | null, onError: (msg: string) => void) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchStatus, setSearchStatus] = useState<Status>("idle");
    const [searchProgress, setSearchProgress] = useState(0);
    const [searchTable, setSearchTable] = useState<CategoryTable | null>(null);

    const searchRunId = useRef(0);
    const searchFileRef = useRef("");

    function appendPayload(payload: string[], fileId: string, runId: number) {
        if (!payload?.length || runId !== searchRunId.current) return;
        const newRows: RowData[] = [];
        let color = "#88c0d0";

        for (const item of payload) {
            const parsed = parsePayloadItem(item);
            if (!parsed) continue;
            color = parsed.color || color;

            newRows.push({
                fileId,
                lineIndex: parsed.lineIndex,
                segment: parsed.segment,
                values: parsed.values,
            });
        }

        if (!newRows.length) return;

        setSearchTable((prev) => {
            const base = prev ?? { color, columns: [], rows: [] };
            const newCols = newRows.flatMap((r) => Object.keys(r.values));
            return {
                color: base.color || color,
                columns: Array.from(new Set([...base.columns, ...newCols])),
                rows: [...base.rows, ...newRows],
            };
        });
    }

    async function runResearch(query: string) {
        if (!logPath) {
            onError("Select a log directory first (Control Panel).");
            return;
        }
        const runId = ++searchRunId.current;
        searchFileRef.current = "";
        setSearchStatus("running");
        setSearchProgress(0);
        setSearchTable(null);

        const onEvent = new Channel<AnalysEvent>();
        onEvent.onmessage = (msg) => {
            if (runId !== searchRunId.current) return;
            if (msg.event === "start") searchFileRef.current = msg.data.id;
            if (msg.event === "progress") {
                setSearchProgress(msg.data.progress);
                if (msg.data.progress >= 100) setSearchStatus("done");
            }
            if (msg.event === "batch" || msg.event === "end") {
                appendPayload(msg.data.payload, msg.data.id || searchFileRef.current, runId);
            }
        };

        try {
            await invoke("research", { query, onEvent });
        } catch (e) {
            if (runId !== searchRunId.current) return;
            setSearchStatus("error");
            onError(String(e));
        }
    }

    function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
        const val = e.target.value;
        setSearchQuery(val);
        if (!val.trim() && searchStatus !== "idle") handleClearSearch();
    }

    function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            const trimmed = searchQuery.trim();
            trimmed ? runResearch(trimmed) : handleClearSearch();
        }
    }

    function handleClearSearch() {
        searchRunId.current++;
        setSearchQuery("");
        setSearchStatus("idle");
        setSearchProgress(0);
        setSearchTable(null);
    }

    return {
        searchQuery, searchStatus, searchProgress, searchTable, isSearching: searchStatus !== "idle",
        handleSearchChange, handleSearchKeyDown, handleClearSearch,
    };
};