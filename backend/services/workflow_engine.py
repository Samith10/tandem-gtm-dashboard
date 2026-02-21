from datetime import datetime, timezone, timedelta
from sqlmodel import Session, select

from models import Provider, WorkflowEvent, WorkflowTag, PipelineStage


# How long before an outreach-sent provider is considered stale
STALE_DAYS = 14

# How long a discovered provider must sit before escalation check
ESCALATION_AGE_DAYS = 7

# Rep assigned to demo-booked providers by default
DEFAULT_REP = "outbound-team"


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _make_aware(dt: datetime) -> datetime:
    """Attach UTC if the datetime has no tzinfo (SQLite stores naive datetimes)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _add_tag(provider: Provider, tag: WorkflowTag) -> bool:
    """Add tag to provider's comma-separated tag string. Returns True if tag was new."""
    existing = set(t.strip() for t in provider.workflow_tags.split(",") if t.strip())
    if tag.value in existing:
        return False
    existing.add(tag.value)
    provider.workflow_tags = ",".join(sorted(existing))
    return True


def _log_event(
    session: Session,
    provider: Provider,
    rule_name: str,
    tag: WorkflowTag | None = None,
    detail: str | None = None,
) -> None:
    event = WorkflowEvent(
        provider_npi=provider.npi,
        rule_name=rule_name,
        tag_applied=tag.value if tag else None,
        detail=detail,
    )
    session.add(event)


def run_workflow_rules(session: Session) -> dict:
    """
    Evaluate all 5 workflow rules against every provider in the DB.
    Mutates provider tags and assigned_rep in place, logs WorkflowEvents.
    Returns a summary count of actions taken per rule.
    """
    providers = session.exec(select(Provider)).all()
    now = _utcnow()

    counts = {
        "high_priority": 0,
        "high_value_account": 0,
        "stale_reengagement": 0,
        "demo_assigned": 0,
        "escalated": 0,
    }

    for p in providers:
        # -- Rule 1: score >= 80 AND stage = Discovered -> HIGH PRIORITY --
        if p.icp_score >= 80 and p.stage == PipelineStage.DISCOVERED:
            if _add_tag(p, WorkflowTag.HIGH_PRIORITY):
                counts["high_priority"] += 1
                _log_event(
                    session, p,
                    rule_name="high_priority_flag",
                    tag=WorkflowTag.HIGH_PRIORITY,
                    detail=f"Score {p.icp_score}",
                )

        # -- Rule 2: provider count at address >= 5 -> HIGH VALUE ACCOUNT --
        if p.provider_count_at_address >= 5:
            if _add_tag(p, WorkflowTag.HIGH_VALUE_ACCOUNT):
                counts["high_value_account"] += 1
                _log_event(
                    session, p,
                    rule_name="high_value_account_flag",
                    tag=WorkflowTag.HIGH_VALUE_ACCOUNT,
                    detail=f"{p.provider_count_at_address} providers at address",
                )

        # -- Rule 3: stage = Outreach Sent AND last updated > 14 days -> STALE --
        if p.stage == PipelineStage.OUTREACH_SENT:
            last_change = _make_aware(p.last_stage_change)
            if (now - last_change) > timedelta(days=STALE_DAYS):
                if _add_tag(p, WorkflowTag.STALE):
                    counts["stale_reengagement"] += 1
                    days_stale = (now - last_change).days
                    _log_event(
                        session, p,
                        rule_name="stale_reengagement",
                        tag=WorkflowTag.STALE,
                        detail=f"No activity for {days_stale} days",
                    )

        # -- Rule 4: stage = Demo Booked -> auto-assign to rep --
        if p.stage == PipelineStage.DEMO_BOOKED and not p.assigned_rep:
            p.assigned_rep = DEFAULT_REP
            counts["demo_assigned"] += 1
            _log_event(
                session, p,
                rule_name="demo_auto_assign",
                detail=f"Assigned to {DEFAULT_REP}",
            )

        # -- Rule 5: score >= 70 AND stage = Discovered AND age > 7 days -> ESCALATED --
        if p.icp_score >= 70 and p.stage == PipelineStage.DISCOVERED:
            discovered = _make_aware(p.discovered_at)
            if (now - discovered) > timedelta(days=ESCALATION_AGE_DAYS):
                if _add_tag(p, WorkflowTag.ESCALATED):
                    counts["escalated"] += 1
                    _log_event(
                        session, p,
                        rule_name="outbound_escalation",
                        tag=WorkflowTag.ESCALATED,
                        detail=f"Score {p.icp_score}, discovered {(now - discovered).days} days ago",
                    )

        session.add(p)

    session.commit()
    return counts