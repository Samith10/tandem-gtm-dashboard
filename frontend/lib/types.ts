// Mirror of backend Pydantic models -- keep in sync with models.py

export type PipelineStage =
  | "Discovered"
  | "Outreach Sent"
  | "Demo Booked"
  | "Activated";

export const PIPELINE_STAGES: PipelineStage[] = [
  "Discovered",
  "Outreach Sent",
  "Demo Booked",
  "Activated",
];

export type WorkflowTag =
  | "HIGH PRIORITY"
  | "HIGH VALUE ACCOUNT"
  | "STALE"
  | "ASSIGNED"
  | "ESCALATED";

export interface Provider {
  id: number;
  npi: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  npi_type: number;
  taxonomy_description: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  enumeration_date: string | null;
  icp_score: number;
  provider_count_at_address: number;
  stage: PipelineStage;
  assigned_rep: string | null;
  workflow_tags: string;
  last_stage_change: string;
  discovered_at: string;
  last_outreach_at: string | null;
  outreach_copy: string | null;
}

export interface ProviderUpdate {
  stage?: PipelineStage;
  assigned_rep?: string;
  workflow_tags?: string;
  last_outreach_at?: string;
  outreach_copy?: string;
}

export interface PipelineSummary {
  stage: PipelineStage;
  count: number;
  avg_score: number;
  stale_count: number;
}

export interface FunnelMetrics {
  stage: PipelineStage;
  count: number;
  drop_off_rate: number | null;
}

export interface DashboardSummary {
  total_providers: number;
  avg_icp_score: number;
  activated_count: number;
  stale_count: number;
  high_priority_count: number;
  pipeline_by_stage: PipelineSummary[];
}

export interface WorkflowEvent {
  id: number;
  provider_npi: string;
  rule_name: string;
  tag_applied: string | null;
  triggered_at: string;
  detail: string | null;
}

export interface WorkflowRunResult {
  actions_taken: number;
  breakdown: Record<string, number>;
}

export interface TimeToActivate {
  avg_days_to_activate: number | null;
  sample_size: number;
}

export interface OutreachFreshness {
  fresh: number;
  aging: number;
  stale: number;
  no_outreach: number;
}