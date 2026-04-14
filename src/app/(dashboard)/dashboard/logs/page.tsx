"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { SegmentedControl, CardSkeleton } from "@/shared/components";
import { useTranslations } from "next-intl";

const RequestLoggerV2 = dynamic(
  () => import("@/shared/components").then((mod) => mod.RequestLoggerV2),
  { loading: () => <CardSkeleton /> }
);
const ProxyLogger = dynamic(() => import("@/shared/components").then((mod) => mod.ProxyLogger), {
  loading: () => <CardSkeleton />,
});
const ConsoleLogViewer = dynamic(() => import("@/shared/components/ConsoleLogViewer"), {
  loading: () => <CardSkeleton />,
});
const AuditLogTab = dynamic(() => import("./AuditLogTab"), {
  loading: () => <CardSkeleton />,
});

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
];

const TAB_TO_LOG_TYPE: Record<string, string> = {
  "request-logs": "request-logs",
  "proxy-logs": "proxy-logs",
  "audit-logs": "call-logs",
  console: "call-logs",
};

const TAB_META: Record<
  string,
  {
    icon: string;
    eyebrow: string;
    description: string;
    accent: string;
    stats: Array<{ label: string; value: string }>;
  }
> = {
  "request-logs": {
    icon: "receipt_long",
    eyebrow: "Gateway activity",
    description: "Inspect routed requests, latency, model usage, and pipeline details.",
    accent: "from-violet-500/20 via-fuchsia-500/10 to-cyan-500/10",
    stats: [
      { label: "Primary focus", value: "Requests" },
      { label: "Best for", value: "Traffic analysis" },
      { label: "Detail level", value: "High" },
    ],
  },
  "proxy-logs": {
    icon: "lan",
    eyebrow: "Network path",
    description: "Track proxy hops, TLS fingerprints, status changes, and upstream targets.",
    accent: "from-sky-500/20 via-cyan-500/10 to-emerald-500/10",
    stats: [
      { label: "Primary focus", value: "Proxy health" },
      { label: "Best for", value: "Routing checks" },
      { label: "Detail level", value: "Medium" },
    ],
  },
  "audit-logs": {
    icon: "admin_panel_settings",
    eyebrow: "Security trail",
    description: "Review administrative events, actor history, and security-sensitive changes.",
    accent: "from-amber-500/20 via-orange-500/10 to-rose-500/10",
    stats: [
      { label: "Primary focus", value: "Security" },
      { label: "Best for", value: "Auditing" },
      { label: "Detail level", value: "Structured" },
    ],
  },
  console: {
    icon: "terminal",
    eyebrow: "Runtime output",
    description: "Follow structured app logs in real time for debugging and operational checks.",
    accent: "from-slate-500/30 via-zinc-500/10 to-cyan-500/10",
    stats: [
      { label: "Primary focus", value: "Runtime" },
      { label: "Best for", value: "Debugging" },
      { label: "Detail level", value: "Streaming" },
    ],
  },
};

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState("request-logs");
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("logs");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeTabMeta = useMemo(() => TAB_META[activeTab] ?? TAB_META["request-logs"], [activeTab]);

  const activeTabLabel = useMemo(() => {
    switch (activeTab) {
      case "request-logs":
        return t("requestLogs");
      case "proxy-logs":
        return t("proxyLogs");
      case "audit-logs":
        return t("auditLog");
      case "console":
        return t("console");
      default:
        return t("title");
    }
  }, [activeTab, t]);

  async function handleExport(hours: number) {
    setExporting(true);
    setShowExport(false);
    try {
      const logType = TAB_TO_LOG_TYPE[activeTab] || "call-logs";
      const res = await fetch(`/api/logs/export?hours=${hours}&type=${logType}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `omniroute-${logType}-${hours}h-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <div
          className={`bg-gradient-to-br ${activeTabMeta.accent} border-b border-[var(--color-border)] px-5 py-6 sm:px-6 lg:px-7`}
        >
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] backdrop-blur-sm">
                <span className="material-symbols-outlined text-[15px] text-[var(--color-accent)]">
                  {activeTabMeta.icon}
                </span>
                {activeTabMeta.eyebrow}
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-main)] sm:text-4xl">
                  {t("title")}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
                  {activeTabMeta.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[420px]">
              {activeTabMeta.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 backdrop-blur-sm"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    {stat.label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--color-text-main)]">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-7">
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/70 p-3">
              <SegmentedControl
                options={[
                  { value: "request-logs", label: t("requestLogs"), icon: "receipt_long" },
                  { value: "proxy-logs", label: t("proxyLogs"), icon: "lan" },
                  { value: "audit-logs", label: t("auditLog"), icon: "admin_panel_settings" },
                  { value: "console", label: t("console"), icon: "terminal" },
                ]}
                value={activeTab}
                onChange={setActiveTab}
                aria-label={t("title")}
                className="grid w-full grid-cols-1 gap-1 bg-transparent sm:grid-cols-2 xl:grid-cols-4"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1">
                {activeTabLabel}
              </span>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1">
                Visual redesign only
              </span>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1">
                Existing logic preserved
              </span>
            </div>
          </div>

          <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-main)]">
              <span className="material-symbols-outlined text-[18px] text-[var(--color-accent)]">
                download
              </span>
              Export snapshot
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              Download the current log view without changing filters or behavior in the active tab.
            </p>

            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Current source
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--color-text-main)]">
                <span className="material-symbols-outlined text-[16px]">database</span>
                {activeTabLabel}
              </div>
            </div>

            <div className="relative mt-4" ref={dropdownRef}>
              <button
                id="export-logs-btn"
                onClick={() => setShowExport(!showExport)}
                disabled={exporting}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text-main)] transition-all duration-200 hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-alt)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      d="M8 2v8m0 0l-3-3m3 3l3-3M3 12h10"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {exporting ? "Exporting..." : "Export logs"}
                </span>
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>

              {showExport && (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
                  <div className="border-b border-[var(--color-border)] px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                      Time range
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Export the current tab as JSON.
                    </div>
                  </div>
                  {TIME_RANGES.map((range) => (
                    <button
                      key={range.hours}
                      id={`export-${range.hours}h-btn`}
                      onClick={() => handleExport(range.hours)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-[var(--color-text-main)] transition-colors hover:bg-[var(--color-bg-alt)]"
                    >
                      <span>Last {range.label}</span>
                      {range.hours === 24 && (
                        <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          default
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:p-4">
        {activeTab === "request-logs" && <RequestLoggerV2 />}
        {activeTab === "proxy-logs" && <ProxyLogger />}
        {activeTab === "audit-logs" && <AuditLogTab />}
        {activeTab === "console" && <ConsoleLogViewer />}
      </section>
    </div>
  );
}
