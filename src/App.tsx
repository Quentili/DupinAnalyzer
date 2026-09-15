import { useRef, useState, useEffect } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FiSearch } from "react-icons/fi";
import { useVirtualizer } from "@tanstack/react-virtual";
import "./App.css";

type SerdeSystemTime = { secs_since_epoch: number; nanos_since_epoch: number };

type AnalysEvent =
  | { event: "start"; data: { id: string; timestamp: SerdeSystemTime } }
  | { event: "progress"; data: { category: string; line: string[]; color: string; timestamp: SerdeSystemTime } }
  | { event: "end"; data: { id: string; timestamp: SerdeSystemTime } };

type RowData = {
  fileId: string;
  values: Record<string, string>;
};

type CategoryTable = {
  color: string;
  columns: string[];
  rows: RowData[];
};

type Status = "idle" | "running" | "done" | "error";
type Tab = "setup" | "results";

function hexToRgba(hex: string | undefined, alpha: number) {
  if (!hex || !hex.startsWith('#')) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parsePair(entry: string): [string, string] {
  const i = entry.indexOf("^");
  return i === -1 ? [entry, ""] : [entry.slice(0, i), entry.slice(i + 1)];
}

async function pickFile(extensions: string[]) {
  return (await open({ multiple: false, directory: false, filters: [{ name: "File", extensions }] })) ?? null;
}

async function pickCatalog() {
  return (await open({ multiple: false, directory: true })) ?? null;
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
  onRowClick: (fileId: string, values: Record<string, string>) => void;
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
    <div className="table-wrapper" ref={parentRef} style={{ height: "100%", overflow: "auto" }}>
      <table className="cat__table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
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
                onClick={() => onRowClick(row.fileId, row.values)}
                title={`Click to open ${row.fileId} in editor`}
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

function App() {
  const [logPath, setLogPath] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const [tables, setTables] = useState<Record<string, CategoryTable>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const currentFileRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "running" && activeTab === "results") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [tables, status, activeTab]);

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

  async function handleRowClick(fileId: string, rowValues: Record<string, string>) {
    console.log("Opening file in editor:", fileId, "Row data:", rowValues);
    try {
      // await invoke("open_log_at_line", { filePath: fileId, lineValues: rowValues });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
  }

  async function runAnalysis() {
    setTables({});
    setOrder([]);
    setFilter("ALL");
    setError(null);
    setStatus("running");
    currentFileRef.current = "";

    const onEvent = new Channel<AnalysEvent>();
    onEvent.onmessage = (msg) => {
      if (msg.event === "start") {
        currentFileRef.current = msg.data.id;
      }

      if (msg.event === "progress") {
        const pairs = msg.data.line.map(parsePair);
        const values: Record<string, string> = {};
        for (const [k, v] of pairs) values[k] = v;

        const fileId = currentFileRef.current;

        setTables((prev) => {
          const existing = prev[msg.data.category];
          const columns = existing?.columns ?? pairs.map(([k]) => k);
          const rows = [...(existing?.rows ?? []), { fileId, values }];
          return { ...prev, [msg.data.category]: { color: msg.data.color, columns, rows } };
        });
        setOrder((prev) => (prev.includes(msg.data.category) ? prev : [...prev, msg.data.category]));
      }

      if (msg.event === "end") {
        setStatus("done");
        setActiveTab("results");
      }
    };

    try {
      await invoke("analys", { onEvent });
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }

  const canRun = logPath && configPath && status !== "running";
  const visibleCategories = filter === "ALL" ? order : order.filter((c) => c === filter);
  const totalMatches = order.reduce((sum, c) => sum + tables[c].rows.length, 0);

  return (
    <main className="app">
      <header className="app__header">
        <div className="header-left">
          <div className="header-content">
            <h1>Dupin<span>Analyzer</span></h1>
          </div>

          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'setup' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('setup')}
            >
              Control Panel
            </button>
            <button
              className={`tab-btn ${activeTab === 'results' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('results')}
            >
              Results {totalMatches > 0 && <span className="tab-badge">{totalMatches}</span>}
            </button>
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
                className={`btn btn--primary btn--large ${status === 'running' ? 'btn--pulsing' : ''}`}
                disabled={!canRun}
                onClick={runAnalysis}
              >
                {status === "running" ? "Analyzing logs…" : "Start Analysis"}
              </button>
              <StatusPill status={status} count={totalMatches} />
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
              <StatusPill status={status} count={totalMatches} />
              <select className="filter" value={filter} onChange={(e) => setFilter(e.target.value)} disabled={order.length === 0}>
                <option value="ALL">All Categories ({order.length})</option>
                {order.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={`results ${filter === "ALL" ? "results--grid" : ""}`}>
            {visibleCategories.length === 0 ? (
              <div className="results__empty">
                <div className="empty-state">
                  {status === "running" ? (
                    <div className="loader">Reading logs...</div>
                  ) : (
                    "No matches found. Run an analysis from Control Panel."
                  )}
                </div>
              </div>
            ) : (
              visibleCategories.map((cat) => {
                const tableData = tables[cat];
                const catColor = tableData.color || "#8A6FB5";

                return (
                  <div className="cat fade-in" key={cat} style={{ '--cat-color': catColor } as React.CSSProperties}>
                    <div className="cat__header">
                      <div className="cat__title-wrap">
                        <span className="cat__dot" style={{ backgroundColor: catColor }}></span>
                        <span className="cat__name">{cat.toUpperCase()}</span>
                      </div>
                      <span className="cat__count">{tableData.rows.length} {tableData.rows.length === 1 ? "match" : "matches"}</span>
                    </div>

                    <VirtualizedTable
                      columns={tableData.columns}
                      rows={tableData.rows}
                      catColor={catColor}
                      onRowClick={handleRowClick}
                    />
                  </div>
                );
              })
            )}
            <div ref={bottomRef} style={{ height: "1px", gridColumn: "1 / -1" }} />
          </div>
        </section>
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

function StatusPill({ status, count }: { status: Status; count: number }) {
  const labels = {
    idle: "Idle",
    running: "Analyzing...",
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