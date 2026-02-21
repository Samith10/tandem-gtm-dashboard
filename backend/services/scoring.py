from datetime import datetime, timezone
from typing import Optional

# Specialties that map to high PA burden / Tandem ICP
TARGET_SPECIALTIES = {
    "Family Medicine",
    "Internal Medicine",
    "General Practice",
    "Family Practice",
}

# States with historically high prior authorization burden
HIGH_PA_BURDEN_STATES = {"NY", "CA", "TX", "FL"}


def score_provider(
    taxonomy_description: Optional[str],
    npi_type: int,
    state: Optional[str],
    enumeration_date: Optional[str],
    provider_count_at_address: int,
) -> int:
    score = 0

    # +35: specialty match
    if taxonomy_description:
        for specialty in TARGET_SPECIALTIES:
            if specialty.lower() in taxonomy_description.lower():
                score += 35
                break

    # +25: solo or small practice
    if provider_count_at_address <= 3:
        score += 25

    # +20: high PA burden state
    if state and state.upper() in HIGH_PA_BURDEN_STATES:
        score += 20

    # +10: individual NPI (Type 1)
    if npi_type == 1:
        score += 10

    # +10: enumerated within the last 3 years
    if enumeration_date:
        try:
            enumerated = datetime.strptime(enumeration_date, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            now = datetime.now(tz=timezone.utc)
            years_since = (now - enumerated).days / 365.25
            if years_since <= 3:
                score += 10
        except ValueError:
            pass

    return min(score, 100)