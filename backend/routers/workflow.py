from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select
from typing import Optional

from database import get_session
from models import WorkflowEvent, WorkflowEventRead
from services.workflow_engine import run_workflow_rules

router = APIRouter()


@router.post("/run", response_model=dict)
def run_workflows(session: Session = Depends(get_session)):
    """
    Evaluate all workflow rules against the current provider set.
    Idempotent -- safe to call repeatedly. Returns counts of actions taken.
    """
    counts = run_workflow_rules(session)
    total = sum(counts.values())
    return {"actions_taken": total, "breakdown": counts}


@router.get("/events", response_model=list[WorkflowEventRead])
def list_events(
    provider_npi: Optional[str] = Query(default=None),
    rule_name: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    """
    Return workflow event log entries, optionally filtered by provider NPI or rule name.
    Ordered newest first.
    """
    statement = select(WorkflowEvent)

    if provider_npi:
        statement = statement.where(WorkflowEvent.provider_npi == provider_npi)
    if rule_name:
        statement = statement.where(WorkflowEvent.rule_name == rule_name)

    statement = statement.order_by(WorkflowEvent.triggered_at.desc())
    statement = statement.offset(offset).limit(limit)

    return session.exec(statement).all()


@router.get("/events/summary", response_model=dict)
def events_summary(session: Session = Depends(get_session)):
    """
    Count of events fired per rule -- used to populate the workflow panel in the UI.
    """
    events = session.exec(select(WorkflowEvent)).all()

    summary: dict[str, int] = {}
    for event in events:
        summary[event.rule_name] = summary.get(event.rule_name, 0) + 1

    return summary


@router.delete("/events", response_model=dict)
def clear_events(session: Session = Depends(get_session)):
    """Clear the entire workflow event log. Useful during development."""
    events = session.exec(select(WorkflowEvent)).all()
    for e in events:
        session.delete(e)
    session.commit()
    return {"deleted": len(events)}