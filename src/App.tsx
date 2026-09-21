import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab, Theme } from "./types";
import { THEME_KEY, ThemeCtx } from "./context/ThemeContext";
import { parseFileId } from "./utils/helpers";

import { useAnalysis } from "./hooks/useAnalysis";
import { useResearch } from "./hooks/useResearch";
import { useLogTabs } from "./hooks/useLogTabs";

import {
  AdaptiveCatDot,
  AdaptiveErrorIcon,
  AdaptiveSearchIcon,
  BowIcon,
  CloseIcon,
} from "./components/Icons/Icons";
import { ThemeSwitch } from "./components/ThemeSwitch/ThemeSwitch";
import { LogViewerTab } from "./components/LogViewerTab/LogViewerTab";
import { VirtualizedTable } from "./components/VirtualizedTable/VirtualizedTable";
import { AnalyzedLogsModal } from "./components/AnalyzedLogsModal/AnalyzedLogsModal";

import { StatusPill } from "./components/StatusPill/StatusPill";
import { PathRow } from "./components/PathRow/PathRow";
import { StatDetailsModal } from "./components/StatDetailsModal/StatDetailsModal";

import "./styles/global.css";
import styles from "./App.module.css";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const [selectedStatColumn, setSelectedStatColumn] = useState<string | null>(null);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [isSendingReport, setIsSendingReport] = useState(false);

  type ToastItem = { id: number; message: string };
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = toastTimers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete toastTimers.current[id];
    }
  };

  const pushToast = (message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    toastTimers.current[id] = setTimeout(() => dismissToast(id), 5000);
  };

  useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach(clearTimeout);
      toastTimers.current = {};
    };
  }, []);

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
    return saved === "dark" ? "dark" : "kitty";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { }
  }, [theme]);

  const analysis = useAnalysis();
  const research = useResearch(analysis.logPath, analysis.setError);
  const tabs = useLogTabs(
    () => setActiveTab("log"),
    () => setActiveTab((cur) => (cur === "log" ? "results" : cur))
  );

  useEffect(() => {
    if (analysis.error) {
      pushToast(analysis.error);
      analysis.setError("");
    }
  }, [analysis.error]);

  const matchedLogFiles = useMemo(() => {
    const logSet = new Set<string>();
    Object.values(analysis.tables).forEach((catTable) => {
      catTable.rows.forEach((row) => {
        const { filePath } = parseFileId(row.fileId);
        if (filePath) logSet.add(filePath);
      });
    });
    return Array.from(logSet);
  }, [analysis.tables]);

  const reportableLogFiles = useMemo(() => {
    const logSet = new Set<string>();
    Object.entries(analysis.tables).forEach(([cat, catTable]) => {
      if (cat.startsWith("!")) return;
      catTable.rows.forEach((row) => {
        const { filePath } = parseFileId(row.fileId);
        if (filePath) logSet.add(filePath);
      });
    });
    return Array.from(logSet);
  }, [analysis.tables]);

  const displayTotalMatches = useMemo(() => {
    if (research.isSearching) {
      return research.searchTable?.rows.length ?? 0;
    }
    return Object.entries(analysis.tables)
      .filter(([cat]) => !cat.startsWith("!"))
      .reduce((sum, [_, table]) => sum + table.rows.length, 0);
  }, [analysis.tables, research.isSearching, research.searchTable]);

  const visibleColumnStats = useMemo(() => {
    return analysis.stats.columnStats.filter((s) => !s.column.startsWith("!"));
  }, [analysis.stats.columnStats]);

  const activeStatData = analysis.stats.columnStats.find((s) => s.column === selectedStatColumn);
  const layoutClass =
    analysis.visibleCategories.length === 1
      ? styles.resultsSingle
      : analysis.visibleCategories.length === 2
        ? styles.resultsDouble
        : styles.resultsMulti;

  const uniqueLogsCount = matchedLogFiles.length;
  const hasTelegramId = telegramId.trim().length > 0;
  const canGetReport = hasTelegramId && reportableLogFiles.length > 0 && !isSendingReport;

  const handleGetReport = async () => {
    const targets = reportableLogFiles;
    if (targets.length === 0) return;
    if (!hasTelegramId) return;

    setIsSendingReport(true);
    try {
      console.log(targets);
      
      await invoke("get_analyzed_logs", { logs: targets, telegramId });
    } catch (error) {
      pushToast(typeof error === "string" ? error : "Failed to send report.");
    } finally {
      setIsSendingReport(false);
    }
  };

  return (
    <ThemeCtx.Provider value={theme}>
      <main className={styles.app}>
        <div className={styles.decoLayer} aria-hidden="true" />

        <header className={styles.appHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerContent}>
              <h1>
                <BowIcon className="title-bow" />
                Dupin<span>Analyzer</span>
              </h1>
            </div>

            <nav className={styles.tabNav}>
              <button
                className={`${styles.tabBtn} ${activeTab === "setup" ? styles.isActive : ""}`}
                onClick={() => setActiveTab("setup")}
              >
                Control Panel
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === "results" ? styles.isActive : ""}`}
                onClick={() => setActiveTab("results")}
              >
                Results {displayTotalMatches > 0 && <span className={styles.tabBadge}>{displayTotalMatches}</span>}
              </button>

              {tabs.logTabs.map((t) => {
                const { fileName, filePath } = parseFileId(t.fileId);
                return (
                  <button
                    key={t.fileId}
                    className={`${styles.tabBtn} ${styles.tabBtnLog} ${activeTab === "log" && tabs.activeLogFileId === t.fileId ? styles.isActive : ""
                      }`}
                    onClick={() => {
                      tabs.setActiveLogFileId(t.fileId);
                      setActiveTab("log");
                    }}
                    title={filePath}
                  >
                    <span className={styles.tabBtnLabel}>{fileName}</span>
                    <span
                      className={styles.tabBtnClose}
                      onClick={(e) => {
                        e.stopPropagation();
                        tabs.closeLogTab(t.fileId);
                      }}
                      title="Close"
                    >
                      <CloseIcon />
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <ThemeSwitch theme={theme} onChange={setTheme} />
        </header>

        <div className={styles.toastContainer} aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`${styles.toast} fade-in`}>
              <AdaptiveErrorIcon className={styles.toastIcon} />
              <span className={styles.toastMessage}>{t.message}</span>
              <button
                type="button"
                className={styles.toastClose}
                onClick={() => dismissToast(t.id)}
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>

        {activeTab === "setup" && (
          <section className={`${styles.tabContent} ${styles.tabContentSetup} fade-in`}>
            <div className={styles.panelCard}>
              <h2>Analysis Setup</h2>
              <p className={styles.appTagline}>Select source log files and configuration to begin scanning.</p>

              <div className={styles.pathsContainer}>
                <PathRow
                  label="Directories"
                  value={analysis.logPath}
                  onPick={analysis.chooseLog}
                  onRemove={analysis.removeLog}
                  placeholder="No directories selected"
                  buttonLabel="Add"
                />
                <PathRow label="Configuration" value={analysis.configPath} onPick={analysis.chooseConfig} placeholder="No .json file selected" />
              </div>

              <div className={styles.pathsContainer}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>
                  <label style={{ fontSize: 13, color: "var(--text-dim)", minWidth: 140 }}>
                    Telegram ID <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <input
                    type="number"
                    className={styles.tgIdInput}
                    placeholder="e.g. 123456789"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.runAction}>
                <button
                  className={`btn btn--primary btn--large ${analysis.status === "running" ? "btn--pulsing" : ""}`}
                  disabled={!analysis.canRun}
                  onClick={() => analysis.runAnalysis(() => setActiveTab("results"))}
                >
                  {analysis.status === "running" ? `Analyzing (${analysis.progress.toFixed(0)}%)` : "Start Analysis"}
                </button>
                <StatusPill status={analysis.status} count={displayTotalMatches} progress={analysis.progress} />
              </div>
            </div>
          </section>
        )}
        {activeTab === "results" && (
          <section className={`${styles.tabContent} ${styles.resultsTab} fade-in`}>
            <div className={styles.resultsToolbar}>
              <div className="search-box" style={{ position: "relative" }}>
                <AdaptiveSearchIcon className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search"
                  value={research.searchQuery}
                  onChange={research.handleSearchChange}
                  onKeyDown={research.handleSearchKeyDown}
                  style={{ paddingRight: research.searchQuery ? 32 : undefined }}
                />
                {research.searchQuery && (
                  <button className="search-clear" onClick={research.handleClearSearch} title="Clear search">
                    <CloseIcon />
                  </button>
                )}
              </div>

              <div className={styles.actionsRight}>
                <StatusPill
                  status={research.isSearching ? research.searchStatus : analysis.status}
                  count={displayTotalMatches}
                  progress={research.isSearching ? research.searchProgress : analysis.progress}
                />
                <select
                  className={styles.filter}
                  value={analysis.filter}
                  onChange={(e) => analysis.setFilter(e.target.value)}
                  disabled={analysis.order.length === 0 || research.isSearching}
                >
                  <option value="ALL">All Categories ({analysis.order.length})</option>
                  {analysis.order.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/^!/, "").toUpperCase()}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={!canGetReport}
                  title={!hasTelegramId ? "Set a Telegram ID on the Control Panel" : undefined}
                  onClick={handleGetReport}
                >
                  {isSendingReport ? "Sending…" : `Get Report (${reportableLogFiles.length})`}
                </button>
              </div>
            </div>

            {!research.isSearching && (visibleColumnStats.length > 0 || uniqueLogsCount > 0) && (
              <div className={`${styles.statsSummary} fade-in`}>
                <div
                  className={`${styles.statCard} ${styles.statCardClickable}`}
                  onClick={() => setIsLogsModalOpen(true)}
                >
                  <span className={styles.statLabel}>ANALYZED DOCUMENTS</span>
                  <span className={styles.statValue}>{uniqueLogsCount}</span>
                  <span className={styles.statActionHint}>View & GET &rarr;</span>
                </div>

                {visibleColumnStats.map(({ column, uniqueCount }) => (
                  <div
                    key={column}
                    className={`${styles.statCard} ${styles.statCardClickable}`}
                    onClick={() => setSelectedStatColumn(column)}
                  >
                    <span className={styles.statLabel}>Unique {column.toUpperCase()}</span>
                    <span className={styles.statValue}>{uniqueCount}</span>
                    <span className={styles.statActionHint}>View details &rarr;</span>
                  </div>
                ))}
              </div>
            )}

            {research.isSearching ? (
              <div className={`${styles.results} ${styles.resultsSingle}`}>
                <div
                  className={`${styles.cat} fade-in`}
                  style={{ "--cat-color": research.searchTable?.color ?? "var(--accent)" } as React.CSSProperties}
                >
                  <div className={styles.catHeader}>
                    <div className={styles.catTitleWrap}>
                      <AdaptiveCatDot className={styles.catDot} />
                      <span className={styles.catName}>SEARCH RESULTS</span>
                    </div>
                    <span className={styles.catCount}>
                      {research.searchStatus === "running"
                        ? `Searching… ${research.searchProgress.toFixed(0)}%`
                        : `${research.searchTable?.rows.length ?? 0} matches`}
                    </span>
                  </div>

                  {!research.searchTable || research.searchTable.rows.length === 0 ? (
                    <div className={styles.resultsEmpty} style={{ minHeight: 220 }}>
                      <div className="empty-state">
                        {research.searchStatus === "running"
                          ? `Searching logs… (${research.searchProgress.toFixed(0)}%)`
                          : "No matches found for this query."}
                      </div>
                    </div>
                  ) : (
                    <VirtualizedTable
                      columns={research.searchTable.columns}
                      rows={research.searchTable.rows}
                      catColor={research.searchTable.color}
                      onRowClick={tabs.openRowLog}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className={`${styles.results} ${layoutClass}`}>
                {analysis.visibleCategories.length === 0 ? (
                  <div className={styles.resultsEmpty}>
                    <div className="empty-state">
                      {analysis.status === "running"
                        ? `Reading logs... (${analysis.progress.toFixed(2)}%)`
                        : "No matches found. Run an analysis from Control Panel."}
                    </div>
                  </div>
                ) : (
                  analysis.visibleCategories.map((cat) => {
                    const tableData = analysis.tables[cat];
                    const catColor = tableData.color || "#5e81ac";
                    return (
                      <div
                        className={`${styles.cat} fade-in`}
                        key={cat}
                        style={{ "--cat-color": catColor } as React.CSSProperties}
                      >
                        <div
                          className={styles.catHeader}
                          onClick={() => analysis.setFilter(analysis.filter === cat ? "ALL" : cat)}
                          role="button"
                          tabIndex={0}
                          title={
                            analysis.filter === cat
                              ? "Click to clear filter"
                              : `Filter by ${cat.replace(/^!/, "").toUpperCase()}`
                          }
                          style={{ cursor: "pointer" }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              analysis.setFilter(analysis.filter === cat ? "ALL" : cat);
                            }
                          }}
                        >
                          <div className={styles.catTitleWrap}>
                            <AdaptiveCatDot className={styles.catDot} />
                            <span className={styles.catName}>{cat.replace(/^!/, "").toUpperCase()}</span>
                          </div>
                          <span className={styles.catCount}>{tableData.rows.length} matches</span>
                        </div>

                        <VirtualizedTable
                          columns={tableData.columns}
                          rows={tableData.rows}
                          catColor={catColor}
                          onRowClick={tabs.openRowLog}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "log" && tabs.activeLogTab && (
          <LogViewerTab
            tab={tabs.activeLogTab}
            onLoadMore={() => tabs.fetchNextPage(tabs.activeLogTab!.fileId)}
            onLoadPrev={() => tabs.fetchPrevPage(tabs.activeLogTab!.fileId)}
          />
        )}

        {selectedStatColumn && activeStatData && (
          <StatDetailsModal
            column={selectedStatColumn}
            valuesMap={activeStatData.valuesMap}
            tables={analysis.tables}
            onOpenLog={tabs.openRowLog}
            onClose={() => setSelectedStatColumn(null)}
          />
        )}

        {isLogsModalOpen && (
          <AnalyzedLogsModal
            tables={analysis.tables}
            telegramId={telegramId}
            onClose={() => setIsLogsModalOpen(false)}
          />
        )}
      </main>
    </ThemeCtx.Provider>
  );
}