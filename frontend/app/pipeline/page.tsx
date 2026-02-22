"use client";

import { useEffect, useState } from "react";
import { listProviders, updateProvider } from "@/lib/api";
import type { Provider, PipelineStage } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import OutreachModal from "@/components/OutreachModal";
import Toast from "@/components/Toast";

const COLUMN_CONFIG: Record<PipelineStage, { accent: string; bg: string }> = {
  "Discovered":    { accent: "#6b6b6b", bg: "#f7f7f5" },
  "Outreach Sent": { accent: "#2563eb", bg: "#eff6ff" },
  "Demo Booked":   { accent: "#d97706", bg: "#fffbeb" },
  "Activated":     { accent: "#16a34a", bg: "#f0fdf4" },
};

// Default cap per column -- top N by ICP score
const DEFAULT_CAP = 25;

function ScoreDot({ score }: { score: number }) {
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return (
    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
  );
}

function Tags({ tags }: { tags: string }) {
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {list.map((t) => (
        <span key={t} className={`tag ${cls[t] ?? ""}`}>{t}</span>
      ))}
    </div>
  );
}

function providerName(p: Provider): string {
  if (p.organization_name) return p.organization_name;
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : `NPI ${p.npi}`;
}

function ProviderCard({ provider, onStageChange, onOutreach }: {
  provider: Provider;
  onStageChange: (p: Provider, stage: PipelineStage) => void;
  onOutreach: (p: Provider) => void;
}) {
  const stages = PIPELINE_STAGES;
  const currentIdx = stages.indexOf(provider.stage);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 5, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <ScoreDot score={provider.icp_score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-sans text-xs font-medium text-text-primary" style={{ lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {providerName(provider)}
          </p>
          <p className="mono text-2xs text-text-muted" style={{ marginTop: 2 }}>
            {provider.taxonomy_description ?? "Unknown"}
          </p>
        </div>
        <span className="mono text-2xs text-text-muted" style={{ flexShrink: 0 }}>
          {provider.icp_score}
        </span>
      </div>

      {(provider.city || provider.state) && (
        <p className="mono text-2xs text-text-muted">
          {[provider.city, provider.state].filter(Boolean).join(", ")}
        </p>
      )}

      <Tags tags={provider.workflow_tags} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingTop: 8, borderTop: "1px solid #f0f0ec" }}>
        {currentIdx > 0 && (
          <button
            onClick={() => onStageChange(provider, stages[currentIdx - 1])}
            className="mono text-2xs text-text-muted border border-border rounded hover:border-text-muted transition-colors"
            style={{ padding: "3px 6px" }}
          >
            Back
          </button>
        )}
        {currentIdx < stages.length - 1 && (
          <button
            onClick={() => onStageChange(provider, stages[currentIdx + 1])}
            className="mono text-2xs rounded hover:opacity-80 transition-opacity"
            style={{
              padding: "3px 6px",
              background: COLUMN_CONFIG[stages[currentIdx + 1]].bg,
              color: COLUMN_CONFIG[stages[currentIdx + 1]].accent,
              border: `1px solid ${COLUMN_CONFIG[stages[currentIdx + 1]].accent}`,
            }}
          >
            Advance
          </button>
        )}
        <button
          onClick={() => onOutreach(provider)}
          className="mono text-2xs text-accent border border-accent rounded hover:bg-accent hover:text-white transition-colors"
          style={{ padding: "3px 6px", marginLeft: "auto" }}
        >
          Outreach
        </button>
      </div>
    </div>
  );
}

function Column({ stage, providers, onStageChange, onOutreach }: {
  stage: PipelineStage;
  providers: Provider[];
  onStageChange: (p: Provider, stage: PipelineStage) => void;
  onOutreach: (p: Provider) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const cfg = COLUMN_CONFIG[stage];
  const staleCount = providers.filter((p) => p.workflow_tags.includes("STALE")).length;

  // Sort by score desc, cap at DEFAULT_CAP unless expanded
  const sorted = [...providers].sort((a, b) => b.icp_score - a.icp_score);
  const visible = showAll ? sorted : sorted.slice(0, DEFAULT_CAP);
  const hidden = sorted.length - DEFAULT_CAP;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Column header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 5, background: cfg.bg, marginBottom: 8, flexShrink: 0 }}>
        <span className="font-sans text-xs font-semibold" style={{ color: cfg.accent }}>{stage}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {staleCount > 0 && <span className="tag tag-stale">{staleCount} stale</span>}
          <span className="mono text-xs font-medium" style={{ color: cfg.accent }}>{providers.length}</span>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1 }}>
        {providers.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}>
            <p className="mono text-2xs text-text-muted">Empty</p>
          </div>
        ) : (
          <>
            {visible.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                onStageChange={onStageChange}
                onOutreach={onOutreach}
              />
            ))}
            {/* Show all / collapse toggle */}
            {sorted.length > DEFAULT_CAP && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="mono text-2xs text-text-muted border border-border rounded hover:border-text-muted transition-colors"
                style={{ padding: "6px", textAlign: "center", background: "#ffffff" }}
              >
                {showAll ? "Show less" : `Show ${hidden} more`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [outreachTarget, setOutreachTarget] = useState<Provider | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listProviders({ limit: 5000 });
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleStageChange(provider: Provider, stage: PipelineStage) {
    const updated = await updateProvider(provider.id, { stage });
    setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    showToast(`Moved ${providerName(provider)} to ${stage}`);
  }

  const byStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = providers.filter((p) => p.stage === stage);
    return acc;
  }, {} as Record<PipelineStage, Provider[]>);

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
        <h1 className="font-sans font-semibold text-md text-text-primary">Pipeline</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {PIPELINE_STAGES.map((s) => (
            <span key={s} className="mono text-xs text-text-muted">
              {s}&nbsp;<span className="text-text-primary font-medium">{byStage[s].length}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflow: "hidden", padding: 16, display: "flex", gap: 12 }}>
        {PIPELINE_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            providers={byStage[stage]}
            onStageChange={handleStageChange}
            onOutreach={setOutreachTarget}
          />
        ))}
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