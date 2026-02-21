from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from database import get_session
from models import Provider, ProviderRead, ProviderUpdate, PipelineStage
from services.npi import fetch_and_store_providers

router = APIRouter()


@router.post("/fetch", response_model=dict)
def fetch_providers(
    state: str = Query(default="NY", min_length=2, max_length=2),
    taxonomy_description: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
):
    """
    Pull providers from the NPI registry and store them.
    Safe to call repeatedly -- existing providers are not overwritten.
    """
    providers = fetch_and_store_providers(
        session=session,
        state=state.upper(),
        taxonomy_description=taxonomy_description,
        limit=limit,
    )
    return {"fetched": len(providers)}


@router.get("/", response_model=list[ProviderRead])
def list_providers(
    stage: Optional[PipelineStage] = Query(default=None),
    state: Optional[str] = Query(default=None),
    min_score: Optional[int] = Query(default=None, ge=0, le=100),
    max_score: Optional[int] = Query(default=None, ge=0, le=100),
    tag: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    """List providers with optional filters for stage, state, score range, and tag."""
    statement = select(Provider)

    if stage:
        statement = statement.where(Provider.stage == stage)
    if state:
        statement = statement.where(Provider.state == state.upper())
    if min_score is not None:
        statement = statement.where(Provider.icp_score >= min_score)
    if max_score is not None:
        statement = statement.where(Provider.icp_score <= max_score)
    if tag:
        # workflow_tags is comma-separated -- substring match is sufficient
        statement = statement.where(Provider.workflow_tags.contains(tag))

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

    # Track when the stage changes so staleness rules fire correctly
    if "stage" in update_data and update_data["stage"] != provider.stage:
        from datetime import datetime, timezone
        provider.last_stage_change = datetime.now(tz=timezone.utc)

    for field, value in update_data.items():
        setattr(provider, field, value)

    session.add(provider)
    session.commit()
    session.refresh(provider)
    return provider


@router.delete("/{provider_id}", response_model=dict)
def delete_provider(provider_id: int, session: Session = Depends(get_session)):
    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    session.delete(provider)
    session.commit()
    return {"deleted": provider_id}