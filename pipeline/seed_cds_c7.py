from __future__ import annotations

import json
import os
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
SEED_PATH = ROOT / "data" / "cds_c7_seed.json"

FACTOR_KEYS = {
    "rigor",
    "gpa",
    "test_scores",
    "essay",
    "recommendations",
    "extracurriculars",
    "talent",
    "first_generation",
    "state_residency",
    "demonstrated_interest",
}

VALID_RATINGS = {
    "Very Important",
    "Important",
    "Considered",
    "Not Considered",
}

VALID_TEST_POLICIES = {"required", "optional", "blind", "unknown"}


def chunked(values: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def validate_rate(value: Any, field_name: str, unitid: int) -> None:
    if value is None:
        return
    if not isinstance(value, (int, float)) or value < 0 or value > 1:
        raise ValueError(f"{unitid} has invalid {field_name}: {value!r}")


def load_seed_entries() -> list[dict[str, Any]]:
    with SEED_PATH.open("r", encoding="utf-8") as handle:
        entries = json.load(handle)

    if not isinstance(entries, list):
        raise ValueError("cds_c7_seed.json must contain a list")

    for entry in entries:
        unitid = entry.get("unitid")
        if not isinstance(unitid, int):
            raise ValueError(f"Invalid or missing unitid in {entry!r}")

        c7_factors = entry.get("c7_factors")
        if not isinstance(c7_factors, dict):
            raise ValueError(f"{unitid} is missing c7_factors")

        missing = FACTOR_KEYS.difference(c7_factors.keys())
        extra = set(c7_factors.keys()).difference(FACTOR_KEYS)
        if missing or extra:
            raise ValueError(
                f"{unitid} has invalid C7 keys. Missing={sorted(missing)}, "
                f"extra={sorted(extra)}"
            )

        invalid_ratings = {
            key: value
            for key, value in c7_factors.items()
            if value not in VALID_RATINGS
        }
        if invalid_ratings:
            raise ValueError(f"{unitid} has invalid C7 ratings: {invalid_ratings}")

        test_policy = entry.get("test_policy", "unknown")
        if test_policy not in VALID_TEST_POLICIES:
            raise ValueError(f"{unitid} has invalid test_policy: {test_policy!r}")

        if not entry.get("_source"):
            raise ValueError(f"{unitid} is missing _source")

        validate_rate(entry.get("ed_admit_rate"), "ed_admit_rate", unitid)
        validate_rate(entry.get("rd_admit_rate"), "rd_admit_rate", unitid)

    return entries


def main() -> None:
    load_dotenv()
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)

    entries = load_seed_entries()
    unitids = [entry["unitid"] for entry in entries]
    existing_response = (
        supabase.table("schools")
        .select("unitid,name,c7_factors")
        .in_("unitid", unitids)
        .execute()
    )
    existing_by_unitid = {row["unitid"]: row for row in existing_response.data}

    payloads: list[dict[str, Any]] = []
    missing: list[str] = []
    now = datetime.now(UTC).isoformat()

    for entry in entries:
        unitid = entry["unitid"]
        existing = existing_by_unitid.get(unitid)
        if not existing:
            missing.append(f"{unitid} {entry.get('name', '')}".strip())
            continue

        merged_c7 = {
            **(existing.get("c7_factors") or {}),
            **entry["c7_factors"],
            "_source": entry["_source"],
        }
        payloads.append(
            {
                "unitid": unitid,
                "name": existing["name"],
                "c7_factors": merged_c7,
                "test_policy": entry.get("test_policy", "unknown"),
                "ed_admit_rate": entry.get("ed_admit_rate"),
                "rd_admit_rate": entry.get("rd_admit_rate"),
                "updated_at": now,
            }
        )

    for batch in chunked(payloads, 50):
        supabase.table("schools").upsert(batch, on_conflict="unitid").execute()
        print(f"Seeded C7 data for {len(batch)} schools")

    print("\nC7 seed summary")
    print(f"Seed entries: {len(entries)}")
    print(f"Updated schools: {len(payloads)}")
    print(f"Missing schools: {len(missing)}")
    for school in missing:
        print(f"  WARNING not found after Scorecard ingest: {school}")


if __name__ == "__main__":
    main()
