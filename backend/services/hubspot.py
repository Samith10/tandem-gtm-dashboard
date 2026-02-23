"""
HubSpot contact sync service.

Syncs provider records to HubSpot contacts using the NPI number as the
unique external identifier. All calls are best-effort -- if HubSpot is
unreachable or the key is missing, the local operation continues normally.

Requires:
  HUBSPOT_API_KEY -- HubSpot private app access token (pat-na1-...)
  HUBSPOT_ENABLED -- set to "false" to disable all sync (default: true)

Custom contact properties used (must exist in HubSpot before first sync):
  npi                   -- NPI number (used as unique key)
  specialty             -- taxonomy description
  icp_score             -- 0 to 100 integer score
  practice_size         -- number of providers at address
  npi_type              -- 1 (individual) or 2 (organization)
  pipeline_stage        -- our internal stage label
"""

import logging
import os
from typing import Optional

import httpx

from models import Provider

logger = logging.getLogger(__name__)

HUBSPOT_API_BASE = "https://api.hubapi.com"
CONTACT_SEARCH_URL = f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts/search"
CONTACT_CREATE_URL = f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts"
CONTACT_UPDATE_URL = f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts/{{contact_id}}"


def _enabled() -> bool:
    return os.getenv("HUBSPOT_ENABLED", "true").lower() != "false"


def _api_key() -> Optional[str]:
    return os.getenv("HUBSPOT_API_KEY")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def _practice_size_label(count: int) -> str:
    if count <= 1:
        return "Solo (1)"
    if count <= 3:
        return "Small (2-3)"
    return "Group (4+)"


def _build_properties(provider: Provider) -> dict:
    """Build the HubSpot contact properties dict from a Provider record."""
    props: dict = {}

    # Standard HubSpot contact fields
    if provider.first_name:
        props["firstname"] = provider.first_name
    if provider.last_name:
        props["lastname"] = provider.last_name
    if provider.organization_name:
        props["company"] = provider.organization_name
    if provider.phone:
        props["phone"] = provider.phone
    if provider.city:
        props["city"] = provider.city
    if provider.state:
        props["state"] = provider.state
    if provider.zip_code:
        props["zip"] = provider.zip_code

    # Custom properties -- these must be created in HubSpot first
    props["npi"] = provider.npi
    props["icp_score"] = str(provider.icp_score)
    props["npi_type"] = "Individual" if provider.npi_type == 1 else "Organization"
    props["pipeline_stage"] = provider.stage.value
    props["practice_size"] = _practice_size_label(provider.provider_count_at_address)

    if provider.taxonomy_description:
        props["specialty"] = provider.taxonomy_description

    return props


def _find_contact_by_npi(npi: str, client: httpx.Client) -> Optional[str]:
    """Search HubSpot for an existing contact with this NPI. Returns contact ID or None."""
    payload = {
        "filterGroups": [
            {
                "filters": [
                    {
                        "propertyName": "npi",
                        "operator": "EQ",
                        "value": npi,
                    }
                ]
            }
        ],
        "properties": ["npi"],
        "limit": 1,
    }
    resp = client.post(CONTACT_SEARCH_URL, json=payload, headers=_headers())
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return results[0]["id"] if results else None


def sync_contact(provider: Provider) -> None:
    """
    Create or update a HubSpot contact for this provider.
    Uses NPI as the unique key -- safe to call repeatedly.
    Silently logs and returns on any error so the local operation is never blocked.
    """
    if not _enabled():
        return

    key = _api_key()
    if not key:
        print(f"[HubSpot] HUBSPOT_API_KEY not set -- skipping contact sync")
        return

    print(f"[HubSpot] syncing NPI {provider.npi}")

    try:
        with httpx.Client(timeout=10.0) as client:
            contact_id = _find_contact_by_npi(provider.npi, client)
            properties = _build_properties(provider)

            if contact_id:
                url = CONTACT_UPDATE_URL.format(contact_id=contact_id)
                resp = client.patch(url, json={"properties": properties}, headers=_headers())
                resp.raise_for_status()
                print(f"[HubSpot] contact updated: NPI {provider.npi} (id {contact_id})")
            else:
                resp = client.post(
                    CONTACT_CREATE_URL,
                    json={"properties": properties},
                    headers=_headers(),
                )
                resp.raise_for_status()
                new_id = resp.json().get("id")
                print(f"[HubSpot] contact created: NPI {provider.npi} (id {new_id})")

    except Exception as exc:
        print(f"[HubSpot] sync failed for NPI {provider.npi}: {exc}")