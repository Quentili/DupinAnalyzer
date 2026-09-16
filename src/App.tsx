import { useEffect, useMemo, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FiSearch, FiX } from "react-icons/fi";
import { useVirtualizer } from "@tanstack/react-virtual";
import "./App.css";

type SerdeSystemTime = { secs_since_epoch: number; nanos_since_epoch: number };

type AnalysEvent =
  | { event: "start"; data: { id: string; timestamp: SerdeSystemTime } }
  | { event: "progress"; data: { progress: number; timestamp: SerdeSystemTime } }
  | { event: "batch"; data: { id: string; payload: string[] } }
  | { event: "end"; data: { id: string; payload: string[]; timestamp: SerdeSystemTime } }
  | { event: "openFile"; data: { payload: string[]; timestamp: SerdeSystemTime } };

type RowData = {
  fileId: string;
  lineIndex: number;
  values: Record<string, string>;
};

type CategoryTable = {
  color: string;
  columns: string[];
  rows: RowData[];
};

type Status = "idle" | "running" | "done" | "error";
type Tab = "setup" | "results" | "log";

type ColumnStat = {
  column: string;
  uniqueCount: number;
  valuesMap: Record<string, number>;
};

type SummaryStats = {
  totalMatches: number;
  columnStats: ColumnStat[];
};

type LogTab = {
  fileId: string;
  filePath: string;
  lines: string[];
  highlightLine: number;
  loading: boolean;
  error: string | null;
};

