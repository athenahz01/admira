from __future__ import annotations

import json
import math
import os
import time
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv
from supabase import create_client

SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools"
ROOT = Path(__file__).resolve().parent
SEED_PATH = ROOT / "data" / "seed_unitids.json"

SCORECARD_FIELDS = [
    "id",
    "school.name",
    "school.state",
    "school.locale",
    "latest.student.size",
    "latest.admissions.admission_rate.overall",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
]

CITY_LOCALES = {11, 12, 13}
SUBURB_LOCALES = {21, 22, 23}
TOWN_LOCALES = {31, 32, 33}
RURAL_LOCALES = {41, 42, 43}


def chunked(values: list[int], size: int) -> Iterable[list[int]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_seed_entries() -> list[dict[str, Any]]:
    with SEED_PATH.open("r", encoding="utf-8") as handle:
        raw_entries = json.load(handle)

    entries: list[dict[str, Any]] = []
    for raw_entry in raw_entries:
        if isinstance(raw_entry, int):
            entries.append({"unitid": raw_entry})
        elif isinstance(raw_entry, dict) and isinstance(raw_entry.get("unitid"), int):
            entries.append(raw_entry)
        else:
            raise ValueError(f"Invalid seed entry: {raw_entry!r}")

    unitids = [entry["unitid"] for entry in entries]
    duplicates = sorted({unitid for unitid in unitids if unitids.count(unitid) > 1})
    if duplicates:
        raise ValueError(f"Duplicate unitids in seed file: {duplicates}")

    return entries


def setting_from_locale(locale: Any) -> str | None:
    try:
        locale_code = int(locale)
    except (TypeError, ValueError):
        return None

    if locale_code in CITY_LOCALES:
        return "city"
    if locale_code in SUBURB_LOCALES:
        return "suburb"
    if locale_code in TOWN_LOCALES:
        return "town"
    if locale_code in RURAL_LOCALES:
        return "rural"
    return None


def selectivity_tier(admit_rate: float | None) -> str | None:
    if admit_rate is None:
        return None
    if admit_rate < 0.10:
        return "elite"
    if admit_rate < 0.25:
        return "highly_selective"
    if admit_rate < 0.50:
        return "selective"
    return "accessible"


def numeric_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number):
        return None
    return number


def integer_or_none(value: Any) -> int | None:
    number = numeric_or_none(value)
    if number is None:
        return None
    return int(round(number))


def sat_total(row: dict[str, Any], percentile: str) -> int | None:
    reading = integer_or_none(
        row.get(f"latest.admissions.sat_scores.{percentile}_percentile.critical_reading")
    )
    math_score = integer_or_none(
        row.get(f"latest.admissions.sat_scores.{percentile}_percentile.math")
    )
    if reading is None or math_score is None:
        return None
    return reading + math_score


def scorecard_get(
    session: requests.Session,
    params: dict[str, Any],
    retries: int = 5,
) -> dict[str, Any]:
    for attempt in range(retries):
        response = session.get(SCORECARD_URL, params=params, timeout=30)
        if response.status_code not in {429, 500, 502, 503, 504}:
            response.raise_for_status()
            return response.json()

        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            delay = float(retry_after)
        else:
            delay = min(2**attempt, 30)
        print(
            f"Scorecard returned {response.status_code}; retrying in {delay:.1f}s "
            f"(attempt {attempt + 1}/{retries})"
        )
        time.sleep(delay)

    response.raise_for_status()
    raise RuntimeError("Unreachable retry state")


def fetch_scorecard_rows(
    api_key: str,
    unitids: list[int],
    throttle_seconds: float,
) -> list[dict[str, Any]]:
    session = requests.Session()
    rows: list[dict[str, Any]] = []

    for batch_number, batch in enumerate(chunked(unitids, 80), start=1):
        page = 0
        fetched_for_batch = 0

        while True:
            params = {
                "api_key": api_key,
                "id": ",".join(str(unitid) for unitid in batch),
                "per_page": 100,
                "page": page,
                "_fields": ",".join(SCORECARD_FIELDS),
            }
            payload = scorecard_get(session, params)
            results = payload.get("results", [])
            metadata = payload.get("metadata", {})
            rows.extend(results)
            fetched_for_batch += len(results)

            total = int(metadata.get("total", len(results)))
            per_page = int(metadata.get("per_page", 100))
            print(
                f"Fetched batch {batch_number}: page {page}, "
                f"{len(results)} rows ({fetched_for_batch}/{total})"
            )

            if (page + 1) * per_page >= total:
                break
            page += 1
            time.sleep(throttle_seconds)

        time.sleep(throttle_seconds)

    return rows


