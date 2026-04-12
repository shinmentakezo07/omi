"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Card from "./Card";
import { CardSkeleton } from "./Loading";
import { fmtCompact as fmt, fmtFull, fmtCost } from "@/shared/utils/formatting";
import {
  StatCard,
  ActivityHeatmap,
  DailyTrendChart,
  AccountDonut,
  ApiKeyDonut,
  ApiKeyTable,
  MostActiveDay7d,
  WeeklySquares7d,
  ModelTable,
  ProviderCostDonut,
  ModelOverTimeChart,
  ProviderTable,
} from "./analytics";

// ============================================================================
// Main Component
// ============================================================================

export default function UsageAnalytics() {
  const [range, setRange] = useState("30d");
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/usage/analytics?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError((err as any).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const ranges = [
    { value: "1d", label: "1D" },
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
    { value: "90d", label: "90D" },
    { value: "ytd", label: "YTD" },
    { value: "all", label: "All" },
  ];

  const topModel = useMemo(() => {
    const models = analytics?.byModel || [];
    return models.length > 0 ? models[0].model : "—";
  }, [analytics]);

  const topProvider = useMemo(() => {
    const providers = analytics?.byProvider || [];
    return providers.length > 0 ? providers[0].provider : "—";
  }, [analytics]);

  const busiestDay = useMemo(() => {
    const wp = analytics?.weeklyPattern || [];
    if (!wp.length) return "—";
    const max = wp.reduce((a, b) => (a.avgTokens > b.avgTokens ? a : b), wp[0]);
    return max.avgTokens > 0 ? max.day : "—";
  }, [analytics]);

  const providerCount = useMemo(() => {
    return (analytics?.byProvider || []).length;
  }, [analytics]);

  const providerDiversity = useMemo(() => {
    const providers = analytics?.byProvider || [];
    if (providers.length <= 1) return 0;

    let totalCalls = 0;
    for (const p of providers) {
      totalCalls += p.totalRequests || p.apiCalls || 0;
    }
    if (totalCalls === 0) return 0;

    let h = 0;
    for (const p of providers) {
      const p_i = (p.totalRequests || p.apiCalls || 0) / totalCalls;
      if (p_i > 0) h -= p_i * Math.log2(p_i);
    }

    const maxH = Math.log2(providers.length);
    return maxH > 0 ? (h / maxH) * 100 : 0;
  }, [analytics]);

  if (loading && !analytics) return <CardSkeleton />;
  if (error) return <Card className="p-6 text-center text-red-500">Error: {error}</Card>;

  const s = analytics?.summary || {};

  // ── Derived insight values ──
  const avgTokensPerReq = s.totalRequests > 0 ? Math.round(s.totalTokens / s.totalRequests) : 0;
  const costPerReq = s.totalRequests > 0 ? s.totalCost / s.totalRequests : 0;
  const ioRatio = s.completionTokens > 0 ? (s.promptTokens / s.completionTokens).toFixed(1) : "—";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-gradient-to-br from-surface via-surface to-black/[0.015] p-5 shadow-sm dark:border-white/5 dark:to-white/[0.02] lg:flex-row lg:items-end lg:justify-between lg:p-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted dark:border-white/5 dark:bg-white/[0.04]">
            <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
            Usage analytics
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-text-main">
              Traffic, spend, and provider mix
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              Monitor request volume, cost trends, provider distribution, and model activity across
              the selected window.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-black/[0.03] p-1.5 dark:border-white/5 dark:bg-white/[0.04]">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                range === r.value
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Core metrics
          </p>
          <p className="mt-1 text-sm text-text-muted">
            The top-level health indicators for overall usage.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <StatCard
            icon="generating_tokens"
            label="Total Tokens"
            value={fmt(s.totalTokens)}
            subValue={`${fmtFull(s.totalRequests)} requests`}
          />
          <StatCard
            icon="input"
            label="Input Tokens"
            value={fmt(s.promptTokens)}
            color="text-primary"
          />
          <StatCard
            icon="output"
            label="Output Tokens"
            value={fmt(s.completionTokens)}
            color="text-emerald-500"
          />
          <StatCard
            icon="payments"
            label="Est. Cost"
            value={fmtCost(s.totalCost)}
            color="text-amber-500"
          />
          <StatCard icon="group" label="Accounts" value={s.uniqueAccounts || 0} />
          <StatCard icon="vpn_key" label="API Keys" value={s.uniqueApiKeys || 0} />
          <StatCard icon="model_training" label="Models" value={s.uniqueModels || 0} />
          <StatCard
            icon="swap_horiz"
            label="Fallback Rate"
            value={`${Number(s.fallbackRatePct || 0).toFixed(1)}%`}
            subValue={`${fmtFull(s.fallbackCount || 0)} fallbacks`}
            color="text-amber-500"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Derived insights
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Efficiency and diversity signals layered beneath the primary usage totals.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <StatCard
            icon="speed"
            label="Avg Tokens/Req"
            value={fmt(avgTokensPerReq)}
            color="text-cyan-500"
            tone="secondary"
          />
          <StatCard
            icon="request_quote"
            label="Cost/Request"
            value={fmtCost(costPerReq)}
            color="text-orange-500"
            tone="secondary"
          />
          <StatCard
            icon="compare_arrows"
            label="I/O Ratio"
            value={`${ioRatio}x`}
            color="text-violet-500"
            tone="secondary"
          />
          <StatCard
            icon="star"
            label="Top Model"
            value={topModel}
            color="text-pink-500"
            tone="secondary"
          />
          <StatCard
            icon="cloud"
            label="Top Provider"
            value={topProvider}
            color="text-teal-500"
            tone="secondary"
          />
          <StatCard
            icon="today"
            label="Busiest Day"
            value={busiestDay}
            color="text-rose-500"
            tone="secondary"
          />
          <StatCard
            icon="dns"
            label="Providers"
            value={providerCount}
            color="text-indigo-500"
            tone="secondary"
          />
          <StatCard
            icon="network_node"
            label="Diversity Score"
            value={`${providerDiversity.toFixed(1)}%`}
            color="text-sky-500"
            tone="secondary"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)] xl:items-stretch">
        <ActivityHeatmap activityMap={analytics?.activityMap} />
        <div className="flex flex-col gap-4">
          <MostActiveDay7d activityMap={analytics?.activityMap} />
          <WeeklySquares7d activityMap={analytics?.activityMap} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DailyTrendChart dailyTrend={analytics?.dailyTrend} />
        <ProviderCostDonut byProvider={analytics?.byProvider} />
      </section>

      <ModelOverTimeChart
        dailyByModel={analytics?.dailyByModel}
        modelNames={analytics?.modelNames}
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AccountDonut byAccount={analytics?.byAccount} />
        <ApiKeyDonut byApiKey={analytics?.byApiKey} />
      </section>

      <ProviderTable byProvider={analytics?.byProvider} />
      <ApiKeyTable byApiKey={analytics?.byApiKey} />
      <ModelTable byModel={analytics?.byModel} summary={s} />
    </div>
  );
}
