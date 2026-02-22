import type {
  Provider,
  ProviderUpdate,
  PipelineStage,
  PipelineSummary,
  FunnelMetrics,
  DashboardSummary,
  WorkflowEvent,
  WorkflowRunResult,
  TimeToActivate,
  OutreachFreshness,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json();
}


// -- Providers --

export type SortBy =
  | "score"
  | "discovered_at"
  | "last_stage_change"
  | "last_outreach_at"
  | "name";

export type SortDir = "asc" | "desc";

export type PracticeSize = "solo" | "small" | "group";

export interface ProviderFilters {
  stage?: PipelineStage;
  states?: string[];
  min_score?: number;
  max_score?: number;
  tag?: string;
  npi_type?: 1 | 2;
  has_outreach?: boolean;
  practice_size?: PracticeSize;
  sort_by?: SortBy;
  sort_dir?: SortDir;
  limit?: number;
  offset?: number;
}

// Shared helper -- builds URLSearchParams from a ProviderFilters object.
// Used by both listProviders and countProviders so params never drift.
function buildProviderParams(filters: ProviderFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.stage)                       p.set("stage", filters.stage);
  if (filters.states?.length)              filters.states.forEach((s) => p.append("states", s));
  if (filters.min_score != null)           p.set("min_score", String(filters.min_score));
  if (filters.max_score != null)           p.set("max_score", String(filters.max_score));
  if (filters.tag)                         p.set("tag", filters.tag);
  if (filters.npi_type != null)            p.set("npi_type", String(filters.npi_type));
  if (filters.has_outreach != null)        p.set("has_outreach", String(filters.has_outreach));
  if (filters.practice_size)              p.set("practice_size", filters.practice_size);
  if (filters.sort_by)                     p.set("sort_by", filters.sort_by);
  if (filters.sort_dir)                    p.set("sort_dir", filters.sort_dir);
  if (filters.limit != null)               p.set("limit", String(filters.limit));
  if (filters.offset != null)              p.set("offset", String(filters.offset));
  return p;
}

export function fetchProviders(
  states: string[],
  limit = 200,
): Promise<{ fetched: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  states.forEach((s) => params.append("states", s));
  return request(`/providers/fetch?${params}`, { method: "POST" });
}

export function listProviders(filters: ProviderFilters = {}): Promise<Provider[]> {
  const params = buildProviderParams(filters);
  return request(`/providers/?${params}`);
}

export function countProviders(filters: ProviderFilters = {}): Promise<{ total: number }> {
  // strip list-only params before sending to count endpoint
  const { sort_by: _s, sort_dir: _d, limit: _l, offset: _o, ...countFilters } = filters;
  const params = buildProviderParams(countFilters);
  return request(`/providers/count?${params}`);
}

export function getProvider(id: number): Promise<Provider> {
  return request(`/providers/${id}`);
}

export function updateProvider(id: number, updates: ProviderUpdate): Promise<Provider> {
  return request(`/providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteProvider(id: number): Promise<{ deleted: number }> {
  return request(`/providers/${id}`, { method: "DELETE" });
}


// -- Pipeline --

export function getPipelineSummary(): Promise<PipelineSummary[]> {
  return request("/pipeline/summary");
}

export function getFunnelMetrics(): Promise<FunnelMetrics[]> {
  return request("/pipeline/funnel");
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return request("/pipeline/dashboard");
}

export function getTimeToActivate(): Promise<TimeToActivate> {
  return request("/pipeline/time-to-activate");
}

export function getOutreachFreshness(): Promise<OutreachFreshness> {
  return request("/pipeline/outreach-freshness");
}


// -- Workflows --

export function runWorkflows(): Promise<WorkflowRunResult> {
  return request("/workflows/run", { method: "POST" });
}

export function listWorkflowEvents(filters?: {
  provider_npi?: string;
  rule_name?: string;
  limit?: number;
}): Promise<WorkflowEvent[]> {
  const params = new URLSearchParams();
  if (filters?.provider_npi) params.set("provider_npi", filters.provider_npi);
  if (filters?.rule_name)    params.set("rule_name", filters.rule_name);
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  return request(`/workflows/events?${params}`);
}

export function getWorkflowEventsSummary(): Promise<Record<string, number>> {
  return request("/workflows/events/summary");
}


// -- AI --

export function getOutreachStreamUrl(providerId: number): string {
  return `${BASE_URL}/ai/outreach/${providerId}`;
}

export function saveOutreachCopy(
  providerId: number,
  copy: string,
): Promise<{ saved: boolean }> {
  return request(`/ai/outreach/${providerId}/save`, {
    method: "POST",
    body: JSON.stringify({ copy }),
  });
}