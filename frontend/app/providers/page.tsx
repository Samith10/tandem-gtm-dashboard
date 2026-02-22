"use client";

import { useEffect, useState } from "react";
import { listProviders, updateProvider, fetchProviders } from "@/lib/api";
import type { Provider, PipelineStage } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import OutreachModal from "@/components/OutreachModal";
import Toast from "@/components/Toast";

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return <span className="mono text-xs font-medium" style={{ color }}>{score}</span>;
}

function StageBadge({ stage }: { stage: PipelineStage }) {
  const cls: Record<PipelineStage, string> = {
    "Discovered":    "stage-discovered",
    "Outreach Sent": "stage-outreach-sent",
    "Demo Booked":   "stage-demo-booked",
    "Activated":     "stage-activated",
  };
  return <span className={`tag ${cls[stage]}`}>{stage}</span>;
}

function TagChips({ tags }: { tags: string }) {
  const list = tags.split(",").map((t) => t.trim()).filter(Boolean);
  if (!list.length) return null;
  const cls: Record<string, string> = {
    "HIGH PRIORITY":      "tag-high-priority",
    "HIGH VALUE ACCOUNT": "tag-high-value",
    "STALE":              "tag-stale",
    "ESCALATED":          "tag-escalated",
    "ASSIGNED":           "tag-assigned",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {list.map((t) => (
        <span key={t} className={`tag ${cls[t] ?? ""}`}>{t}</span>
      ))}
    </div>
  );
}

function StageSelect({ value, onChange }: { value: PipelineStage; onChange: (s: PipelineStage) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PipelineStage)}
      className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
      style={{ padding: "4px 8px" }}
    >
      {PIPELINE_STAGES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function providerName(p: Provider): string {
  if (p.organization_name) return p.organization_name;
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : `NPI ${p.npi}`;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const [minScore, setMinScore] = useState("");
  const [search, setSearch] = useState("");
  const [outreachTarget, setOutreachTarget] = useState<Provider | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listProviders({
        stage: stageFilter || undefined,
        min_score: minScore ? Number(minScore) : undefined,
        limit: 200,
      });
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stageFilter, minScore]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleStageChange(provider: Provider, stage: PipelineStage) {
    const updated = await updateProvider(provider.id, { stage });
    setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleFetch() {
    setFetching(true);
    try {
      const res = await fetchProviders("NY", 50);
      showToast(`Fetched ${res.fetched} providers`);
      await load();
    } finally {
      setFetching(false);
    }
  }

  const visible = providers.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      providerName(p).toLowerCase().includes(q) ||
      (p.city ?? "").toLowerCase().includes(q) ||
      (p.taxonomy_description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <div style={{ height: 48, background: "#ffffff", borderBottom: "1px solid #e8e8e4", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <h1 className="font-sans font-semibold text-md text-text-primary">Providers</h1>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="mono text-xs text-white bg-accent rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ padding: "6px 12px" }}
        >
          {fetching ? "Fetching..." : "Fetch Providers"}
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e8e8e4", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search name, city, specialty..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mono text-xs text-text-primary bg-background border border-border rounded focus:outline-none focus:border-text-muted"
          style={{ padding: "6px 12px", width: 260 }}
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}
          className="mono text-xs text-text-primary bg-background border border-border rounded focus:outline-none focus:border-text-muted"
          style={{ padding: "6px 8px" }}
        >
          <option value="">All Stages</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="mono text-xs text-text-primary bg-background border border-border rounded focus:outline-none focus:border-text-muted"
          style={{ padding: "6px 8px" }}
        >
          <option value="">All Scores</option>
          <option value="80">Score 80+</option>
          <option value="70">Score 70+</option>
          <option value="50">Score 50+</option>
        </select>
        <span className="mono text-xs text-text-muted" style={{ marginLeft: "auto" }}>
          {visible.length} providers
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 128 }}>
            <p className="mono text-xs text-text-muted">Loading...</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e8e8e4", background: "#ffffff", position: "sticky", top: 0 }}>
                {["Provider", "Specialty", "Location", "Score", "Stage", "Tags", ""].map((h) => (
                  <th
                    key={h}
                    className="mono text-2xs text-text-muted font-medium uppercase tracking-widest text-left"
                    style={{ padding: "10px 16px" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: "1px solid #f0f0ec" }}
                  className="hover:bg-surface transition-colors"
                >
                  <td style={{ padding: "12px 16px" }}>
                    <p className="font-sans text-sm text-text-primary" style={{ lineHeight: 1.3 }}>
                      {providerName(p)}
                    </p>
                    <p className="mono text-2xs text-text-muted" style={{ marginTop: 2 }}>{p.npi}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <p className="font-sans text-xs text-text-secondary">{p.taxonomy_description ?? "--"}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <p className="mono text-xs text-text-secondary">
                      {[p.city, p.state].filter(Boolean).join(", ") || "--"}
                    </p>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <ScoreBadge score={p.icp_score} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StageSelect value={p.stage} onChange={(s) => handleStageChange(p, s)} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <TagChips tags={p.workflow_tags} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => { setOutreachTarget(p); }}
                      className="mono text-2xs text-accent border border-accent rounded hover:bg-accent hover:text-white transition-colors"
                      style={{ padding: "4px 8px", whiteSpace: "nowrap" }}
                    >
                      AI Outreach
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "48px 16px", textAlign: "center" }}>
                    <p className="mono text-xs text-text-muted">No providers found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {outreachTarget && (
        <OutreachModal
          provider={outreachTarget}
          onClose={() => setOutreachTarget(null)}
          onSaved={(updated: Provider) => {
            setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setOutreachTarget(null);
            showToast("Outreach copy saved");
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}