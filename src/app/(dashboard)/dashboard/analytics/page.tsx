"use client";

import { useState, Suspense } from "react";
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
    search: "Search request analytics — provider breakdown, cache hit rate, and cost tracking.",
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

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <section className="rounded-2xl border border-black/5 bg-gradient-to-br from-surface via-surface to-black/[0.02] p-5 shadow-sm dark:border-white/5 dark:to-white/[0.02] lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted dark:border-white/5 dark:bg-white/[0.04]">
              <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
              Dashboard intelligence
            </div>
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold text-text-main lg:text-3xl">
                <span className="material-symbols-outlined text-primary text-[28px] lg:text-[32px]">
                  analytics
                </span>
                {t("title")}
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-muted lg:text-base">
                {tabDescriptions[activeTab]}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="rounded-full border border-black/5 bg-black/[0.03] px-3 py-1.5 dark:border-white/5 dark:bg-white/[0.04]">
              Executive dashboard
            </span>
            <span className="rounded-full border border-black/5 bg-black/[0.03] px-3 py-1.5 dark:border-white/5 dark:bg-white/[0.04]">
              Live operational view
            </span>
          </div>
        </div>

        <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/5">
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
