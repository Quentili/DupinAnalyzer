import { open } from "@tauri-apps/plugin-dialog";
import {
    CategoryTable,
    ParsedFileId,
    RowData,
    SortConfig,
    SummaryStats,
} from "../types";

export function hexToRgba(hex: string | undefined, alpha: number): string {
    if (!hex || !hex.startsWith("#")) return `rgba(255, 255, 255, ${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const stripBraces = (s: string) => s.replace(/^\{|\}$/g, "").trim();

export function basename(p: string): string {
    return p.split(/[\\/]/).pop() || p;
}

export function dirname(p: string): string {
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return idx > 0 ? p.slice(0, idx) : "";
}

export function parseFileId(fileId: string): ParsedFileId {
    if (!fileId) {
        return { fileName: "log", filePath: "", modTime: 0, createdTime: null, raw: "" };
    }

    const idx = fileId.lastIndexOf("::");
    if (idx > 0) {
        const filePath = stripBraces(fileId.slice(0, idx));
        const modTime = Number.parseInt(stripBraces(fileId.slice(idx + 2)), 10) || 0;
        return { fileName: basename(filePath), filePath, modTime, createdTime: null, raw: fileId };
    }

    const filePath = stripBraces(fileId);
    return { fileName: basename(filePath), filePath, modTime: 0, createdTime: null, raw: fileId };
}

export function parsePayloadItem(item: string) {
    const matches = [...item.matchAll(/\{([^:]+)::([\s\S]*?)\}/g)];
    if (matches.length < 1) return null;

    const catMatch = matches[matches.length - 1];
    const groupMatches = matches.slice(0, -1);

    const category = catMatch[1];
    if (!category) return null;

    const catPayload = catMatch[2] ?? "";

    const parts = catPayload.split("::");

    const color = parts[0] || "#5e81ac";

    const lineIndexRaw = parts[1] ?? "";
    const parsedLineIndex = Number.parseInt(lineIndexRaw, 10);
    const lineIndex = Number.isFinite(parsedLineIndex) ? parsedLineIndex : -1;

    const segmentRaw = parts[2] ?? "";
    const parsedSegment = Number.parseInt(segmentRaw, 10);
    const segment = Number.isFinite(parsedSegment) ? parsedSegment : 0;

    const values: Record<string, string> = {};
    for (const g of groupMatches) {
        values[g[1]] = g[2];
    }

    return { category, color, lineIndex, segment, values };
}

export function calculateSummaryStats(tables: Record<string, CategoryTable>): SummaryStats {
    const uniqueValuesPerColumn: Record<string, Record<string, number>> = {};
    let totalMatches = 0;

    for (const cat of Object.values(tables)) {
        for (const row of cat.rows) {
            totalMatches++;
            for (const [col, val] of Object.entries(row.values)) {
                if (!val) continue;
                if (!uniqueValuesPerColumn[col]) {
                    uniqueValuesPerColumn[col] = {};
                }
                uniqueValuesPerColumn[col][val] = (uniqueValuesPerColumn[col][val] || 0) + 1;
            }
        }
    }

    const columnStats = Object.entries(uniqueValuesPerColumn).map(([column, valuesMap]) => ({
        column,
        uniqueCount: Object.keys(valuesMap).length,
        valuesMap,
    }));

    return {
        totalMatches,
        columnStats,
    };
}

export function sortRows(rows: RowData[], sortConfig: SortConfig): RowData[] {
    if (!sortConfig.column || sortConfig.direction === "none") {
        return rows;
    }

    const sorted = [...rows];
    const { column, direction, fileSortKey = "name" } = sortConfig;
    const multiplier = direction === "asc" ? 1 : -1;

    if (column === "FILE") {
        sorted.sort((a, b) => {
            const fileA = parseFileId(a.fileId);
            const fileB = parseFileId(b.fileId);

            if (fileSortKey === "modTime") {
                return (fileA.modTime - fileB.modTime) * multiplier;
            }

            return fileA.fileName.localeCompare(fileB.fileName, undefined, { numeric: true, sensitivity: "base" }) * multiplier;
        });
    } else {
        sorted.sort((a, b) => {
            const cleanCol = column.startsWith("!") ? column.slice(1) : column;
            const valA = a.values[column] ?? a.values[cleanCol] ?? "";
            const valB = b.values[column] ?? b.values[cleanCol] ?? "";

            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" }) * multiplier;
        });
    }

    return sorted;
}

export async function pickFile(extensions: string[]): Promise<string | null> {
    return ((await open({ multiple: false, directory: false, filters: [{ name: "File", extensions }] })) as string | null) ?? null;
}

export async function pickCatalogs(): Promise<string[]> {
    const res = await open({ multiple: true, directory: true });
    if (!res) return [];
    return Array.isArray(res) ? res : [res];
}

export function joinPath(dir: string, fileName: string): string {
    const sep = dir.includes("\\") ? "\\" : "/";
    return dir.endsWith(sep) ? `${dir}${fileName}` : `${dir}${sep}${fileName}`;
}

export function formatConfigError(e: unknown): string {
    if (typeof e === "object" && e !== null && "title" in e && "description" in e) {
        const err = e as { title: string; description: string };
        return `${err.title}: ${err.description}`;
    }
    return String(e);
}