def transform_scorecard_row(row: dict[str, Any]) -> dict[str, Any]:
    admit_rate = numeric_or_none(row.get("latest.admissions.admission_rate.overall"))
    now = datetime.now(UTC).isoformat()

    return {
        "unitid": int(row["id"]),
        "name": row.get("school.name") or "Unknown school",
        "state": row.get("school.state"),
        "setting": setting_from_locale(row.get("school.locale")),
        "size": integer_or_none(row.get("latest.student.size")),
        "admit_rate": admit_rate,
        "sat_25": sat_total(row, "25th"),
        "sat_75": sat_total(row, "75th"),
        "act_25": integer_or_none(
            row.get("latest.admissions.act_scores.25th_percentile.cumulative")
        ),
        "act_75": integer_or_none(
            row.get("latest.admissions.act_scores.75th_percentile.cumulative")
        ),
        "gpa_avg": None,
        "test_policy": "unknown",
        "ed_admit_rate": None,
        "rd_admit_rate": None,
        "c7_factors": {},
        "selectivity_tier": selectivity_tier(admit_rate),
        "updated_at": now,
    }


def upsert_schools(rows: list[dict[str, Any]]) -> None:
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)

    for batch in chunked(rows, 50):
        supabase.table("schools").upsert(batch, on_conflict="unitid").execute()
        print(f"Upserted {len(batch)} schools")


def print_summary(
    rows: list[dict[str, Any]],
    seed_entries: list[dict[str, Any]],
    returned_unitids: set[int],
) -> None:
    frame = pd.DataFrame(rows)
    print("\nIngestion summary")
    print(f"Seeded unitids: {len(seed_entries)}")
    print(f"Rows returned by Scorecard: {len(returned_unitids)}")
    print(f"Rows transformed/upserted: {len(rows)}")

    if not frame.empty:
        counts = frame["selectivity_tier"].fillna("missing").value_counts().to_dict()
        print("Counts per tier:")
        for tier in ["elite", "highly_selective", "selective", "accessible", "missing"]:
            print(f"  {tier}: {counts.get(tier, 0)}")

    missing_unitids = [
        entry["unitid"] for entry in seed_entries if entry["unitid"] not in returned_unitids
    ]
    if missing_unitids:
        print(f"Missing from Scorecard response: {missing_unitids}")

    expected_by_unitid = {
        entry["unitid"]: entry.get("expected_tier")
        for entry in seed_entries
        if entry.get("expected_tier")
    }
    tier_mismatches = []
    for row in rows:
        expected = expected_by_unitid.get(row["unitid"])
        if expected and expected != row["selectivity_tier"]:
            tier_mismatches.append(
                f"{row['unitid']} {row['name']}: expected {expected}, "
                f"got {row['selectivity_tier']}"
            )
    if tier_mismatches:
        print("Expected-tier mismatches:")
        for mismatch in tier_mismatches:
            print(f"  {mismatch}")

    missing_admit = [
        f"{row['unitid']} {row['name']}" for row in rows if row["admit_rate"] is None
    ]
    missing_tests = [
        f"{row['unitid']} {row['name']}"
        for row in rows
        if row["sat_25"] is None
        or row["sat_75"] is None
        or row["act_25"] is None
        or row["act_75"] is None
    ]

    print(f"Schools missing admit_rate: {len(missing_admit)}")
    for school in missing_admit:
        print(f"  {school}")

    print(f"Schools missing one or more test range fields: {len(missing_tests)}")
    for school in missing_tests:
        print(f"  {school}")


def main() -> None:
    load_dotenv()
    seed_entries = load_seed_entries()
    unitids = [entry["unitid"] for entry in seed_entries]
    api_key = require_env("SCORECARD_API_KEY")
    throttle_seconds = float(os.getenv("SCORECARD_THROTTLE_SECONDS", "0.25"))

    print(f"Loading {len(unitids)} seeded schools from Scorecard")
    raw_rows = fetch_scorecard_rows(api_key, unitids, throttle_seconds)
    returned_unitids = {int(row["id"]) for row in raw_rows}
    rows = [transform_scorecard_row(row) for row in raw_rows]

    upsert_schools(rows)
    print_summary(rows, seed_entries, returned_unitids)


if __name__ == "__main__":
    main()
