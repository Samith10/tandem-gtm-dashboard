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

export function fetchProviders(
  states: string[],
  limit = 200
): Promise<{ fetched: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  states.forEach((s) => params.append("states", s));
  return request(`/providers/fetch?${params}`, { method: "POST" });
}

export function listProviders(filters?: {
  stage?: PipelineStage;
  state?: string;
  min_score?: number;
  max_score?: number;
  tag?: string;
  limit?: number;
  offset?: number;
}): Promise<Provider[]> {
  const params = new URLSearchParams();
  if (filters?.stage) params.set("stage", filters.stage);
  if (filters?.state) params.set("state", filters.state);
  if (filters?.min_score != null) params.set("min_score", String(filters.min_score));
  if (filters?.max_score != null) params.set("max_score", String(filters.max_score));
  if (filters?.tag) params.set("tag", filters.tag);
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  if (filters?.offset != null) params.set("offset", String(filters.offset));
  return request(`/providers/?${params}`);
}

export function countProviders(filters?: {
  stage?: PipelineStage;
  min_score?: number;
}): Promise<{ total: number }> {
  const params = new URLSearchParams();
  if (filters?.stage) params.set("stage", filters.stage);
  if (filters?.min_score != null) params.set("min_score", String(filters.min_score));
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
  if (filters?.rule_name) params.set("rule_name", filters.rule_name);
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
  copy: string
): Promise<{ saved: boolean }> {
  return request(`/ai/outreach/${providerId}/save`, {
    method: "POST",
    body: JSON.stringify({ copy }),
  });
}