"use client";

import type { FunnelMetrics } from "@/lib/types";

const STAGE_COLORS: Record<string, string> = {
  "Discovered":    "#e8e8e4",
  "Outreach Sent": "#2563eb",
  "Demo Booked":   "#d97706",
  "Activated":     "#16a34a",
};

export default function FunnelChart({ data }: { data: FunnelMetrics[] }) {
  if (!data.length) {
    return <p className="mono text-xs text-text-muted">No data</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        const color = STAGE_COLORS[d.stage] ?? "#e8e8e4";

        return (
          <div key={d.stage}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-xs text-text-secondary">{d.stage}</span>
              <div className="flex items-center gap-3">
                {d.drop_off_rate != null && d.count > 0 && (
                  <span className="mono text-2xs text-red">
                    -{d.drop_off_rate}%
                  </span>
                )}
                <span className="mono text-xs text-text-primary">{d.count}</span>
              </div>
            </div>
            {/* Bar */}
            <div className="h-1.5 w-full bg-border-subtle rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}