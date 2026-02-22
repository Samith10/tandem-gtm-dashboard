"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listProviders,
  updateProvider,
  fetchProviders,
  countProviders,
} from "@/lib/api";
import type { SortBy, SortDir, PracticeSize, ProviderFilters } from "@/lib/api";
import type { Provider, PipelineStage } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import OutreachModal from "@/components/OutreachModal";
import Toast from "@/components/Toast";

const ALL_STATES = ["NY", "CA", "TX", "FL", "IL", "PA", "NJ"];
const ALL_TAGS = ["HIGH PRIORITY", "HIGH VALUE ACCOUNT", "STALE", "ESCALATED", "ASSIGNED"];
const PAGE_SIZE = 50;

// Column header definitions -- label, sort key, and alignment
const COLUMNS: { label: string; sortKey: SortBy | null; align?: "right" }[] = [
  { label: "Provider",    sortKey: "name" },
  { label: "Specialty",   sortKey: null },
  { label: "Location",    sortKey: null },
  { label: "Score",       sortKey: "score",             align: "right" },
  { label: "Stage",       sortKey: "last_stage_change" },
  { label: "Outreach",    sortKey: "last_outreach_at" },
  { label: "Tags",        sortKey: null },
  { label: "",            sortKey: null },
];

// ---- small presentational components ----

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return (
    <span className="mono text-xs font-medium" style={{ color }}>
      {score}
    </span>
  );
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

