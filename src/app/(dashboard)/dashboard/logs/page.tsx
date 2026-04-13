"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { RequestLoggerV2, ProxyLogger, SegmentedControl } from "@/shared/components";
import ConsoleLogViewer from "@/shared/components/ConsoleLogViewer";
import AuditLogTab from "./AuditLogTab";
import { useTranslations } from "next-intl";

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

const TAB_META: Record<string, { icon: string; eyebrow: string; description: string }> = {
  "request-logs": {
    icon: "receipt_long",
    eyebrow: "Gateway activity",
    description: "Inspect routed requests, latency, model usage, and pipeline details.",
  },
  "proxy-logs": {
    icon: "lan",
    eyebrow: "Network path",
    description: "Track proxy hops, TLS fingerprints, status changes, and upstream targets.",
  },
  "audit-logs": {
    icon: "admin_panel_settings",
    eyebrow: "Security trail",
    description: "Review administrative events, actor history, and security-sensitive changes.",
  },
  console: {
    icon: "terminal",
    eyebrow: "Runtime output",
    description: "Follow structured app logs in real time for debugging and operational checks.",
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
      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(124,58,237,0.16),rgba(14,165,233,0.1)_45%,rgba(15,23,42,0.04))]">
        <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] backdrop-blur-sm">
              <span className="material-symbols-outlined text-[15px] text-[var(--color-accent)]">
                {activeTabMeta.icon}
              </span>
              {activeTabMeta.eyebrow}
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-main)] sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
              {activeTabMeta.description}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-3 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Active view
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--color-text-main)]">
                {activeTabLabel}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-3 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Auto refresh
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--color-text-main)]">
                Live log polling
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-3 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Export
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--color-text-main)]">
                JSON snapshots
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
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
            className="max-w-full overflow-x-auto"
          />

          <div className="relative" ref={dropdownRef}>
            <button
              id="export-logs-btn"
              onClick={() => setShowExport(!showExport)}
              disabled={exporting}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm font-medium text-[var(--color-text-main)] transition-all duration-200 hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-alt)] disabled:cursor-not-allowed disabled:opacity-50"
            >
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
            </button>

            {showExport && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
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
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1">
            {activeTabLabel}
          </span>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1">
            Live updates available inside each view
          </span>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1">
            Export respects the selected tab
          </span>
        </div>
      </div>

      {activeTab === "request-logs" && <RequestLoggerV2 />}
      {activeTab === "proxy-logs" && <ProxyLogger />}
      {activeTab === "audit-logs" && <AuditLogTab />}
      {activeTab === "console" && <ConsoleLogViewer />}
    </div>
  );
}
