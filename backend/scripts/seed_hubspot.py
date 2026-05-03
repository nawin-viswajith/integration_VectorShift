import os
import random
import string
import time
from typing import List, Dict

import requests
from dotenv import load_dotenv

try:
    from faker import Faker
except ImportError:
    Faker = None


API_BASE = "https://api.hubapi.com"
BATCH_SIZE = 100
load_dotenv()


def _token() -> str:
    token = os.getenv("HUBSPOT_PRIVATE_APP_TOKEN")
    if not token:
        raise RuntimeError(
            "Set HUBSPOT_PRIVATE_APP_TOKEN with write scopes before running this script."
        )
    return token


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
    }


def _safe_sleep(seconds: float = 0.25) -> None:
    time.sleep(seconds)


def _rnd(n: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def _contact_payload(idx: int, fake: Faker = None) -> Dict:
    if fake:
        first = fake.first_name()
        last = fake.last_name()
        email = f"{first.lower()}.{last.lower()}.{_rnd()}@example.com"
    else:
        first = f"Demo{idx}"
        last = "Contact"
        email = f"demo{idx}.{_rnd()}@example.com"
    return {"properties": {"firstname": first, "lastname": last, "email": email}}


def _company_payload(idx: int, fake: Faker = None) -> Dict:
    if fake:
        company = fake.company()
    else:
        company = f"Demo Company {idx} {_rnd(4)}"
    domain = f"{company.lower().replace(' ', '').replace(',', '')}.com"[:60]
    return {"properties": {"name": company, "domain": domain}}


def _deal_payload(idx: int, company_name: str = None, fake: Faker = None) -> Dict:
    amount = str(random.randint(1000, 50000))
    name_core = fake.bs().title() if fake else f"Demo Deal {idx}"
    deal_name = f"{name_core} - {company_name or 'General'}"
    return {"properties": {"dealname": deal_name[:255], "amount": amount}}


def _batch_create(object_type: str, inputs: List[Dict]) -> List[str]:
    created_ids = []
    url = f"{API_BASE}/crm/v3/objects/{object_type}/batch/create"
    for i in range(0, len(inputs), BATCH_SIZE):
        chunk = inputs[i:i + BATCH_SIZE]
        resp = requests.post(url, headers=_headers(), json={"inputs": chunk}, timeout=30)
        if resp.status_code >= 300:
            raise RuntimeError(f"{object_type} batch create failed: {resp.status_code} {resp.text}")
        data = resp.json()
        for row in data.get("results", []):
            row_id = row.get("id")
            if row_id:
                created_ids.append(row_id)
        _safe_sleep()
    return created_ids


def main():
    contacts_n = int(os.getenv("SEED_CONTACTS", "100"))
    companies_n = int(os.getenv("SEED_COMPANIES", "40"))
    deals_n = int(os.getenv("SEED_DEALS", "80"))

    fake = Faker() if Faker else None
    if fake:
        Faker.seed(42)
        random.seed(42)

    contacts = [_contact_payload(i + 1, fake) for i in range(contacts_n)]
    companies = [_company_payload(i + 1, fake) for i in range(companies_n)]

    # Create companies first so deal names can reference them.
    company_ids = _batch_create("companies", companies)
    company_names = [c["properties"]["name"] for c in companies]

    deals = []
    for i in range(deals_n):
        cname = random.choice(company_names) if company_names else None
        deals.append(_deal_payload(i + 1, cname, fake))

    contact_ids = _batch_create("contacts", contacts)
    deal_ids = _batch_create("deals", deals)

    print("Seed complete:")
    print(f"  contacts created: {len(contact_ids)}")
    print(f"  companies created: {len(company_ids)}")
    print(f"  deals created: {len(deal_ids)}")
    if not Faker:
        print("Faker not installed; used built-in random generator.")


if __name__ == "__main__":
    main()