function hexToRgba(hex: string | undefined, alpha: number) {
  if (!hex || !hex.startsWith("#")) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Parses a payload item coming from Rust. Current format:
 *
 *   "{Group1::Value1}::{Group2::Value2}{Category::#Color::LineIndex}"
 *
 * All the matched-group blocks come first (each "{name::value}"), and the
 * LAST "{..}" block in the string is always the category block, which packs
 * three pieces of data joined by "::": category name, hex color, and the
 * 0-based index of the line in the source file where the match was found.
 *
 * Note there is no separator between the last group block and the category
 * block (Rust concatenates them directly), but since we just scan for all
 * "{...}" blocks with a regex, that doesn't matter here.
 */
function parsePayloadItem(item: string) {
  const matches = [...item.matchAll(/\{([^:]+)::([\s\S]*?)\}/g)];
  if (matches.length < 1) return null;

  const catMatch = matches[matches.length - 1];
  const groupMatches = matches.slice(0, -1);

  const category = catMatch[1];
  if (!category) return null;

  const catPayload = catMatch[2] ?? ""; // "#color::lineIndex"
  const splitAt = catPayload.lastIndexOf("::");

  const color = splitAt >= 0 ? catPayload.slice(0, splitAt) : catPayload || "#5e81ac";
  const lineIndexRaw = splitAt >= 0 ? catPayload.slice(splitAt + 2) : "";
  const parsedLineIndex = Number.parseInt(lineIndexRaw, 10);
  const lineIndex = Number.isFinite(parsedLineIndex) ? parsedLineIndex : -1;

  const values: Record<string, string> = {};
  for (const g of groupMatches) {
    values[g[1]] = g[2];
  }

  return { category, color, lineIndex, values };
}

function calculateSummaryStats(tables: Record<string, CategoryTable>): SummaryStats {
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

async function pickFile(extensions: string[]) {
  return (await open({ multiple: false, directory: false, filters: [{ name: "File", extensions }] })) ?? null;
}

async function pickCatalog() {
  return (await open({ multiple: false, directory: true })) ?? null;
}

function joinPath(dir: string, fileName: string) {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? `${dir}${fileName}` : `${dir}${sep}${fileName}`;
}

function StatDetailsModal({
  column,
  valuesMap,
  onClose,
}: {
  column: string;
  valuesMap: Record<string, number>;
  onClose: () => void;
}) {
  const [filterQuery, setFilterQuery] = useState("");

  const entries = Object.entries(valuesMap).sort((a, b) => b[1] - a[1]);
  const filtered = entries.filter(([val]) =>
    val.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Unique Values Breakdown</h2>
            <p className="modal-subtitle">
              Field: <span className="highlight">{column.toUpperCase()}</span> ({entries.length} total unique)
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          <div className="search-box modal-search">
            <FiSearch className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={`Search values in ${column.toUpperCase()}...`}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="modal-values-list">
            {filtered.length === 0 ? (
              <div className="empty-state">No matching values found</div>
            ) : (
              filtered.map(([val, count]) => (
                <div key={val} className="modal-value-item">
                  <span className="modal-val-text">{val}</span>
                  <span className="modal-val-badge">
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

function VirtualizedTable({
  columns,
  rows,
  catColor,
  onRowClick,
}: {
  columns: string[];
  rows: RowData[];
  catColor: string;
  onRowClick: (fileId: string, lineIndex: number) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="table-wrapper" ref={parentRef}>
      <table className="cat__table">
        <thead>
          <tr>
            <th title="Source log file">FILE</th>
            {columns.map((c) => (
              <th key={c}>{c.toUpperCase()}</th>
            ))}
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
            const row = rows[virtualRow.index];
            return (
              <tr
                key={virtualRow.index}
                style={{
                  height: `${virtualRow.size}px`,
                  backgroundColor: hexToRgba(catColor, 0.12),
                }}
                className="row-hover clickable-row"
                onClick={() => onRowClick(row.fileId, row.lineIndex)}
                title={`Click to open ${row.fileId} at line ${row.lineIndex + 1}`}
              >
                <td className="cat__file-id">{row.fileId || "log"}</td>
                {columns.map((c) => (
                  <td key={c}>{row.values[c] ?? "-"}</td>
                ))}
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

function LogViewerTab({ tab }: { tab: LogTab }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);

  const rowVirtualizer = useVirtualizer({
    count: tab.lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

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
    if (tab.lines.length > 0 && tab.highlightLine >= 0 && tab.highlightLine < tab.lines.length) {
      const id = requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(tab.highlightLine, { align: "center" });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [tab.lines.length, tab.highlightLine]);

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

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="logview">
      <div className="logview__toolbar">
        <div className="search-box">
          <FiSearch className="search-icon" />
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
          <div className="logview__match-nav">
            <span className="logview__match-count">
              {matchIndices.length > 0 ? `${matchCursor + 1}/${matchIndices.length}` : "0/0"}
            </span>
            <button className="btn btn--ghost" onClick={() => goToMatch(-1)} disabled={matchIndices.length === 0} title="Previous match">
              ↑
            </button>
            <button className="btn btn--ghost" onClick={() => goToMatch(1)} disabled={matchIndices.length === 0} title="Next match">
              ↓
            </button>
          </div>
        )}

        <div className="logview__info">
          {tab.loading ? "Loading…" : `${tab.lines.length} lines`}
          {" · "}
          line {tab.highlightLine + 1}
        </div>
      </div>

      {tab.error && (
        <div className="banner banner--error">
          <span className="icon">⚠</span> {tab.error}
        </div>
      )}

      <div className="logview__body table-wrapper" ref={parentRef}>
        {tab.loading ? (
          <div className="empty-state">Loading file…</div>
        ) : tab.lines.length === 0 ? (
          <div className="empty-state">File is empty.</div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualItems.map((virtualRow) => {
              const line = tab.lines[virtualRow.index];
              const isHighlighted = virtualRow.index === tab.highlightLine;
              const isMatch = matchSet.has(virtualRow.index);
              const isActiveMatch = isMatch && matchIndices[matchCursor] === virtualRow.index;
              return (
                <div
                  key={virtualRow.index}
                  className={[
                    "logview__line",
                    isHighlighted ? "logview__line--highlight" : "",
                    isMatch ? "logview__line--match" : "",
                    isActiveMatch ? "logview__line--active-match" : "",
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
                  <span className="logview__lineno">{virtualRow.index + 1}</span>
                  <span className="logview__linetext">{line}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [logPath, setLogPath] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const [tables, setTables] = useState<Record<string, CategoryTable>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [selectedStatColumn, setSelectedStatColumn] = useState<string | null>(null);

  const [logTabs, setLogTabs] = useState<LogTab[]>([]);
  const [activeLogFileId, setActiveLogFileId] = useState<string | null>(null);

  const currentFileRef = useRef<string>("");

  async function chooseLog() {
    const path = await pickCatalog();
    if (!path) return;
    setLogPath(path);
    await invoke("selected_path", { path });
  }

  async function chooseConfig() {
    const path = await pickFile(["json"]);
    if (!path) return;
    try {
      await invoke("load_configuration", { path });
      setConfigPath(path);
      setError(null);
    } catch (e) {
      setError(formatConfigError(e));
    }
  }

  async function handleRowClick(fileId: string, lineIndex: number) {
    const existing = logTabs.find((t) => t.fileId === fileId);
    if (existing) {
      setLogTabs((prev) =>
        prev.map((t) => (t.fileId === fileId ? { ...t, highlightLine: lineIndex } : t))
      );
      setActiveLogFileId(fileId);
      setActiveTab("log");
      return;
    }

    const filePath = logPath ? joinPath(logPath, fileId) : fileId;

    setLogTabs((prev) => [
      ...prev,
      { fileId, filePath, lines: [], highlightLine: lineIndex, loading: true, error: null },
    ]);
    setActiveLogFileId(fileId);
    setActiveTab("log");

    const onEvent = new Channel<AnalysEvent>();
    onEvent.onmessage = (msg) => {
      if (msg.event === "openFile") {
        setLogTabs((prev) =>
          prev.map((t) =>
            t.fileId === fileId ? { ...t, lines: msg.data.payload, loading: false } : t
          )
        );
      }
    };

    try {
      await invoke("open_log_at_line", { filePath, onEvent });
    } catch (e) {
      console.error("Failed to open file:", e);
      setLogTabs((prev) =>
        prev.map((t) => (t.fileId === fileId ? { ...t, loading: false, error: String(e) } : t))
      );
    }
  }

  function closeLogTab(fileId: string) {
    setLogTabs((prev) => {
      const remaining = prev.filter((t) => t.fileId !== fileId);

      setActiveLogFileId((curActive) => {
        if (curActive !== fileId) return curActive;
        return remaining.length > 0 ? remaining[remaining.length - 1].fileId : null;
      });

      if (remaining.length === 0) {
        setActiveTab((curTab) => (curTab === "log" ? "results" : curTab));
      }

      return remaining;
    });
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
  }

  const processPayload = (payload: string[], fileId: string) => {
    if (!payload || payload.length === 0) return;

    const categoryNewRows: Record<string, { color: string; rows: RowData[] }> = {};

    for (const item of payload) {
      const parsed = parsePayloadItem(item);
      if (!parsed) {
        console.warn("[Rust Batch Warning] Failed to parse item:", item);
        continue;
      }

      const { category, color, lineIndex, values } = parsed;

      if (!categoryNewRows[category]) {
        categoryNewRows[category] = { color, rows: [] };
      }

      categoryNewRows[category].rows.push({
        fileId,
        lineIndex,
        values,
      });
    }

    setTables((prev) => {
      const next = { ...prev };

      for (const [catName, { color, rows: newRows }] of Object.entries(categoryNewRows)) {
        const existing = next[catName];

        const newCols = newRows.flatMap((r) => Object.keys(r.values));
        const columns = existing
          ? Array.from(new Set([...existing.columns, ...newCols]))
          : Array.from(new Set(newCols));

        const updatedRows = existing ? [...existing.rows, ...newRows] : newRows;

        next[catName] = { color, columns, rows: updatedRows };
      }

      return next;
    });

    setOrder((prev) => {
      const newCats = Object.keys(categoryNewRows).filter((c) => !prev.includes(c));
      return [...prev, ...newCats];
    });
  };

  async function runAnalysis() {
    setTables({});
    setOrder([]);
    setFilter("ALL");
    setError(null);
    setProgress(0);
    setStatus("running");
    currentFileRef.current = "";

    const onEvent = new Channel<AnalysEvent>();
    onEvent.onmessage = (msg) => {
      console.log("[Rust Event]:", msg);

      if (msg.event === "start") {
        currentFileRef.current = msg.data.id;
      }

      if (msg.event === "progress") {
        setProgress(msg.data.progress);
        if (msg.data.progress >= 100) {
          setStatus("done");
          setActiveTab("results");
        }
      }

      if (msg.event === "batch") {
        const fileId = msg.data.id || currentFileRef.current;
        processPayload(msg.data.payload, fileId);
      }

      if (msg.event === "end") {
        const fileId = msg.data.id || currentFileRef.current;
        processPayload(msg.data.payload, fileId);
      }
    };

    try {
      await invoke("analys", { onEvent });
    } catch (e) {
      console.error("[Rust Invoke Error]:", e);
      setStatus("error");
      setError(String(e));
    }
  }

  const canRun = logPath && configPath && status !== "running";
  const visibleCategories = filter === "ALL" ? order : order.filter((c) => c === filter);
  const stats = calculateSummaryStats(tables);

  const catCount = visibleCategories.length;
  const layoutClass =
    catCount === 1
      ? "results--single"
      : catCount === 2
        ? "results--double"
        : "results--multi";

  const activeStatData = stats.columnStats.find((s) => s.column === selectedStatColumn);
  const activeLogTab = logTabs.find((t) => t.fileId === activeLogFileId) ?? null;

  return (
    <main className="app">
      <header className="app__header">
        <div className="header-left">
          <div className="header-content">
            <h1>Dupin<span>Analyzer</span></h1>
          </div>

          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === "setup" ? "is-active" : ""}`}
              onClick={() => setActiveTab("setup")}
            >
              Control Panel
            </button>
            <button
              className={`tab-btn ${activeTab === "results" ? "is-active" : ""}`}
              onClick={() => setActiveTab("results")}
            >
              Results {stats.totalMatches > 0 && <span className="tab-badge">{stats.totalMatches}</span>}
            </button>

            {logTabs.map((t) => (
              <button
                key={t.fileId}
                className={`tab-btn tab-btn--log ${activeTab === "log" && activeLogFileId === t.fileId ? "is-active" : ""}`}
                onClick={() => {
                  setActiveLogFileId(t.fileId);
                  setActiveTab("log");
                }}
                title={t.fileId}
              >
                <span className="tab-btn__label">{t.fileId}</span>
                <span
                  className="tab-btn__close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeLogTab(t.fileId);
                  }}
                  title="Close"
                >
                  <FiX />
                </span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {error && <div className="banner banner--error"><span className="icon">⚠</span> {error}</div>}

      {activeTab === "setup" && (
        <section className="tab-content tab-content--setup fade-in">
          <div className="panel-card">
            <h2>Analysis Setup</h2>
            <p className="app__tagline">Select source log files and configuration to begin scanning.</p>

            <div className="paths-container">
              <PathRow label="Log Directory" value={logPath} onPick={chooseLog} placeholder="No directory selected" />
              <PathRow label="Configuration" value={configPath} onPick={chooseConfig} placeholder="No .json file selected" />
            </div>

            <div className="run-action">
              <button
                className={`btn btn--primary btn--large ${status === "running" ? "btn--pulsing" : ""}`}
                disabled={!canRun}
                onClick={runAnalysis}
              >
                {status === "running" ? `Analyzing (${progress.toFixed(2)}%)` : "Start Analysis"}
              </button>
              <StatusPill status={status} count={stats.totalMatches} progress={progress} />
            </div>
          </div>
        </section>
      )}

      {activeTab === "results" && (
        <section className="tab-content fade-in results-tab">
          <div className="results-toolbar">
            <div className="search-box">
              <FiSearch className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search across matches..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>

            <div className="actions-right">
              <StatusPill status={status} count={stats.totalMatches} progress={progress} />
              <select className="filter" value={filter} onChange={(e) => setFilter(e.target.value)} disabled={order.length === 0}>
                <option value="ALL">All Categories ({order.length})</option>
                {order.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {stats.columnStats.length > 0 && (
            <div className="stats-summary fade-in">
              {stats.columnStats.map(({ column, uniqueCount }) => (
                <div
                  key={column}
                  className="stat-card stat-card--clickable"
                  onClick={() => setSelectedStatColumn(column)}
                  title={`Click to inspect unique ${column.toUpperCase()} values`}
                >
                  <span className="stat-label">Unique {column.toUpperCase()}</span>
                  <span className="stat-value">{uniqueCount}</span>
                  <span className="stat-action-hint">View details &rarr;</span>
                </div>
              ))}
            </div>
          )}

          <div className={`results ${layoutClass}`}>
            {visibleCategories.length === 0 ? (
              <div className="results__empty">
                <div className="empty-state">
                  {status === "running" ? (
                    <div className="loader">Reading logs... ({progress.toFixed(2)}%)</div>
                  ) : (
                    "No matches found. Run an analysis from Control Panel."
                  )}
                </div>
              </div>
            ) : (
              visibleCategories.map((cat) => {
                const tableData = tables[cat];
                const catColor = tableData.color || "#5e81ac";

                const filteredRows = searchQuery.trim()
                  ? tableData.rows.filter(
                    (row) =>
                      row.fileId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      Object.values(row.values).some((val) =>
                        val.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                  )
                  : tableData.rows;

                return (
                  <div className="cat fade-in" key={cat} style={{ "--cat-color": catColor } as React.CSSProperties}>
                    <div className="cat__header">
                      <div className="cat__title-wrap">
                        <span className="cat__dot" style={{ backgroundColor: catColor }}></span>
                        <span className="cat__name">{cat.toUpperCase()}</span>
                      </div>
                      <span className="cat__count">
                        {filteredRows.length} {filteredRows.length === 1 ? "match" : "matches"}
                      </span>
                    </div>

                    <VirtualizedTable
                      columns={tableData.columns}
                      rows={filteredRows}
                      catColor={catColor}
                      onRowClick={handleRowClick}
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {activeTab === "log" && activeLogTab && (
        <section className="tab-content fade-in logview-tab">
          <LogViewerTab tab={activeLogTab} />
        </section>
      )}

      {selectedStatColumn && activeStatData && (
        <StatDetailsModal
          column={selectedStatColumn}
          valuesMap={activeStatData.valuesMap}
          onClose={() => setSelectedStatColumn(null)}
        />
      )}
    </main>
  );
}

function PathRow({ label, value, onPick, placeholder }: { label: string; value: string | null; onPick: () => void; placeholder: string }) {
  return (
    <div className="path-row">
      <span className="path-row__label">{label}</span>
      <div className={"path-row__value" + (value ? " is-filled" : " path-row__value--empty")}>
        {value ?? placeholder}
      </div>
      <button className="btn btn--ghost" onClick={onPick}>Browse</button>
    </div>
  );
}

function StatusPill({ status, count, progress }: { status: Status; count: number; progress: number }) {
  const labels = {
    idle: "Idle",
    running: `Analyzing (${progress.toFixed(2)}%)`,
    done: `Done — ${count} ${count === 1 ? "match" : "matches"}`,
    error: "Failed",
  };
  return (
    <div className={`pill pill--${status}`}>
      <span className="pill__dot"></span>
      {labels[status]}
    </div>
  );
}

function formatConfigError(e: unknown): string {
  if (typeof e === "object" && e !== null && "title" in e && "description" in e) {
    const err = e as { title: string; description: string };
    return `${err.title}: ${err.description}`;
  }
  return String(e);
}

export default App;