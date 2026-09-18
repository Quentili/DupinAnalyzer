import React, { useState, useEffect, useMemo } from "react";
import { Tab, Theme } from "./types";
import { THEME_KEY, ThemeCtx } from "./context/ThemeContext";

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
    analysis.logPath,
    () => setActiveTab("log"),
    () => setActiveTab((cur) => (cur === "log" ? "results" : cur))
  );

  const uniqueLogsCount = useMemo(() => {
    const logSet = new Set<string>();
    Object.values(analysis.tables).forEach((catTable) => {
      catTable.rows.forEach((row) => {
        const fileName = row.fileId ? row.fileId.split(":")[0] : "";
        if (fileName) logSet.add(fileName);
      });
    });
    return logSet.size;
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

              {tabs.logTabs.map((t) => (
                <button
                  key={t.fileId}
                  className={`${styles.tabBtn} ${styles.tabBtnLog} ${activeTab === "log" && tabs.activeLogFileId === t.fileId ? styles.isActive : ""
                    }`}
                  onClick={() => {
                    tabs.setActiveLogFileId(t.fileId);
                    setActiveTab("log");
                  }}
                  title={t.fileId}
                >
                  <span className={styles.tabBtnLabel}>{t.fileId}</span>
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
              ))}
            </nav>
          </div>

          <ThemeSwitch theme={theme} onChange={setTheme} />
        </header>

        {analysis.error && (
          <div className="banner banner--error">
            <AdaptiveErrorIcon className="banner__icon" /> {analysis.error}
          </div>
        )}

        {activeTab === "setup" && (
          <section className={`${styles.tabContent} ${styles.tabContentSetup} fade-in`}>
            <div className={styles.panelCard}>
              <h2>Analysis Setup</h2>
              <p className={styles.appTagline}>Select source log files and configuration to begin scanning.</p>

              <div className={styles.pathsContainer}>
                <PathRow label="Log Directory" value={analysis.logPath} onPick={analysis.chooseLog} placeholder="No directory selected" />
                <PathRow label="Configuration" value={analysis.configPath} onPick={analysis.chooseConfig} placeholder="No .json file selected" />
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
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!research.isSearching && (visibleColumnStats.length > 0 || uniqueLogsCount > 0) && (
              <div className={`${styles.statsSummary} fade-in`}>
                <div
                  className={`${styles.statCard} ${styles.statCardClickable}`}
                  onClick={() => setIsLogsModalOpen(true)}
                >
                  <span className={styles.statLabel}>ANALYZED LOGS</span>
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
                        <div className={styles.catHeader}>
                          <div className={styles.catTitleWrap}>
                            <AdaptiveCatDot className={styles.catDot} />
                            <span className={styles.catName}>{cat.toUpperCase()}</span>
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
            onClose={() => setSelectedStatColumn(null)}
          />
        )}

        {isLogsModalOpen && (
          <AnalyzedLogsModal
            tables={analysis.tables}
            onClose={() => setIsLogsModalOpen(false)}
          />
        )}
      </main>
    </ThemeCtx.Provider>
  );
}