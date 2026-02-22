"use client";

import { useEffect, useState } from "react";
import {
  getDashboardSummary,
  getFunnelMetrics,
  getTimeToActivate,
  getOutreachFreshness,
  runWorkflows,
  fetchProviders,
} from "@/lib/api";
import type {
  DashboardSummary,
  FunnelMetrics,
  TimeToActivate,
  OutreachFreshness,
} from "@/lib/types";
import FunnelChart from "@/components/charts/FunnelChart";
import DropoffChart from "@/components/charts/DropoffChart";
import Toast from "@/components/Toast";

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "red" | "accent";
}) {
  const color = { green: "#16a34a", amber: "#d97706", red: "#dc2626", accent: "#2563eb" }[accent ?? "green"];
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 7, padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
      <p className="mono text-xs text-text-muted uppercase tracking-widest">{label}</p>
      <p className="mono text-2xl font-medium" style={{ color }}>{value}</p>
      {sub && <p className="mono text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="font-sans font-semibold text-md text-text-primary" style={{ marginBottom: 12 }}>{title}</h2>;
}

function StageRow({ stage, count, avg_score, stale_count }: { stage: string; count: number; avg_score: number; stale_count: number }) {
  const scoreColor = avg_score >= 70 ? "#16a34a" : avg_score >= 50 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0ec" }}>
      <span className="font-sans text-sm text-text-primary">{stage}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {stale_count > 0 && <span className="tag tag-stale">{stale_count} stale</span>}
        <span className="mono text-xs" style={{ color: count > 0 ? scoreColor : "#a0a0a0" }}>
          {count > 0 ? `avg ${avg_score}` : "--"}
        </span>
        <span className="mono text-xs text-text-primary" style={{ width: 24, textAlign: "right" }}>{count}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [funnel, setFunnel] = useState<FunnelMetrics[]>([]);
  const [tta, setTta] = useState<TimeToActivate | null>(null);
  const [freshness, setFreshness] = useState<OutreachFreshness | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    try {
      const [s, f, t, fr] = await Promise.all([
        getDashboardSummary(),
        getFunnelMetrics(),
        getTimeToActivate(),
        getOutreachFreshness(),
      ]);
      setSummary(s);
      setFunnel(f);
      setTta(t);
      setFreshness(fr);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleFetch() {
    setFetching(true);
    try {
      const res = await fetchProviders("NY", 50);
      showToast(`Fetched ${res.fetched} providers from NPI registry`);
      await load();
    } finally {
      setFetching(false);
    }
  }

  async function handleRunWorkflows() {
    setRunning(true);
    try {
      const res = await runWorkflows();
      showToast(`Workflows complete — ${res.actions_taken} actions taken`);
      await load();
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="mono text-xs text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <div style={{ height: 48, background: "#ffffff", borderBottom: "1px solid #e8e8e4", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <h1 className="font-sans font-semibold text-md text-text-primary">Dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="mono text-xs text-text-secondary border border-border rounded hover:border-text-muted transition-colors disabled:opacity-40"
            style={{ padding: "6px 12px" }}
          >
            {fetching ? "Fetching..." : "Fetch Providers"}
          </button>
          <button
            onClick={handleRunWorkflows}
            disabled={running}
            className="mono text-xs text-white bg-accent rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ padding: "6px 12px" }}
          >
            {running ? "Running..." : "Run Workflows"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          <StatCard label="Total Providers" value={summary?.total_providers ?? 0} accent="green" />
          <StatCard
            label="Avg ICP Score"
            value={summary?.avg_icp_score ?? 0}
            sub="out of 100"
            accent={(summary?.avg_icp_score ?? 0) >= 70 ? "green" : (summary?.avg_icp_score ?? 0) >= 50 ? "amber" : "red"}
          />
          <StatCard label="Activated" value={summary?.activated_count ?? 0} accent="green" />
          <StatCard label="High Priority" value={summary?.high_priority_count ?? 0} accent="accent" />
          <StatCard label="Stale" value={summary?.stale_count ?? 0} accent={summary?.stale_count ? "amber" : "green"} />
        </div>

        {/* Pipeline + Funnel */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 7, padding: 20 }}>
            <SectionHeader title="Pipeline by Stage" />
            {summary?.pipeline_by_stage.map((s) => (
              <StageRow key={s.stage} {...s} />
            ))}
          </div>
          <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 7, padding: 20 }}>
            <SectionHeader title="Conversion Funnel" />
            <FunnelChart data={funnel} />
          </div>
        </div>

        {/* Time to activate + Outreach freshness */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 7, padding: 20 }}>
            <SectionHeader title="Time to Activate" />
            {tta?.avg_days_to_activate != null ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p className="mono text-2xl font-medium text-green">{tta.avg_days_to_activate}d</p>
                <p className="mono text-xs text-text-muted">avg across {tta.sample_size} activated providers</p>
              </div>
            ) : (
              <p className="mono text-xs text-text-muted">No activated providers yet</p>
            )}
          </div>
          <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 7, padding: 20 }}>
            <SectionHeader title="Outreach Freshness" />
            {freshness
              ? <DropoffChart data={freshness} />
              : <p className="mono text-xs text-text-muted">No outreach data yet</p>
            }
          </div>
        </div>

      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}