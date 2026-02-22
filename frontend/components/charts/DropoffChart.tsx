"use client";

import type { OutreachFreshness } from "@/lib/types";

const BUCKETS = [
  { key: "fresh",       label: "Fresh",       sub: "< 7 days",  color: "#16a34a" },
  { key: "aging",       label: "Aging",       sub: "7-14 days", color: "#d97706" },
  { key: "stale",       label: "Stale",       sub: "> 14 days", color: "#dc2626" },
  { key: "no_outreach", label: "No Outreach", sub: "never",     color: "#e8e8e4" },
] as const;

export default function DropoffChart({ data }: { data: OutreachFreshness }) {
  const total = BUCKETS.reduce((sum, b) => sum + (data[b.key] ?? 0), 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 8, width: "100%", borderRadius: 4, overflow: "hidden", gap: 1 }}>
        {BUCKETS.map((b) => {
          const pct = (data[b.key] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={b.key}
              style={{ width: `${pct}%`, backgroundColor: b.color, height: "100%", transition: "width 0.5s" }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
        {BUCKETS.map((b) => (
          <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: b.color, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontFamily: "Geist, sans-serif", fontSize: 12, color: "#6b6b6b", whiteSpace: "nowrap" }}>
                {b.label}{" "}
                <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 11, color: "#a0a0a0" }}>
                  {b.sub}
                </span>
              </span>
              <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 12, color: "#0a0a0a" }}>
                {data[b.key]}
                <span style={{ color: "#a0a0a0", marginLeft: 4 }}>
                  ({Math.round((data[b.key] / total) * 100)}%)
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}