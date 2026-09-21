export type Theme = "dark" | "kitty";
export type Status = "idle" | "running" | "done" | "error";
export type Tab = "setup" | "results" | "log";

export type IconProps = {
    className?: string;
    title?: string;
};

export type SerdeSystemTime = {
    secs_since_epoch: number;
    nanos_since_epoch: number;
};

export type AnalysEvent =
    | { event: "start"; data: { id: string; timestamp: SerdeSystemTime } }
    | { event: "progress"; data: { progress: number; timestamp: SerdeSystemTime } }
    | { event: "batch"; data: { id: string; payload: string[] } }
    | { event: "end"; data: { id: string; payload: string[]; timestamp: SerdeSystemTime } };

export type ViewerEvent = {
    event: "readFile";
    data: {
        payload: string[];
        hasMore: boolean;
    };
};

export type RowData = {
    fileId: string;
    lineIndex: number;
    segment?: number;
    values: Record<string, string>;
};

export type CategoryTable = {
    color: string;
    columns: string[];
    rows: RowData[];
};

export type ColumnStat = {
    column: string;
    uniqueCount: number;
    valuesMap: Record<string, number>;
};

export type SummaryStats = {
    totalMatches: number;
    columnStats: ColumnStat[];
};

export type LogTab = {
    fileId: string;
    filePath: string;
    lines: string[];
    highlightLine: number;
    firstLineIndex: number;
    loading: boolean;
    loadingMore: boolean;
    nextPageToFetch: number;
    prevPageToFetch: number;
    hasMore: boolean;
    error: string | null;
};

export type ParsedFileId = {
    fileName: string;
    filePath: string;
    modTime: number;
    createdTime: number | null;
    raw: string;
};

export type SortDirection = "asc" | "desc" | "none";
export type FileSortKey = "name" | "modTime" | "createdTime";

export type SortConfig = {
    column: string | null;
    direction: SortDirection;
    fileSortKey?: FileSortKey;
};