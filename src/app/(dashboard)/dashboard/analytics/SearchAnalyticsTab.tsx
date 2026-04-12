/**
 * Search Analytics Tab
 *
 * Shows search request stats from call_logs (request_type = 'search'),
 * provider breakdown, cache hit rate, and cost summary.
 */

"use client";

import { useEffect, useState } from "react";
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
    <Card className="flex h-full min-h-[110px] flex-col justify-between rounded-xl border border-black/5 px-4 py-4 dark:border-white/5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        {label}
      </div>
      <div className="space-y-1.5">
        <div className="text-2xl font-bold leading-none text-text-main">{value}</div>
        {sub && <div className="text-xs text-text-muted">{sub}</div>}
      </div>
    </Card>
  );
}

function ProviderBar({
  provider,
  count,
  total,
  costUsd,
}: {
  provider: string;
  count: number;
  total: number;
  costUsd: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-text">{provider}</span>
        <span className="text-text-muted">
          {count} queries · ${costUsd.toFixed(4)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-text-muted text-right">{pct}%</div>
    </div>
  );
}

export default function SearchAnalyticsTab() {
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/search/analytics")
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`Failed to load search analytics (${r.status})`);
        }
        return r.json();
      })
      .then((d) => {
        setStats(d);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load search analytics");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Card className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/5 px-6 py-10 text-text-muted dark:border-white/5">
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
      <Card className="rounded-2xl p-6 text-center text-text-muted">
        <span className="material-symbols-outlined mb-2 block text-[32px]">search_off</span>
        {error || "No search data available yet."}
        <p className="mt-2 text-xs">
          Search requests will appear here after the first search via /v1/search.
        </p>
      </Card>
    );
  }

  const providers = Object.entries(stats.byProvider).sort(([, a], [, b]) => b.count - a.count);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="manage_search"
          label="Total Searches"
          value={stats.total.toLocaleString()}
          sub={`${stats.today} today`}
        />
        <StatCard
          icon="cached"
          label="Cache Hit Rate"
          value={`${stats.cacheHitRate}%`}
          sub={`${stats.cached} cached requests`}
        />
        <StatCard
          icon="attach_money"
          label="Total Cost"
          value={`$${stats.totalCostUsd.toFixed(4)}`}
          sub="search API costs"
        />
        <StatCard
          icon="timer"
          label="Avg Response"
          value={`${stats.avgDurationMs}ms`}
          sub={stats.errors > 0 ? `${stats.errors} errors` : "No errors"}
        />
      </section>

      {/* Provider Breakdown */}
      {providers.length > 0 && (
        <Card className="rounded-2xl p-5 lg:p-6">
          <div className="mb-5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Provider mix
              </p>
              <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-text-main">
                <span className="material-symbols-outlined text-[20px] text-primary">hub</span>
                Provider Breakdown
              </h3>
            </div>
            <p className="text-xs text-text-muted">Share of routed search traffic by provider.</p>
          </div>
          <div className="flex flex-col gap-4">
            {providers.map(([prov, data]) => (
              <ProviderBar
                key={prov}
                provider={prov}
                count={data.count}
                total={stats.total}
                costUsd={data.costUsd}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {stats.total === 0 && (
        <Card className="rounded-2xl px-6 py-10 text-center text-text-muted">
          <span className="material-symbols-outlined mb-3 block text-[48px] text-primary opacity-50">
            travel_explore
          </span>
          <p className="font-medium text-text-main">No searches yet</p>
          <p className="mt-1 text-sm">
            Use <code className="rounded bg-bg-muted px-1">POST /v1/search</code> to start routing
            web searches.
          </p>
        </Card>
      )}

      {/* Free tier note */}
      <Card.Section className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03] px-4 py-4">
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
