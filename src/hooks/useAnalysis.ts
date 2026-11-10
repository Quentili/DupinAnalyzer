import {useState, useRef} from "react";
import {Channel, invoke} from "@tauri-apps/api/core";
import {AnalysEvent, CategoryTable, RowData, Status} from "../types";
import {calculateSummaryStats, formatConfigError, parsePayloadItem, pickCatalogs} from "../utils/helpers";

export const useAnalysis = () => {
    const [logPath, setLogPath] = useState<string[]>([]);
    const [status, setStatus] = useState<Status>("idle");
    const [progress, setProgress] = useState<number>(0);
    const [tables, setTables] = useState<Record<string, CategoryTable>>({});
    const [order, setOrder] = useState<string[]>([]);
    const [filter, setFilter] = useState<string>("ALL");
    const [error, setError] = useState<string | null>(null);
    const [configName, setConfigName] = useState<string | null>(null);
    const [availableConfigs, setAvailableConfigs] = useState<string[]>([]);
    const [configsLoading, setConfigsLoading] = useState(false);

    const currentFileRef = useRef<string>("");

    async function syncPaths(paths: string[]) {
        setLogPath(paths);
        try {
            await invoke("selected_paths", {paths});
        } catch (e) {
            setError(String(e));
        }
    }

    async function chooseLog() {
        const picked = await pickCatalogs();
        if (picked.length === 0) return;
        await syncPaths(Array.from(new Set([...logPath, ...picked])));
    }

    async function removeLog(path: string) {
        await syncPaths(logPath.filter((p) => p !== path));
    }

    async function fetchConfigs() {
        setConfigsLoading(true);
        try {
            const names = await invoke<string[]>("fetch_config_names");
            setAvailableConfigs(names);
            setError(null);
        } catch (e) {
            setError(formatConfigError(e));
        } finally {
            setConfigsLoading(false);
        }
    }

    async function chooseConfig(name: string) {
        if (!name) {
            setConfigName(null);
            return;
        }
        try {
            await invoke("load_configuration", { name });
            setConfigName(name);
            setError(null);
        } catch (e) {
            setConfigName(null);
            setError(formatConfigError(e));
        }
    }
    const processPayload = (payload: string[], fileId: string) => {
        if (!payload?.length) return;
        const categoryNewRows: Record<string, { color: string; rows: RowData[] }> = {};

        for (const item of payload) {
            const parsed = parsePayloadItem(item);
            if (!parsed) continue;

            const {category, color, lineIndex, segment, values} = parsed;

            if (!categoryNewRows[category]) categoryNewRows[category] = {color, rows: []};

            categoryNewRows[category].rows.push({
                fileId,
                lineIndex,
                segment,
                values,
            });
        }

        setTables((prev) => {
            const next = {...prev};
            for (const [catName, {color, rows: newRows}] of Object.entries(categoryNewRows)) {
                const existing = next[catName];
                const newCols = newRows.flatMap((r) => Object.keys(r.values));
                const columns = existing
                    ? Array.from(new Set([...existing.columns, ...newCols]))
                    : Array.from(new Set(newCols));
                next[catName] = {color, columns, rows: existing ? [...existing.rows, ...newRows] : newRows};
            }
            return next;
        });

        setOrder((prev) => [...prev, ...Object.keys(categoryNewRows).filter((c) => !prev.includes(c))]);
    };

    async function runAnalysis(onSuccess?: () => void) {
        setTables({});
        setOrder([]);
        setFilter("ALL");
        setError(null);
        setProgress(0);
        setStatus("running");
        currentFileRef.current = "";

        const onEvent = new Channel<AnalysEvent>();
        onEvent.onmessage = (msg) => {
            if (msg.event === "start") currentFileRef.current = msg.data.id;
            if (msg.event === "progress") {
                setProgress(msg.data.progress);
                if (msg.data.progress >= 100) {
                    setStatus("done");
                    onSuccess?.();
                }
            }
            if (msg.event === "batch" || msg.event === "end") {
                processPayload(msg.data.payload, msg.data.id || currentFileRef.current);
            }
        };

        try {
            await invoke("analys", {onEvent});
        } catch (e) {
            setStatus("error");
            setError(String(e));
        }
    }

    const stats = calculateSummaryStats(tables);
    const canRun = Boolean(logPath.length > 0 && configName && status !== "running");
    const visibleCategories = filter === "ALL" ? order : order.filter((c) => c === filter);

    return {
        logPath, configName, availableConfigs, configsLoading, status, progress, tables, order, filter, error,
        stats, canRun, visibleCategories, setFilter, setError,
        chooseLog, removeLog, chooseConfig, fetchConfigs, runAnalysis,
    };
};