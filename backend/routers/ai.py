from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from database import get_session
from models import Provider
from services.llm import get_llm

router = APIRouter()


def _build_prompt(provider: Provider) -> str:
    name = (
        provider.organization_name
        or (f"Dr. {provider.last_name}" if provider.last_name else "the practice")
    )
    contact = (
        f"{provider.first_name} {provider.last_name}".strip()
        if provider.first_name or provider.last_name
        else None
    )
    specialty = provider.taxonomy_description or "primary care"
    location = ", ".join(filter(None, [provider.city, provider.state]))
    practice_size = (
        "solo practice"
        if provider.provider_count_at_address <= 1
        else f"a practice with approximately {provider.provider_count_at_address} providers"
    )

    return f"""You are writing a short cold outreach email on behalf of Tandem, a company that helps independent medical practices spend less time on prior authorizations.

The problem Tandem solves: prior authorizations take hours of staff time every week. Doctors and their teams fill out forms, make phone calls, and wait on hold just to get treatments approved. Tandem automates that process so the practice gets that time back.

Write a 3 to 4 sentence email to the provider below. Follow these rules exactly:

- Write like a real person, not a salesperson. Short sentences. Plain words.
- Open by briefly acknowledging the reality of prior auth work for their specific specialty and practice type. Do not be dramatic about it, just factual.
- In one sentence, explain what Tandem does in plain terms. No buzzwords. No "revolutionary", "cutting edge", "streamline", "leverage", or similar words.
- End with a simple ask for a 15 minute call. No pressure. No urgency language.
- Do not use em dashes, hyphens in phrases, or bullet points.
- Do not use filler phrases like "I hope this finds you well", "I wanted to reach out", "I came across your practice", or anything similar.
- Do not make promises or use absolute language like "eliminate", "never again", "completely", "guaranteed".
- No emojis.
- Write in first person as a Tandem team member.

Provider details:
- Name: {contact or name}
- Specialty: {specialty}
- Location: {location or "not available"}
- Practice size: {practice_size}

Return only the email body. No subject line. No sign-off name. No extra commentary."""

def _stream_response(provider: Provider):
    """Yield SSE-formatted chunks from the active LLM adapter."""
    llm = get_llm()
    for chunk in llm.stream(_build_prompt(provider), max_tokens=300):
        yield f"data: {chunk}\n\n"
    yield "data: [DONE]\n\n"


@router.get("/outreach/{provider_id}")
def stream_outreach(provider_id: int, session: Session = Depends(get_session)):
    """
    Stream AI-generated outreach copy for a provider.
    Returns a text/event-stream response consumed by the frontend OutreachModal.
    Active LLM provider is controlled by the LLM_PROVIDER env var.
    """
    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    return StreamingResponse(
        _stream_response(provider),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disables Nginx buffering on Railway
        },
    )


@router.post("/outreach/{provider_id}/save", response_model=dict)
def save_outreach(
    provider_id: int,
    body: dict,
    session: Session = Depends(get_session),
):
    """
    Persist the final outreach copy and stamp last_outreach_at.
    The user may have edited the generated copy before saving.
    """
    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider.outreach_copy = body.get("copy", "").strip()
    provider.last_outreach_at = datetime.now(tz=timezone.utc)

    session.add(provider)
    session.commit()
    return {"saved": True}