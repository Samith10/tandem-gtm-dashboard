from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from datetime import datetime, timezone, timedelta

from database import get_session
from models import (
    Provider,
    PipelineStage,
    PipelineSummary,
    FunnelMetrics,
    DashboardSummary,
)

router = APIRouter()

# Ordered stage list used for funnel drop-off calculations
STAGE_ORDER = [
    PipelineStage.DISCOVERED,
    PipelineStage.OUTREACH_SENT,
    PipelineStage.DEMO_BOOKED,
    PipelineStage.ACTIVATED,
]


def _stage_counts(session: Session) -> dict[PipelineStage, int]:
    """Return a count per pipeline stage as a dict."""
    rows = session.exec(
        select(Provider.stage, func.count(Provider.id)).group_by(Provider.stage)
    ).all()
    return {stage: count for stage, count in rows}


def _stage_avg_scores(session: Session) -> dict[PipelineStage, float]:
    """Return average ICP score per stage."""
    rows = session.exec(
        select(Provider.stage, func.avg(Provider.icp_score)).group_by(Provider.stage)
    ).all()
    return {stage: round(avg or 0, 1) for stage, avg in rows}


def _stale_counts(session: Session) -> dict[PipelineStage, int]:
    """Count providers per stage whose workflow_tags contains STALE."""
    rows = session.exec(
        select(Provider.stage, func.count(Provider.id))
        .where(Provider.workflow_tags.contains("STALE"))
        .group_by(Provider.stage)
    ).all()
    return {stage: count for stage, count in rows}


@router.get("/summary", response_model=list[PipelineSummary])
def pipeline_summary(session: Session = Depends(get_session)):
    """Per-stage breakdown: count, average score, stale count."""
    counts = _stage_counts(session)
    avg_scores = _stage_avg_scores(session)
    stale = _stale_counts(session)

    return [
        PipelineSummary(
            stage=stage,
            count=counts.get(stage, 0),
            avg_score=avg_scores.get(stage, 0.0),
            stale_count=stale.get(stage, 0),
        )
        for stage in STAGE_ORDER
    ]


@router.get("/funnel", response_model=list[FunnelMetrics])
def funnel_metrics(session: Session = Depends(get_session)):
    """
    Funnel drop-off rates between stages.
    Drop-off rate is the percentage lost relative to the previous stage.
    The first stage (Discovered) always has None drop-off.
    """
    counts = _stage_counts(session)

    metrics: list[FunnelMetrics] = []
    prev_count: int | None = None

    for stage in STAGE_ORDER:
        count = counts.get(stage, 0)
        if prev_count is None or prev_count == 0:
            drop_off = None
        else:
            drop_off = round((1 - count / prev_count) * 100, 1)
        metrics.append(FunnelMetrics(stage=stage, count=count, drop_off_rate=drop_off))
        prev_count = count

    return metrics


@router.get("/dashboard", response_model=DashboardSummary)
def dashboard_summary(session: Session = Depends(get_session)):
    """
    Top-level metrics for the dashboard header cards:
    total providers, avg ICP score, activated count, stale count, high priority count.
    """
    total = session.exec(select(func.count(Provider.id))).one()
    avg_score = session.exec(select(func.avg(Provider.icp_score))).one()
    activated = session.exec(
        select(func.count(Provider.id)).where(Provider.stage == PipelineStage.ACTIVATED)
    ).one()
    stale = session.exec(
        select(func.count(Provider.id)).where(Provider.workflow_tags.contains("STALE"))
    ).one()
    high_priority = session.exec(
        select(func.count(Provider.id)).where(
            Provider.workflow_tags.contains("HIGH PRIORITY")
        )
    ).one()

    pipeline_by_stage = [
        PipelineSummary(
            stage=stage,
            count=counts,
            avg_score=avgs,
            stale_count=stales,
        )
        for stage, counts, avgs, stales in [
            (
                s,
                session.exec(
                    select(func.count(Provider.id)).where(Provider.stage == s)
                ).one(),
                round(
                    session.exec(
                        select(func.avg(Provider.icp_score)).where(Provider.stage == s)
                    ).one()
                    or 0,
                    1,
                ),
                session.exec(
                    select(func.count(Provider.id)).where(
                        Provider.stage == s,
                        Provider.workflow_tags.contains("STALE"),
                    )
                ).one(),
            )
            for s in STAGE_ORDER
        ]
    ]

    return DashboardSummary(
        total_providers=total or 0,
        avg_icp_score=round(avg_score or 0, 1),
        activated_count=activated or 0,
        stale_count=stale or 0,
        high_priority_count=high_priority or 0,
        pipeline_by_stage=pipeline_by_stage,
    )


@router.get("/time-to-activate", response_model=dict)
def time_to_activate(session: Session = Depends(get_session)):
    """
    Average days from discovered_at to last_stage_change for activated providers.
    Returns null if no activated providers exist yet.
    """
    activated_providers = session.exec(
        select(Provider).where(Provider.stage == PipelineStage.ACTIVATED)
    ).all()

    if not activated_providers:
        return {"avg_days_to_activate": None, "sample_size": 0}

    def days_between(p: Provider) -> float:
        start = p.discovered_at.replace(tzinfo=timezone.utc) if p.discovered_at.tzinfo is None else p.discovered_at
        end = p.last_stage_change.replace(tzinfo=timezone.utc) if p.last_stage_change.tzinfo is None else p.last_stage_change
        return max((end - start).total_seconds() / 86400, 0)

    durations = [days_between(p) for p in activated_providers]
    avg = round(sum(durations) / len(durations), 1)

    return {"avg_days_to_activate": avg, "sample_size": len(durations)}


@router.get("/outreach-freshness", response_model=dict)
def outreach_freshness(session: Session = Depends(get_session)):
    """
    Breakdown of providers by outreach recency: fresh (<7d), aging (7-14d), stale (>14d), none.
    """
    now = datetime.now(tz=timezone.utc)

    providers_with_outreach = session.exec(
        select(Provider).where(Provider.last_outreach_at.isnot(None))
    ).all()

    fresh = aging = stale = 0
    for p in providers_with_outreach:
        last = p.last_outreach_at.replace(tzinfo=timezone.utc) if p.last_outreach_at.tzinfo is None else p.last_outreach_at
        days = (now - last).days
        if days < 7:
            fresh += 1
        elif days <= 14:
            aging += 1
        else:
            stale += 1

    no_outreach = session.exec(
        select(func.count(Provider.id)).where(Provider.last_outreach_at.is_(None))
    ).one()

    return {
        "fresh": fresh,
        "aging": aging,
        "stale": stale,
        "no_outreach": no_outreach or 0,
    }