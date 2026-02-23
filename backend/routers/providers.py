from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlmodel import Session, select, func, col, case
from datetime import datetime, timezone

from database import get_session
from models import Provider, ProviderRead, ProviderUpdate, PipelineStage
from services.npi import fetch_and_store_providers, DEFAULT_STATES
from services.hubspot import sync_contact

router = APIRouter()

# Valid sort columns and their corresponding Provider fields
SORT_FIELDS = {
    "score":          Provider.icp_score,
    "discovered_at":  Provider.discovered_at,
    "last_stage_change": Provider.last_stage_change,
    "last_outreach_at":  Provider.last_outreach_at,
    "name":           None,  # handled separately -- coalesce org/last name
}

# Practice size bucket -> provider_count_at_address ranges
PRACTICE_SIZE_RANGES = {
    "solo":  (1, 1),
    "small": (2, 3),
    "group": (4, None),
}


def _apply_filters(
    statement,
    stage: Optional[PipelineStage],
    states: Optional[List[str]],
    min_score: Optional[int],
    max_score: Optional[int],
    tag: Optional[str],
    npi_type: Optional[int],
    has_outreach: Optional[bool],
    practice_size: Optional[str],
):
    """Apply all shared filter conditions to a SQLModel select statement."""
    if stage:
        statement = statement.where(Provider.stage == stage)

    if states:
        upper = [s.upper() for s in states]
        statement = statement.where(col(Provider.state).in_(upper))

    if min_score is not None:
        statement = statement.where(Provider.icp_score >= min_score)
    if max_score is not None:
        statement = statement.where(Provider.icp_score <= max_score)

    if tag:
        statement = statement.where(col(Provider.workflow_tags).contains(tag))

    if npi_type is not None:
        statement = statement.where(Provider.npi_type == npi_type)

    if has_outreach is True:
        statement = statement.where(Provider.last_outreach_at.isnot(None))
    elif has_outreach is False:
        statement = statement.where(Provider.last_outreach_at.is_(None))

    if practice_size and practice_size in PRACTICE_SIZE_RANGES:
        lo, hi = PRACTICE_SIZE_RANGES[practice_size]
        statement = statement.where(Provider.provider_count_at_address >= lo)
        if hi is not None:
            statement = statement.where(Provider.provider_count_at_address <= hi)

    return statement


def _apply_sort(
    statement,
    sort_by: str,
    sort_dir: str,
):
    """Apply ORDER BY to a list statement. Nulls always sort last."""
    asc = sort_dir == "asc"

    if sort_by == "name":
        # Coalesce organization_name and last_name so both NPI types sort sensibly
        name_col = func.coalesce(Provider.organization_name, Provider.last_name, "")
        statement = statement.order_by(
            name_col.asc() if asc else name_col.desc()
        )
        return statement

    field = SORT_FIELDS.get(sort_by, Provider.icp_score)

    if sort_by == "last_outreach_at":
        # Nulls last in both directions
        null_last = Provider.last_outreach_at.is_(None)
        if asc:
            statement = statement.order_by(null_last, field.asc())
        else:
            statement = statement.order_by(null_last, field.desc())
        return statement

    statement = statement.order_by(field.asc() if asc else field.desc())
    return statement


@router.post("/fetch", response_model=dict)
def fetch_providers(
    background: BackgroundTasks,
    states: Optional[List[str]] = Query(default=None),
    taxonomy_description: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=200),
    session: Session = Depends(get_session),
):
    """
    Pull providers from the NPI registry and store them.
    Pass states= for specific states, or omit for all defaults.
    Safe to call repeatedly -- existing providers are not overwritten.
    """
    resolved_states = [s.upper() for s in states] if states else DEFAULT_STATES
    providers = fetch_and_store_providers(
        session=session,
        states=resolved_states,
        taxonomy_description=taxonomy_description,
        limit=limit,
    )
    # Sync new providers to HubSpot in the background -- never blocks fetch
    def _sync_all():
        for p in providers:
            sync_contact(p)

    background.add_task(_sync_all)

    return {"fetched": len(providers)}


@router.get("/count", response_model=dict)
def count_providers(
    stage: Optional[PipelineStage] = Query(default=None),
    states: Optional[List[str]] = Query(default=None),
    min_score: Optional[int] = Query(default=None, ge=0, le=100),
    max_score: Optional[int] = Query(default=None, ge=0, le=100),
    tag: Optional[str] = Query(default=None),
    npi_type: Optional[int] = Query(default=None),
    has_outreach: Optional[bool] = Query(default=None),
    practice_size: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
):
    """Return total provider count matching filters -- used for pagination."""
    statement = select(func.count(Provider.id))
    statement = _apply_filters(
        statement, stage, states, min_score, max_score,
        tag, npi_type, has_outreach, practice_size,
    )
    total = session.exec(statement).one()
    return {"total": total or 0}


@router.get("/", response_model=list[ProviderRead])
def list_providers(
    stage: Optional[PipelineStage] = Query(default=None),
    states: Optional[List[str]] = Query(default=None),
    min_score: Optional[int] = Query(default=None, ge=0, le=100),
    max_score: Optional[int] = Query(default=None, ge=0, le=100),
    tag: Optional[str] = Query(default=None),
    npi_type: Optional[int] = Query(default=None),
    has_outreach: Optional[bool] = Query(default=None),
    practice_size: Optional[str] = Query(default=None),
    sort_by: str = Query(default="score"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    limit: int = Query(default=50, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    """List providers with filtering, sorting, and pagination."""
    statement = select(Provider)
    statement = _apply_filters(
        statement, stage, states, min_score, max_score,
        tag, npi_type, has_outreach, practice_size,
    )
    statement = _apply_sort(statement, sort_by, sort_dir)
    statement = statement.offset(offset).limit(limit)
    return session.exec(statement).all()


@router.get("/{provider_id}", response_model=ProviderRead)
def get_provider(provider_id: int, session: Session = Depends(get_session)):
    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@router.patch("/{provider_id}", response_model=ProviderRead)
def update_provider(
    provider_id: int,
    updates: ProviderUpdate,
    session: Session = Depends(get_session),
):
    """
    Partial update for pipeline stage, rep assignment, tags, and outreach fields.
    Updates last_stage_change automatically when stage changes.
    """
    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    update_data = updates.model_dump(exclude_unset=True)

    if "stage" in update_data and update_data["stage"] != provider.stage:
        provider.last_stage_change = datetime.now(tz=timezone.utc)

    for field, value in update_data.items():
        setattr(provider, field, value)

    session.add(provider)
    session.commit()
    session.refresh(provider)

    # Sync updated provider to HubSpot -- best-effort, never blocks update
    sync_contact(provider)

    return provider


@router.delete("/{provider_id}", response_model=dict)
def delete_provider(provider_id: int, session: Session = Depends(get_session)):
    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    session.delete(provider)
    session.commit()
    return {"deleted": provider_id}