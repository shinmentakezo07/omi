"use client";

import { useMemo, useState, Suspense } from "react";
import { UsageAnalytics, CardSkeleton, SegmentedControl } from "@/shared/components";
import EvalsTab from "../usage/components/EvalsTab";
import SearchAnalyticsTab from "./SearchAnalyticsTab";
import DiversityScoreCard from "./components/DiversityScoreCard";
import ProviderUtilizationTab from "./ProviderUtilizationTab";
import ComboHealthTab from "./ComboHealthTab";
import { useTranslations } from "next-intl";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const t = useTranslations("analytics");

  const tabDescriptions: Record<string, string> = {
    overview: t("overviewDescription"),
    evals: t("evalsDescription"),
    search:
      "Search request analytics — provider breakdown, cache hit rate, cost tracking, and hourly demand.",
    utilization: t("utilizationDescription"),
    comboHealth: t("comboHealthDescription"),
  };

  const tabOptions = [
    { value: "overview", label: t("overview"), icon: "dashboard" },
    { value: "evals", label: t("evals"), icon: "labs" },
    { value: "search", label: "Search", icon: "manage_search" },
    { value: "utilization", label: t("utilization"), icon: "monitoring" },
    { value: "comboHealth", label: t("comboHealth"), icon: "health_metrics" },
  ];

  const tabMeta = useMemo(() => {
    return {
      overview: [
        { label: "Surface", value: "Ops overview" },
        { label: "Focus", value: "Requests, spend, tokens" },
        { label: "Mode", value: "Executive summary" },
      ],
      evals: [
        { label: "Surface", value: "Eval runs" },
        { label: "Focus", value: "Quality and regressions" },
        { label: "Mode", value: "Verification" },
      ],
      search: [
        { label: "Surface", value: "Search routing" },
        { label: "Focus", value: "Volume, cache, providers" },
        { label: "Mode", value: "Demand insights" },
      ],
      utilization: [
        { label: "Surface", value: "Quota capacity" },
        { label: "Focus", value: "Burn rate and headroom" },
        { label: "Mode", value: "Capacity planning" },
      ],
      comboHealth: [
        { label: "Surface", value: "Combo reliability" },
        { label: "Focus", value: "Skew, quota, latency" },
        { label: "Mode", value: "Operational health" },
      ],
    }[activeTab];
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <section className="overflow-hidden rounded-3xl border border-black/5 bg-surface shadow-sm dark:border-white/5">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="bg-gradient-to-br from-primary/[0.12] via-surface to-surface p-6 lg:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-surface/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted backdrop-blur">
              <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
              Dashboard intelligence
            </div>
            <div className="mt-5 max-w-3xl">
              <h1 className="flex items-center gap-3 text-2xl font-bold text-text-main lg:text-3xl">
                <span className="material-symbols-outlined text-[28px] text-primary lg:text-[32px]">
                  analytics
                </span>
                {t("title")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted lg:text-base">
                {tabDescriptions[activeTab]}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {tabMeta.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-black/5 bg-surface/85 px-4 py-3 backdrop-blur dark:border-white/5"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-text-main">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-black/5 bg-black/[0.02] p-6 dark:border-white/5 dark:bg-white/[0.02] xl:border-l xl:border-t-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Navigation
              </p>
              <h2 className="mt-2 text-lg font-semibold text-text-main">Analytics workspaces</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Switch between overview, evaluation, search, utilization, and combo health views
                without leaving the dashboard.
              </p>
            </div>
            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-black/5 bg-surface px-4 py-3 dark:border-white/5">
                <p className="text-xs font-medium text-text-main">Live operational view</p>
                <p className="mt-1 text-xs text-text-muted">
                  Charts and summaries react to the selected analytics surface.
                </p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-surface px-4 py-3 dark:border-white/5">
                <p className="text-xs font-medium text-text-main">Consistent KPI layout</p>
                <p className="mt-1 text-xs text-text-muted">
                  Cards, trend sections, and chart panels now share a common visual system.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-black/5 p-4 dark:border-white/5 lg:p-5">
          <SegmentedControl
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
            className="w-full overflow-x-auto"
          />
        </div>
      </section>

      {activeTab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <Suspense fallback={<CardSkeleton />}>
            <UsageAnalytics />
          </Suspense>
          <div className="xl:sticky xl:top-6">
            <DiversityScoreCard />
          </div>
        </div>
      )}
      {activeTab === "evals" && <EvalsTab />}
      {activeTab === "search" && <SearchAnalyticsTab />}
      {activeTab === "utilization" && <ProviderUtilizationTab />}
      {activeTab === "comboHealth" && <ComboHealthTab />}
    </div>
  );
}
