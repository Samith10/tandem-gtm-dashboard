import httpx
from sqlmodel import Session, select
from typing import Optional

from models import Provider, PipelineStage
from services.scoring import score_provider

NPI_API_URL = "https://npiregistry.cms.hhs.gov/api/"
DEFAULT_LIMIT = 200
DEFAULT_STATES = ["NY", "CA", "TX", "FL", "IL", "PA", "NJ"]

# Specialties to query -- one request per specialty per state
TARGET_TAXONOMIES = [
    "Family Medicine",
    "Internal Medicine",
    "General Practice",
]


def _extract_taxonomy(taxonomies: list[dict]) -> tuple[Optional[str], Optional[str]]:
    """Return (code, description) for the primary taxonomy, or the first one."""
    for t in taxonomies:
        if t.get("primary"):
            return t.get("code"), t.get("desc")
    if taxonomies:
        return taxonomies[0].get("code"), taxonomies[0].get("desc")
    return None, None


def _extract_address(addresses: list[dict]) -> dict:
    """Prefer practice location address over mailing address."""
    for a in addresses:
        if a.get("address_purpose") == "LOCATION":
            return a
    return addresses[0] if addresses else {}


def _parse_provider(raw: dict) -> Optional[dict]:
    """Flatten a raw NPI API result into a dict ready for DB insertion."""
    basic = raw.get("basic", {})
    addresses = raw.get("addresses", [])
    taxonomies = raw.get("taxonomies", [])

    npi = raw.get("number")
    if not npi:
        return None

    enumeration_type = raw.get("enumeration_type", "NPI-1")
    npi_type = int(enumeration_type.replace("NPI-", ""))

    taxonomy_code, taxonomy_description = _extract_taxonomy(taxonomies)
    address = _extract_address(addresses)

    if npi_type == 2:
        first_name = basic.get("authorized_official_first_name")
        last_name = basic.get("authorized_official_last_name")
    else:
        first_name = basic.get("first_name")
        last_name = basic.get("last_name")

    return {
        "npi": npi,
        "npi_type": npi_type,
        "first_name": first_name,
        "last_name": last_name,
        "organization_name": basic.get("organization_name"),
        "taxonomy_code": taxonomy_code,
        "taxonomy_description": taxonomy_description,
        "address_line": address.get("address_1"),
        "city": address.get("city"),
        "state": address.get("state"),
        "zip_code": address.get("postal_code"),
        "phone": address.get("telephone_number"),
        "enumeration_date": basic.get("enumeration_date"),
    }


def _count_providers_at_address(
    session: Session, address_line: Optional[str], zip_code: Optional[str]
) -> int:
    """Count existing DB providers sharing the same address for practice size signal."""
    if not address_line or not zip_code:
        return 1
    statement = select(Provider).where(
        Provider.address_line == address_line,
        Provider.zip_code == zip_code,
    )
    results = session.exec(statement).all()
    return len(results) + 1


def _fetch_raw(taxonomy: str, state: str, limit: int) -> list[dict]:
    """Single NPI API request for one taxonomy + state combination."""
    params = {
        "version": "2.1",
        "taxonomy_description": taxonomy,
        "state": state,
        "limit": min(limit, 200),
        "skip": 0,
        "pretty": "false",
    }
    with httpx.Client(timeout=15.0) as client:
        response = client.get(NPI_API_URL, params=params)
        response.raise_for_status()
        data = response.json()
    return data.get("results", [])


def fetch_and_store_providers(
    session: Session,
    states: list[str] = None,
    taxonomy_description: Optional[str] = None,
    limit: int = DEFAULT_LIMIT,
) -> list[Provider]:
    """
    Fetch providers from the NPI registry, score them, and upsert into the DB.
    Queries each target taxonomy per state and merges results.
    If taxonomy_description is provided, only that taxonomy is queried.
    """
    states_to_fetch = states if states else DEFAULT_STATES
    taxonomies_to_fetch = [taxonomy_description] if taxonomy_description else TARGET_TAXONOMIES
    per_taxonomy_limit = min(limit, 200)

    seen_npis: set[str] = set()
    all_raw: list[dict] = []

    for st in states_to_fetch:
        for taxonomy in taxonomies_to_fetch:
            raw_results = _fetch_raw(taxonomy, st, per_taxonomy_limit)
            for r in raw_results:
                npi = r.get("number")
                if npi and npi not in seen_npis:
                    seen_npis.add(npi)
                    all_raw.append(r)

    saved: list[Provider] = []

    for raw in all_raw:
        parsed = _parse_provider(raw)
        if not parsed:
            continue

        existing = session.exec(
            select(Provider).where(Provider.npi == parsed["npi"])
        ).first()
        if existing:
            saved.append(existing)
            continue

        provider_count = _count_providers_at_address(
            session, parsed["address_line"], parsed["zip_code"]
        )

        icp_score = score_provider(
            taxonomy_description=parsed["taxonomy_description"],
            npi_type=parsed["npi_type"],
            state=parsed["state"],
            enumeration_date=parsed["enumeration_date"],
            provider_count_at_address=provider_count,
        )

        provider = Provider(
            **parsed,
            icp_score=icp_score,
            provider_count_at_address=provider_count,
            stage=PipelineStage.DISCOVERED,
        )

        session.add(provider)
        saved.append(provider)

    session.commit()

    for p in saved:
        session.refresh(p)

    return saved