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

    return f"""You are a GTM outreach specialist at Tandem, a healthcare AI company that helps independent medical practices eliminate prior authorization burden.

Write a short, personalized cold outreach email to the following provider. The email should:
- Be 3-4 sentences maximum
- Open with a specific reference to their specialty and practice context
- Clearly state what Tandem does in one sentence (eliminate prior auth burden using AI)
- End with a single, low-friction call to action (a 15-minute call)
- Sound human, direct, and respectful of their time
- Never use hollow phrases like "I hope this email finds you well" or "I wanted to reach out"
- Never use em dashes

Provider details:
- Practice name: {name}
- Contact name: {contact or "not available"}
- Specialty: {specialty}
- Location: {location or "not available"}
- Practice size: {practice_size}
- ICP score: {provider.icp_score}/100

Return only the email body. No subject line. No sign-off name."""


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