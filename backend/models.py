from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel


# -- Enums --

class PipelineStage(str, Enum):
    DISCOVERED = "Discovered"
    OUTREACH_SENT = "Outreach Sent"
    DEMO_BOOKED = "Demo Booked"
    ACTIVATED = "Activated"


class WorkflowTag(str, Enum):
    HIGH_PRIORITY = "HIGH PRIORITY"
    HIGH_VALUE_ACCOUNT = "HIGH VALUE ACCOUNT"
    STALE = "STALE"
    ASSIGNED = "ASSIGNED"
    ESCALATED = "ESCALATED"


# -- Provider table --

class Provider(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    # NPI registry fields
    npi: str = Field(index=True, unique=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    organization_name: Optional[str] = None
    npi_type: int = Field(description="1 = individual, 2 = organization")
    taxonomy_code: Optional[str] = None
    taxonomy_description: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    enumeration_date: Optional[str] = None  # raw string from NPI API

    # Enrichment fields
    icp_score: int = Field(default=0)
    provider_count_at_address: int = Field(default=1)

    # Pipeline fields
    stage: PipelineStage = Field(default=PipelineStage.DISCOVERED)
    assigned_rep: Optional[str] = None
    workflow_tags: str = Field(default="")  # comma-separated WorkflowTag values
    last_stage_change: datetime = Field(default_factory=datetime.utcnow)
    discovered_at: datetime = Field(default_factory=datetime.utcnow)

    # Outreach fields
    last_outreach_at: Optional[datetime] = None
    outreach_copy: Optional[str] = None


# -- Response schemas (not persisted) --

class ProviderRead(SQLModel):
    id: int
    npi: str
    first_name: Optional[str]
    last_name: Optional[str]
    organization_name: Optional[str]
    npi_type: int
    taxonomy_description: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    phone: Optional[str]
    enumeration_date: Optional[str]
    icp_score: int
    provider_count_at_address: int
    stage: PipelineStage
    assigned_rep: Optional[str]
    workflow_tags: str
    last_stage_change: datetime
    discovered_at: datetime
    last_outreach_at: Optional[datetime]
    outreach_copy: Optional[str]


class ProviderUpdate(SQLModel):
    stage: Optional[PipelineStage] = None
    assigned_rep: Optional[str] = None
    workflow_tags: Optional[str] = None
    last_outreach_at: Optional[datetime] = None
    outreach_copy: Optional[str] = None


# -- Pipeline summary schema --

class PipelineSummary(SQLModel):
    stage: PipelineStage
    count: int
    avg_score: float
    stale_count: int


# -- Workflow event log table --

class WorkflowEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    provider_npi: str = Field(index=True)
    rule_name: str
    tag_applied: Optional[str] = None
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    detail: Optional[str] = None


class WorkflowEventRead(SQLModel):
    id: int
    provider_npi: str
    rule_name: str
    tag_applied: Optional[str]
    triggered_at: datetime
    detail: Optional[str]


# -- Analytics schema --

class FunnelMetrics(SQLModel):
    stage: PipelineStage
    count: int
    drop_off_rate: Optional[float]  # percentage lost vs. previous stage


class DashboardSummary(SQLModel):
    total_providers: int
    avg_icp_score: float
    activated_count: int
    stale_count: int
    high_priority_count: int
    pipeline_by_stage: list[PipelineSummary]