function StageSelect({
  value,
  onChange,
}: {
  value: PipelineStage;
  onChange: (s: PipelineStage) => void;
}) {
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

// Sort indicator shown in column headers
function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ color: "#a0a0a0", marginLeft: 4 }}>↕</span>;
  return (
    <span style={{ color: "#0a0a0a", marginLeft: 4 }}>
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function providerName(p: Provider): string {
  if (p.organization_name) return p.organization_name;
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : `NPI ${p.npi}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

// ---- main page ----

export default function ProvidersPage() {
  const [providers, setProviders]         = useState<Provider[]>([]);
  const [total, setTotal]                 = useState(0);
  const [page, setPage]                   = useState(0);
  const [loading, setLoading]             = useState(true);
  const [fetching, setFetching]           = useState(false);
  const [outreachTarget, setOutreachTarget] = useState<Provider | null>(null);
  const [toast, setToast]                 = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen]     = useState(false);

  // Fetch-button state -- which states to pull from NPI
  const [selectedStates, setSelectedStates] = useState<string[]>(ALL_STATES);

  // Filter state
  const [search,       setSearch]       = useState("");
  const [stageFilter,  setStageFilter]  = useState<PipelineStage | "">("");
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [minScore,     setMinScore]     = useState("");
  const [maxScore,     setMaxScore]     = useState("");
  const [tagFilter,    setTagFilter]    = useState("");
  const [npiType,      setNpiType]      = useState<"" | "1" | "2">("");
  const [hasOutreach,  setHasOutreach]  = useState<"" | "true" | "false">("");
  const [practiceSize, setPracticeSize] = useState<PracticeSize | "">("");

  // Sort state
  const [sortBy,  setSortBy]  = useState<SortBy>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Build the filter object used by both list and count calls
  const buildFilters = useCallback(
    (p: number): ProviderFilters => ({
      stage:         stageFilter  || undefined,
      states:        filterStates.length ? filterStates : undefined,
      min_score:     minScore     ? Number(minScore)  : undefined,
      max_score:     maxScore     ? Number(maxScore)  : undefined,
      tag:           tagFilter    || undefined,
      npi_type:      npiType      ? (Number(npiType) as 1 | 2) : undefined,
      has_outreach:  hasOutreach  ? hasOutreach === "true" : undefined,
      practice_size: practiceSize || undefined,
      sort_by:       sortBy,
      sort_dir:      sortDir,
      limit:         PAGE_SIZE,
      offset:        p * PAGE_SIZE,
    }),
    [stageFilter, filterStates, minScore, maxScore, tagFilter, npiType, hasOutreach, practiceSize, sortBy, sortDir],
  );

  async function load(p: number) {
    setLoading(true);
    try {
      const filters = buildFilters(p);
      const [data, countRes] = await Promise.all([
        listProviders(filters),
        countProviders(filters),
      ]);
      setProviders(data);
      setTotal(countRes.total);
    } finally {
      setLoading(false);
    }
  }

  // Reset to page 0 whenever any filter or sort changes
  useEffect(() => {
    setPage(0);
  }, [stageFilter, filterStates, minScore, maxScore, tagFilter, npiType, hasOutreach, practiceSize, sortBy, sortDir]);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, stageFilter, filterStates, minScore, maxScore, tagFilter, npiType, hasOutreach, practiceSize, sortBy, sortDir]);

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
      const res = await fetchProviders(selectedStates, 200);
      showToast(`Fetched ${res.fetched} providers`);
      setPage(0);
      await load(0);
    } finally {
      setFetching(false);
    }
  }

  function handleSort(key: SortBy) {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      // score defaults desc, everything else defaults asc
      setSortDir(key === "score" ? "desc" : "asc");
    }
  }

  function toggleFilterState(s: string) {
    setFilterStates((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function clearFilters() {
    setStageFilter("");
    setFilterStates([]);
    setMinScore("");
    setMaxScore("");
    setTagFilter("");
    setNpiType("");
    setHasOutreach("");
    setPracticeSize("");
  }

  const activeFilterCount = [
    stageFilter, tagFilter, npiType, hasOutreach, practiceSize,
    minScore, maxScore,
  ].filter(Boolean).length + filterStates.length;

  // Client-side search within the current page only
  const visible = providers.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      providerName(p).toLowerCase().includes(q) ||
      (p.city ?? "").toLowerCase().includes(q) ||
      (p.taxonomy_description ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ---- render ----

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Topbar */}
      <div
        style={{
          height: 48,
          background: "#ffffff",
          borderBottom: "1px solid #e8e8e4",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0,
        }}
      >
        <h1 className="font-sans font-semibold text-md text-text-primary">Providers</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* NPI fetch state toggles */}
          {ALL_STATES.map((s) => {
            const active = selectedStates.includes(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setSelectedStates((prev) =>
                    active ? prev.filter((x) => x !== s) : [...prev, s],
                  )
                }
                className="mono text-2xs rounded transition-colors"
                style={{
                  padding: "3px 7px",
                  background: active ? "#0a0a0a" : "#f7f7f5",
                  color: active ? "#ffffff" : "#6b6b6b",
                  border: "1px solid",
                  borderColor: active ? "#0a0a0a" : "#e8e8e4",
                }}
              >
                {s}
              </button>
            );
          })}

          <button
            onClick={handleFetch}
            disabled={fetching || selectedStates.length === 0}
            className="mono text-xs text-white bg-accent rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ padding: "6px 12px" }}
          >
            {fetching ? "Fetching..." : "Fetch Providers"}
          </button>
        </div>
      </div>

      {/* Search + filter toggle bar */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e8e8e4",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="Search name, city, specialty..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mono text-xs text-text-primary bg-background border border-border rounded focus:outline-none focus:border-text-muted"
          style={{ padding: "6px 12px", width: 240 }}
        />

        {/* Filter panel toggle */}
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="mono text-xs border border-border rounded hover:border-text-muted transition-colors"
          style={{
            padding: "6px 12px",
            background: filtersOpen ? "#0a0a0a" : "#ffffff",
            color: filtersOpen ? "#ffffff" : "#6b6b6b",
          }}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="mono text-xs text-text-muted hover:text-text-primary transition-colors"
            style={{ padding: "6px 0" }}
          >
            Clear
          </button>
        )}

        {/* Pagination */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono text-xs text-text-muted">
            {total > 0
              ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`
              : "0 providers"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="mono text-xs text-text-secondary border border-border rounded hover:border-text-muted transition-colors disabled:opacity-30"
              style={{ padding: "4px 10px" }}
            >
              Prev
            </button>
            <span className="mono text-xs text-text-muted" style={{ padding: "0 4px" }}>
              {page + 1} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="mono text-xs text-text-secondary border border-border rounded hover:border-text-muted transition-colors disabled:opacity-30"
              style={{ padding: "4px 10px" }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <div
          style={{
            background: "#fafaf8",
            borderBottom: "1px solid #e8e8e4",
            padding: "14px 24px",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Stage */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">Stage</span>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}
              className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
              style={{ padding: "5px 8px", minWidth: 140 }}
            >
              <option value="">All stages</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* States */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">State</span>
            <div style={{ display: "flex", gap: 4 }}>
              {ALL_STATES.map((s) => {
                const active = filterStates.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleFilterState(s)}
                    className="mono text-2xs rounded transition-colors"
                    style={{
                      padding: "4px 7px",
                      background: active ? "#0a0a0a" : "#ffffff",
                      color: active ? "#ffffff" : "#6b6b6b",
                      border: "1px solid",
                      borderColor: active ? "#0a0a0a" : "#e8e8e4",
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Score range */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">Score</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                placeholder="Min"
                value={minScore}
                min={0}
                max={100}
                onChange={(e) => setMinScore(e.target.value)}
                className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
                style={{ padding: "5px 8px", width: 58 }}
              />
              <span className="mono text-xs text-text-muted">to</span>
              <input
                type="number"
                placeholder="Max"
                value={maxScore}
                min={0}
                max={100}
                onChange={(e) => setMaxScore(e.target.value)}
                className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
                style={{ padding: "5px 8px", width: 58 }}
              />
            </div>
          </div>

          {/* Tag */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">Tag</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
              style={{ padding: "5px 8px", minWidth: 160 }}
            >
              <option value="">All tags</option>
              {ALL_TAGS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* NPI type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">NPI Type</span>
            <select
              value={npiType}
              onChange={(e) => setNpiType(e.target.value as "" | "1" | "2")}
              className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
              style={{ padding: "5px 8px", minWidth: 130 }}
            >
              <option value="">All types</option>
              <option value="1">Individual (NPI-1)</option>
              <option value="2">Organization (NPI-2)</option>
            </select>
          </div>

          {/* Practice size */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">Practice Size</span>
            <select
              value={practiceSize}
              onChange={(e) => setPracticeSize(e.target.value as PracticeSize | "")}
              className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
              style={{ padding: "5px 8px", minWidth: 130 }}
            >
              <option value="">All sizes</option>
              <option value="solo">Solo (1)</option>
              <option value="small">Small (2-3)</option>
              <option value="group">Group (4+)</option>
            </select>
          </div>

          {/* Has outreach */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="mono text-2xs text-text-muted uppercase tracking-widest">Outreach</span>
            <select
              value={hasOutreach}
              onChange={(e) => setHasOutreach(e.target.value as "" | "true" | "false")}
              className="mono text-xs text-text-primary bg-surface border border-border rounded focus:outline-none focus:border-text-muted"
              style={{ padding: "5px 8px", minWidth: 130 }}
            >
              <option value="">All</option>
              <option value="true">Has outreach</option>
              <option value="false">No outreach</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 128,
            }}
          >
            <p className="mono text-xs text-text-muted">Loading...</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid #e8e8e4",
                  background: "#ffffff",
                  position: "sticky",
                  top: 0,
                }}
              >
                {COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    className="mono text-2xs text-text-muted font-medium uppercase tracking-widest"
                    style={{
                      padding: "10px 16px",
                      textAlign: col.align ?? "left",
                      cursor: col.sortKey ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => col.sortKey && handleSort(col.sortKey)}
                  >
                    {col.label}
                    {col.sortKey && (
                      <SortIndicator
                        active={sortBy === col.sortKey}
                        dir={sortDir}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ padding: "48px 16px", textAlign: "center" }}>
                    <p className="mono text-xs text-text-muted">No providers match the current filters.</p>
                  </td>
                </tr>
              ) : (
                visible.map((p) => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: "1px solid #f0f0ec" }}
                    className="hover:bg-surface transition-colors"
                  >
                    {/* Provider name + NPI */}
                    <td style={{ padding: "12px 16px" }}>
                      <p className="font-sans text-sm text-text-primary" style={{ lineHeight: 1.3 }}>
                        {providerName(p)}
                      </p>
                      <p className="mono text-2xs text-text-muted" style={{ marginTop: 2 }}>{p.npi}</p>
                    </td>

                    {/* Specialty */}
                    <td style={{ padding: "12px 16px" }}>
                      <p className="font-sans text-xs text-text-secondary">
                        {p.taxonomy_description ?? "--"}
                      </p>
                    </td>

                    {/* Location */}
                    <td style={{ padding: "12px 16px" }}>
                      <p className="mono text-xs text-text-secondary">
                        {[p.city, p.state].filter(Boolean).join(", ") || "--"}
                      </p>
                    </td>

                    {/* Score */}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <ScoreBadge score={p.icp_score} />
                    </td>

                    {/* Stage */}
                    <td style={{ padding: "12px 16px" }}>
                      <StageSelect
                        value={p.stage}
                        onChange={(s) => handleStageChange(p, s)}
                      />
                    </td>

                    {/* Last outreach date */}
                    <td style={{ padding: "12px 16px" }}>
                      <span className="mono text-xs text-text-muted">
                        {formatDate(p.last_outreach_at)}
                      </span>
                    </td>

                    {/* Tags */}
                    <td style={{ padding: "12px 16px" }}>
                      <TagChips tags={p.workflow_tags} />
                    </td>

                    {/* Outreach action */}
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => setOutreachTarget(p)}
                        className="mono text-2xs text-accent border border-accent rounded hover:bg-accent hover:text-white transition-colors"
                        style={{ padding: "4px 10px", whiteSpace: "nowrap" }}
                      >
                        Outreach
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {outreachTarget && (
        <OutreachModal
          provider={outreachTarget}
          onClose={() => setOutreachTarget(null)}
          onSaved={(updated) => {
            setProviders((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p)),
            );
            setOutreachTarget(null);
            showToast("Outreach copy saved");
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}