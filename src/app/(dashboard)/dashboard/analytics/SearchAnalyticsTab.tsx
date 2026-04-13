/**
 * Search Analytics Tab
 *
 * Shows search request stats from call_logs (request_type = 'search'),
 * provider breakdown, cache hit rate, and cost summary.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/shared/components";

interface SearchStats {
  total: number;
  today: number;
  cached: number;
  errors: number;
  totalCostUsd: number;
  byProvider: Record<string, { count: number; costUsd: number }>;
  last24h: Array<{ hour: string; count: number }>;
  cacheHitRate: number;
  avgDurationMs: number;
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="flex h-full min-h-[120px] flex-col justify-between rounded-2xl border border-black/5 px-5 py-4 dark:border-white/5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        {label}
      </div>
      <div className="space-y-1.5">
        <div className="text-3xl font-bold leading-none text-text-main">{value}</div>
        {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
      </div>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-semibold text-text-main">{value}</span>
    </div>
  );
}

function formatHourLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).format(date);
}

function SearchChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-black/5 bg-surface px-3 py-2 text-xs shadow-lg dark:border-white/5">
      <div className="font-semibold text-text-main">{formatHourLabel(String(label))}</div>
      {payload.map((entry: any) => (
        <div
          key={entry.dataKey}
          className="mt-1 flex items-center justify-between gap-3 text-text-muted"
        >
          <span>{entry.name}</span>
          <span className="font-medium text-text-main">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function SearchAnalyticsTab() {
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/search/analytics")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load search analytics (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        setStats(data);
        setError(null);
        setLoading(false);
      })
      .catch((fetchError) => {
        setError(
          fetchError instanceof Error ? fetchError.message : "Failed to load search analytics"
        );
        setLoading(false);
      });
  }, []);

  const providers = useMemo(() => {
    return Object.entries(stats?.byProvider ?? {}).sort(
      ([, left], [, right]) => right.count - left.count
    );
  }, [stats?.byProvider]);

  const hourlyData = useMemo(() => {
    return (stats?.last24h ?? []).map((entry) => ({
      hour: entry.hour,
      label: formatHourLabel(entry.hour),
      searches: entry.count,
    }));
  }, [stats?.last24h]);

  const providerChartData = providers.map(([provider, providerStats]) => ({
    provider,
    searches: providerStats.count,
    cost: Number(providerStats.costUsd.toFixed(4)),
    share: stats.total ? Math.round((providerStats.count / stats.total) * 100) : 0,
  }));

  if (loading) {
    return (
      <Card className="flex min-h-[220px] items-center justify-center rounded-3xl border border-black/5 px-6 py-10 text-text-muted dark:border-white/5">
        <div className="flex items-center gap-3 text-sm">
          <span className="material-symbols-outlined animate-spin text-[18px]">
            progress_activity
          </span>
          Loading search analytics…
        </div>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card className="rounded-3xl p-8 text-center text-text-muted">
        <span className="material-symbols-outlined mb-3 block text-[36px]">search_off</span>
        <p className="text-sm">{error || "No search data available yet."}</p>
        <p className="mt-2 text-xs">
          Search requests will appear here after the first search via `/v1/search`.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="manage_search"
          label="Total searches"
          value={stats.total.toLocaleString()}
          sub={`${stats.today.toLocaleString()} in the last 24h`}
        />
        <StatCard
          icon="cached"
          label="Cache hit rate"
          value={`${stats.cacheHitRate}%`}
          sub={`${stats.cached.toLocaleString()} cached requests`}
        />
        <StatCard
          icon="attach_money"
          label="Total cost"
          value={`$${stats.totalCostUsd.toFixed(4)}`}
          sub="Search provider spend"
        />
        <StatCard
          icon="timer"
          label="Avg response"
          value={`${stats.avgDurationMs}ms`}
          sub={stats.errors > 0 ? `${stats.errors} errors observed` : "No errors observed"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <Card className="overflow-hidden rounded-3xl p-0">
          <div className="border-b border-black/5 px-6 py-5 dark:border-white/5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Demand trend
            </p>
            <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-text-main">
                  Search requests over the last 24 hours
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  Track demand spikes and inspect whether cache efficiency is reducing load during
                  busy windows.
                </p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3 text-right dark:border-white/5 dark:bg-white/[0.02]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Today
                </p>
                <p className="mt-1 text-2xl font-bold text-text-main">
                  {stats.today.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="h-80 px-2 py-4 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="searchVolumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(value) => formatHourLabel(String(value))}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickLine={{ stroke: "var(--color-border)" }}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickLine={{ stroke: "var(--color-border)" }}
                  width={40}
                />
                <Tooltip content={<SearchChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="searches"
                  name="Searches"
                  stroke="var(--color-primary)"
                  fill="url(#searchVolumeFill)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Operational summary
          </p>
          <h3 className="mt-2 text-xl font-semibold text-text-main">Search funnel health</h3>
          <p className="mt-2 text-sm text-text-muted">
            Quick operational summary of cache efficiency, reliability, and cost per request.
          </p>

          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <MetricRow
                label="Successful searches"
                value={`${Math.max(stats.total - stats.errors, 0).toLocaleString()}`}
              />
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${stats.total > 0 ? Math.max(((stats.total - stats.errors) / stats.total) * 100, 0) : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <MetricRow
                label="Cost per search"
                value={
                  stats.total > 0 ? `$${(stats.totalCostUsd / stats.total).toFixed(4)}` : "$0.0000"
                }
              />
              <p className="mt-2 text-xs text-text-muted">
                Average spend per routed search request.
              </p>
            </div>
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <MetricRow
                label="Cache misses"
                value={`${Math.max(stats.total - stats.cached, 0).toLocaleString()}`}
              />
              <p className="mt-2 text-xs text-text-muted">
                Requests that required a provider roundtrip.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {providerChartData.length > 0 ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Card className="overflow-hidden rounded-3xl p-0">
            <div className="border-b border-black/5 px-6 py-5 dark:border-white/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Provider mix
              </p>
              <h3 className="mt-2 text-xl font-semibold text-text-main">
                Search traffic by provider
              </h3>
            </div>
            <div className="h-80 px-2 py-4 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={providerChartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="provider"
                    tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={{ stroke: "var(--color-border)" }}
                  />
                  <YAxis
                    tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={{ stroke: "var(--color-border)" }}
                    width={40}
                  />
                  <Tooltip content={<SearchChartTooltip />} />
                  <Bar
                    dataKey="searches"
                    name="Searches"
                    fill="var(--color-primary)"
                    radius={[10, 10, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-3xl p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Ranking
            </p>
            <h3 className="mt-2 text-xl font-semibold text-text-main">Provider breakdown</h3>
            <div className="mt-5 flex flex-col gap-3">
              {providerChartData.map((provider) => (
                <div
                  key={provider.provider}
                  className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-main">{provider.provider}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {provider.searches.toLocaleString()} searches
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-main">{provider.share}%</p>
                      <p className="mt-1 text-xs text-text-muted">${provider.cost.toFixed(4)}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${provider.share}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {stats.total === 0 ? (
        <Card className="rounded-3xl px-6 py-10 text-center text-text-muted">
          <span className="material-symbols-outlined mb-3 block text-[48px] text-primary opacity-50">
            travel_explore
          </span>
          <p className="font-medium text-text-main">No searches yet</p>
          <p className="mt-1 text-sm">
            Use{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/5">POST /v1/search</code>{" "}
            to start routing web searches.
          </p>
        </Card>
      ) : null}

      <Card.Section className="rounded-3xl border border-emerald-500/10 bg-emerald-500/[0.03] px-5 py-4">
        <div className="flex items-start gap-3 text-xs text-text-muted">
          <span className="material-symbols-outlined mt-0.5 text-[16px] text-green-500">
            check_circle
          </span>
          <span>
            <strong className="text-text-main">Free tier available:</strong> Serper (2,500/mo),
            Brave (2,000/mo), Exa (1,000/mo), Tavily (1,000/mo) — total 6,500+ free searches/month
            with automatic failover.
          </span>
        </div>
      </Card.Section>
    </div>
  );
}
