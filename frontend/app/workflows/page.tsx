"use client";

import { useEffect, useState } from "react";
import {
  runWorkflows,
  getWorkflowEventsSummary,
  listWorkflowEvents,
} from "@/lib/api";
import type { WorkflowEvent } from "@/lib/types";
import Toast from "@/components/Toast";

// -- Rule definitions (static metadata) --

const RULES = [
  {
    id: "high_priority_flag",
    name: "High Priority Flag",
    trigger: "Score >= 80 AND Stage = Discovered",
    action: "Tag as HIGH PRIORITY",
    tag: "HIGH PRIORITY",
    color: "#dc2626",
    bg: "#fef2f2",
  },
  {
    id: "high_value_account_flag",
    name: "High Value Account",
    trigger: "Provider count at address >= 5",
    action: "Tag as HIGH VALUE ACCOUNT",
    tag: "HIGH VALUE ACCOUNT",
    color: "#2563eb",
    bg: "#eff6ff",
  },
  {
    id: "stale_reengagement",
    name: "Stale Re-engagement",
    trigger: "Stage = Outreach Sent AND no activity > 14 days",
    action: "Tag as STALE, queue re-engagement",
    tag: "STALE",
    color: "#d97706",
    bg: "#fffbeb",
  },
  {
    id: "demo_auto_assign",
    name: "Demo Auto-assign",
    trigger: "Stage = Demo Booked AND rep unassigned",
    action: "Assign to outbound-team",
    tag: null,
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  {
    id: "outbound_escalation",
    name: "Outbound Escalation",
    trigger: "Score >= 70 AND Stage = Discovered AND age > 7 days",
    action: "Escalate to outbound sequence",
    tag: "ESCALATED",
    color: "#dc2626",
    bg: "#fef2f2",
  },
];

// -- Rule card --

function RuleCard({
  rule,
  fireCount,
}: {
  rule: (typeof RULES)[0];
  fireCount: number;
}) {
  const active = fireCount > 0;

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e8e8e4",
      borderRadius: 7,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: active ? rule.color : "#e8e8e4",
            display: "inline-block",
            flexShrink: 0,
          }} />
          <p className="font-sans text-sm font-medium text-text-primary">{rule.name}</p>
        </div>
        <span
          className="mono text-2xs font-medium"
          style={{ color: active ? rule.color : "#a0a0a0", flexShrink: 0 }}
        >
          {fireCount} fired
        </span>
      </div>

      {/* Trigger / action */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span
            className="mono text-2xs text-text-muted"
            style={{ width: 40, flexShrink: 0 }}
          >
            WHEN
          </span>
          <span className="mono text-2xs text-text-primary" style={{ wordBreak: "break-word" }}>
            {rule.trigger}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <span
            className="mono text-2xs text-text-muted"
            style={{ width: 40, flexShrink: 0 }}
          >
            THEN
          </span>
          <span className="mono text-2xs text-text-primary" style={{ wordBreak: "break-word" }}>
            {rule.action}
          </span>
        </div>
      </div>

      {/* Tag badge */}
      {rule.tag && (
        <div>
          <span
            className="mono text-2xs font-medium"
            style={{
              background: rule.bg,
              color: rule.color,
              padding: "2px 8px",
              borderRadius: 3,
            }}
          >
            {rule.tag}
          </span>
        </div>
      )}
    </div>
  );
}

// -- Event row --

function EventRow({ event }: { event: WorkflowEvent }) {
  const rule = RULES.find((r) => r.id === event.rule_name);
  const time = new Date(event.triggered_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 20,
      padding: "10px 0",
      borderBottom: "1px solid #f0f0ec",
    }}>
      <span
        className="mono text-2xs font-medium"
        style={{ color: rule?.color ?? "#6b6b6b", width: 148, flexShrink: 0 }}
      >
        {rule?.name ?? event.rule_name}
      </span>
      <span
        className="mono text-2xs text-text-muted"
        style={{ width: 120, flexShrink: 0 }}
      >
        {event.provider_npi}
      </span>
      <span
        className="mono text-2xs text-text-secondary"
        style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {event.detail ?? "--"}
      </span>
      <span
        className="mono text-2xs text-text-muted"
        style={{ flexShrink: 0, paddingLeft: 8 }}
      >
        {time}
      </span>
    </div>
  );
}

export default function WorkflowsPage() {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    const [s, e] = await Promise.all([
      getWorkflowEventsSummary(),
      listWorkflowEvents({ limit: 50 }),
    ]);
    setSummary(s);
    setEvents(e);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleRun() {
    setRunning(true);
    try {
      const res = await runWorkflows();
      showToast(`${res.actions_taken} actions taken`);
      await load();
    } finally {
      setRunning(false);
    }
  }

  const totalFired = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <div style={{ height: 48, background: "#ffffff", borderBottom: "1px solid #e8e8e4", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 className="font-sans font-semibold text-md text-text-primary">Workflows</h1>
          {totalFired > 0 && (
            <span className="mono text-2xs text-text-muted">{totalFired} total actions</span>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="mono text-xs text-white bg-accent px-3 py-1.5 rounded hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {running ? "Running..." : "Run Workflows"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6" style={{ display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Rule cards */}
        <div>
          <h2 className="font-sans font-semibold text-md text-text-primary" style={{ marginBottom: 12 }}>
            Automation Rules
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {RULES.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                fireCount={summary[rule.id] ?? 0}
              />
            ))}
          </div>
        </div>

        {/* Event log */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="font-sans font-semibold text-md text-text-primary">Event Log</h2>
            <span className="mono text-xs text-text-muted">Last 50 events</span>
          </div>

          <div style={{ background: "#ffffff", border: "1px solid #e8e8e4", borderRadius: 7, padding: "0 16px" }}>
            {events.length === 0 ? (
              <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
                <p className="mono text-xs text-text-muted">
                  No events yet. Click Run Workflows to evaluate rules.
                </p>
              </div>
            ) : (
              <div>
                {/* Table header */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "8px 0",
                  borderBottom: "1px solid #e8e8e4",
                }}>
                  <span className="mono text-2xs text-text-muted font-medium uppercase tracking-widest" style={{ width: 148, flexShrink: 0 }}>Rule</span>
                  <span className="mono text-2xs text-text-muted font-medium uppercase tracking-widest" style={{ width: 120, flexShrink: 0 }}>NPI</span>
                  <span className="mono text-2xs text-text-muted font-medium uppercase tracking-widest" style={{ flex: 1 }}>Detail</span>
                  <span className="mono text-2xs text-text-muted font-medium uppercase tracking-widest" style={{ flexShrink: 0, paddingLeft: 8 }}>Time</span>
                </div>
                {events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}