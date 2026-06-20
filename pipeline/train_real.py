from __future__ import annotations

"""Train Admira's Phase 6 real-outcome model path.

Production runs load consented rows from Supabase. The ``fixture`` source is
only for local verification of the training/export contract; it is marked in
the exported report and must not be described as production evidence.
"""

import argparse
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.model_selection import train_test_split

from train_model import (
    FEATURE_DOCUMENTATION,
    FEATURE_ORDER,
    SETTINGS,
    TEST_POLICIES,
    TIERS,
    finite_float,
    logit,
    normalize_school_frame,
    parse_lever_metadata,
    raw_input_to_feature_row,
    school_base_rates,
    sigmoid,
)

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - optional for fixture/csv runs.
    create_client = None


SEED = 20260617
MODEL_TYPE = "real_outcome_v1"
VERSION = "2026.06.17-phase6"
TARGET_COVERAGE = 0.80
ALPHA = 1.0 - TARGET_COVERAGE
TIER_PRIOR_STRENGTH = 50.0
SCHOOL_PRIOR_STRENGTH = 20.0

ROOT = Path(__file__).resolve().parents[1]
SCHOOLS_CACHE_PATH = ROOT / "pipeline" / "data" / "schools_public_cache.csv"
PUBLIC_ARTIFACT_PATH = ROOT / "lib" / "model" / "artifacts.json"
REAL_ARTIFACT_PATH = ROOT / "lib" / "model" / "artifacts.real.json"
REAL_TEST_VECTOR_PATH = ROOT / "lib" / "model" / "test_vectors.real.json"
ACTIVE_ARTIFACT_PATH = ROOT / "lib" / "model" / "artifacts.json"
ACTIVE_TEST_VECTOR_PATH = ROOT / "lib" / "model" / "test_vectors.json"
REPORT_DIR = ROOT / "pipeline" / "reports"
REAL_REPORT_JSON = REPORT_DIR / "real_calibration.json"
REAL_REPORT_MD = REPORT_DIR / "real_calibration_report.md"
LEVERS_PATH = ROOT / "lib" / "levers.ts"


@dataclass(frozen=True)
class SplitData:
    frame: pd.DataFrame
    x_raw: np.ndarray
    x_scaled: np.ndarray
    y: np.ndarray


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train Admira's consented real-outcome model path."
    )
    parser.add_argument(
        "--source",
        choices=["supabase", "csv", "fixture"],
        default="supabase",
        help="Production uses Supabase; csv/fixture are for audited local runs.",
    )
    parser.add_argument(
        "--outcomes-csv",
        help="Joined real-outcome CSV used only with --source csv.",
    )
    parser.add_argument(
        "--schools-csv",
        default=str(SCHOOLS_CACHE_PATH),
        help="Public schools CSV used for csv/fixture joins.",
    )
    parser.add_argument(
        "--export-active",
        action="store_true",
        help="Overwrite artifacts.json and test_vectors.json. Default writes .real files.",
    )
    parser.add_argument(
        "--allow-small-data",
        action="store_true",
        help="Allow fitting below the production minimum. Intended for local audits only.",
    )
    return parser.parse_args()


def load_schools(path: Path) -> pd.DataFrame:
    return normalize_school_frame(pd.read_csv(path))


def load_schools_from_supabase() -> pd.DataFrame:
    if create_client is None:
      raise RuntimeError("supabase is not installed; use --source fixture or csv")
    load_dotenv()
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    client = create_client(supabase_url, service_role_key)
    response = (
        client.table("schools")
        .select(
            "unitid,name,state,setting,size,admit_rate,sat_25,sat_75,act_25,act_75,"
            "gpa_avg,test_policy,ed_admit_rate,rd_admit_rate,c7_factors,selectivity_tier"
        )
        .execute()
    )
    return normalize_school_frame(pd.DataFrame(response.data))


def load_real_from_supabase() -> pd.DataFrame:
    if create_client is None:
        raise RuntimeError("supabase is not installed; use --source fixture or csv")
    load_dotenv()
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    client = create_client(supabase_url, service_role_key)

    profiles = pd.DataFrame(client.table("applicant_profiles").select("*").execute().data)
    outcomes = pd.DataFrame(client.table("application_outcomes").select("*").execute().data)
    schools = load_schools_from_supabase()

    if profiles.empty or outcomes.empty:
        return pd.DataFrame()

    joined = outcomes.merge(
        profiles,
        left_on=["profile_id", "subject_id", "consent_record_id"],
        right_on=["id", "subject_id", "consent_record_id"],
        suffixes=("_outcome", "_profile"),
    )
    joined = joined.merge(schools, on="unitid", how="inner", suffixes=("", "_school"))
    return normalize_joined_outcomes(joined, source_label="supabase")


def load_real_from_csv(path: Path, schools: pd.DataFrame) -> pd.DataFrame:
    frame = pd.read_csv(path)
    if "selectivity_tier" not in frame.columns:
        frame = frame.merge(schools, on="unitid", how="inner", suffixes=("", "_school"))
    return normalize_joined_outcomes(frame, source_label="csv")


def build_fixture_outcomes(schools: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    rows: list[dict[str, Any]] = []
    schools_by_tier = {
        tier: schools[schools["selectivity_tier"] == tier].head(10)
        for tier in TIERS
    }

    for tier, tier_schools in schools_by_tier.items():
        for school in tier_schools.itertuples(index=False):
            admit_rate = float(school.admit_rate)
            for index in range(14):
                strength = float(rng.normal(0.0, 0.95))
                sat = None
                act = None
                if finite_float(school.sat_25) is not None and finite_float(school.sat_75) is not None:
                    sat_mid = (float(school.sat_25) + float(school.sat_75)) / 2
                    sat = int(np.clip(sat_mid + strength * 55 + rng.normal(0, 35), 400, 1600))
                if finite_float(school.act_25) is not None and finite_float(school.act_75) is not None:
                    act_mid = (float(school.act_25) + float(school.act_75)) / 2
                    act = int(np.clip(round(act_mid + strength * 1.9 + rng.normal(0, 1.1)), 1, 36))

                gpa = round(float(np.clip(3.55 + strength * 0.18 + rng.normal(0, 0.09), 2.2, 4.0)), 2)
                applying_early = index % 5 == 0
                score = (
                    logit(admit_rate)
                    + 0.42 * strength
                    + (0.16 if applying_early else 0.0)
                    + rng.normal(0, 0.35)
                )
                probability = float(sigmoid(score))
                admitted = rng.random() < probability
                rows.append(
                    {
                        "subject_id": f"00000000-0000-0000-0000-{len(rows) + 1:012d}",
                        "consent_record_id": f"10000000-0000-0000-0000-{len(rows) + 1:012d}",
                        "profile_id": f"20000000-0000-0000-0000-{len(rows) + 1:012d}",
                        "unitid": int(school.unitid),
                        "school_name": school.name,
                        "selectivity_tier": tier,
                        "test_policy": school.test_policy,
                        "setting": school.setting,
                        "school_size": finite_float(school.size),
                        "admit_rate": admit_rate,
                        "sat_25": finite_float(school.sat_25),
                        "sat_75": finite_float(school.sat_75),
                        "act_25": finite_float(school.act_25),
                        "act_75": finite_float(school.act_75),
                        "gpa_avg": finite_float(school.gpa_avg),
                        "sat_score": sat,
                        "act_score": act,
                        "gpa": gpa,
                        "test_submitted": sat is not None or act is not None,
                        "application_round": "early" if applying_early else "regular",
                        "cycle_year": 2026,
                        "outcome": "admitted" if admitted else "denied",
                        "source_label": "fixture",
                    }
                )

    return pd.DataFrame(rows)


def normalize_joined_outcomes(frame: pd.DataFrame, source_label: str) -> pd.DataFrame:
    required = {
        "unitid",
        "outcome",
        "cycle_year",
        "gpa",
        "application_round",
        "selectivity_tier",
        "test_policy",
        "setting",
    }
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Real outcome data missing columns: {sorted(missing)}")

    normalized = frame.copy()
    for column in [
        "unitid",
        "cycle_year",
        "gpa",
        "sat_score",
        "act_score",
        "sat_25",
        "sat_75",
        "act_25",
        "act_75",
        "gpa_avg",
        "size",
        "school_size",
    ]:
        if column in normalized.columns:
            normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

    if "school_size" not in normalized.columns:
        normalized["school_size"] = normalized.get("size")

    normalized["admitted"] = normalized["outcome"].eq("admitted").astype(int)
    normalized["source_label"] = source_label
    normalized["test_submitted"] = normalized.get("test_submitted", True)
    normalized["application_round"] = normalized["application_round"].where(
        normalized["application_round"].isin(["regular", "early"]),
        "regular",
    )
    normalized["selectivity_tier"] = normalized["selectivity_tier"].where(
        normalized["selectivity_tier"].isin(TIERS),
        "accessible",
    )
    normalized["test_policy"] = normalized["test_policy"].where(
        normalized["test_policy"].isin(TEST_POLICIES),
        "unknown",
    )
    normalized["setting"] = normalized["setting"].where(
        normalized["setting"].isin(SETTINGS),
        "unknown",
    )
    return normalized.reset_index(drop=True)


def feature_row_from_joined(row: pd.Series) -> dict[str, float]:
    test_submitted = bool(row.get("test_submitted", True))
    school = pd.Series(
        {
            "sat_25": row.get("sat_25"),
            "sat_75": row.get("sat_75"),
            "act_25": row.get("act_25"),
            "act_75": row.get("act_75"),
            "gpa_avg": row.get("gpa_avg"),
            "size": row.get("school_size"),
            "selectivity_tier": row.get("selectivity_tier"),
            "test_policy": row.get("test_policy"),
            "setting": row.get("setting"),
        }
    )
    return raw_input_to_feature_row(
        school,
        finite_float(row.get("sat_score")) if test_submitted else None,
        finite_float(row.get("act_score")) if test_submitted else None,
        finite_float(row.get("gpa")),
        row.get("application_round") == "early",
    )


def build_feature_matrix(frame: pd.DataFrame) -> np.ndarray:
    rows = [feature_row_from_joined(row) for _, row in frame.iterrows()]
    return np.asarray(
        [[row[feature] for feature in FEATURE_ORDER] for row in rows],
        dtype=float,
    )


def stratify_or_none(frame: pd.DataFrame) -> pd.Series | None:
    labels = frame["selectivity_tier"].astype(str) + "-" + frame["admitted"].astype(str)
    return labels if labels.value_counts().min() >= 2 else None


def split_data(frame: pd.DataFrame) -> tuple[SplitData, SplitData, SplitData, SplitData]:
    train_frame, temp_frame = train_test_split(
        frame,
        test_size=0.40,
        random_state=SEED,
        stratify=stratify_or_none(frame),
    )
    iso_frame, temp_frame = train_test_split(
        temp_frame,
        test_size=0.50,
        random_state=SEED + 1,
        stratify=stratify_or_none(temp_frame),
    )
    conformal_frame, test_frame = train_test_split(
        temp_frame,
        test_size=0.50,
        random_state=SEED + 2,
        stratify=stratify_or_none(temp_frame),
    )

    train_x_raw = build_feature_matrix(train_frame)
    means = train_x_raw.mean(axis=0)
    scales = np.where(train_x_raw.std(axis=0) < 1e-8, 1.0, train_x_raw.std(axis=0))

    def pack(part: pd.DataFrame) -> SplitData:
        x_raw = build_feature_matrix(part)
        x_scaled = (x_raw - means) / scales
        return SplitData(
            frame=part.reset_index(drop=True),
            x_raw=x_raw,
            x_scaled=x_scaled,
            y=part["admitted"].to_numpy(dtype=int),
        )

    return pack(train_frame), pack(iso_frame), pack(conformal_frame), pack(test_frame)


def fit_global_model(train: SplitData) -> LogisticRegression:
    model = LogisticRegression(
        C=0.75,
        class_weight="balanced",
        max_iter=1000,
        penalty="l2",
        random_state=SEED,
        solver="lbfgs",
    )
    model.fit(train.x_scaled, train.y)
    return model


def predict_global_logit(model: LogisticRegression, x_scaled: np.ndarray) -> np.ndarray:
    return model.decision_function(x_scaled)


def pooled_offsets(train: SplitData, model: LogisticRegression) -> dict[str, Any]:
    global_rate = float(np.clip(train.y.mean(), 1e-4, 1 - 1e-4))
    base_logit = logit(global_rate)
    frame = train.frame.copy()
    frame["global_logit"] = predict_global_logit(model, train.x_scaled)

    tier_offsets: dict[str, dict[str, float | int]] = {}
    tier_rates: dict[str, float] = {}
    for tier in TIERS:
        tier_frame = frame[frame["selectivity_tier"] == tier]
        successes = int(tier_frame["admitted"].sum())
        events = int(len(tier_frame))
        pooled_rate = (successes + global_rate * TIER_PRIOR_STRENGTH) / (
            events + TIER_PRIOR_STRENGTH
        )
        pooled_rate = float(np.clip(pooled_rate, 1e-4, 1 - 1e-4))
        tier_rates[tier] = pooled_rate
        tier_offsets[tier] = {
            "events": events,
            "offset": round(logit(pooled_rate) - base_logit, 12),
            "shrinkage": round(events / (events + TIER_PRIOR_STRENGTH), 8),
        }

    school_offsets: dict[str, dict[str, float | int]] = {}
    for unitid, school_frame in frame.groupby("unitid"):
        tier = str(school_frame["selectivity_tier"].iloc[0])
        prior_rate = tier_rates.get(tier, global_rate)
        successes = int(school_frame["admitted"].sum())
        events = int(len(school_frame))
        pooled_rate = (successes + prior_rate * SCHOOL_PRIOR_STRENGTH) / (
            events + SCHOOL_PRIOR_STRENGTH
        )
        pooled_rate = float(np.clip(pooled_rate, 1e-4, 1 - 1e-4))
        school_offsets[str(int(unitid))] = {
            "events": events,
            "offset": round(logit(pooled_rate) - logit(prior_rate), 12),
            "shrinkage": round(events / (events + SCHOOL_PRIOR_STRENGTH), 8),
        }

    return {
        "method": "empirical_bayes_logistic_partial_pooling",
        "tier_prior_strength": TIER_PRIOR_STRENGTH,
        "school_prior_strength": SCHOOL_PRIOR_STRENGTH,
        "minimum_events_per_predictor_guidance": "10-20",
        "tier": tier_offsets,
        "school": school_offsets,
    }


def offset_vector(frame: pd.DataFrame, offsets: dict[str, Any]) -> np.ndarray:
    values: list[float] = []
    for row in frame.itertuples(index=False):
        tier = getattr(row, "selectivity_tier")
        unitid = str(int(getattr(row, "unitid")))
        values.append(
            float(offsets["tier"].get(tier, {}).get("offset", 0.0))
            + float(offsets["school"].get(unitid, {}).get("offset", 0.0))
        )
    return np.asarray(values, dtype=float)


def fit_isotonic(
    model: LogisticRegression,
    iso: SplitData,
    offsets: dict[str, Any],
) -> IsotonicRegression:
    raw = sigmoid(predict_global_logit(model, iso.x_scaled) + offset_vector(iso.frame, offsets))
    isotonic = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    isotonic.fit(raw, iso.y)
    return isotonic


def predict_calibrated(
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    split: SplitData,
    offsets: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray]:
    raw = sigmoid(
        predict_global_logit(model, split.x_scaled) + offset_vector(split.frame, offsets)
    )
    return raw, np.clip(isotonic.predict(raw), 0.0, 1.0)


def conformal_half_widths(
    conformal: SplitData,
    probabilities: np.ndarray,
) -> dict[str, dict[str, float | int]]:
    residuals = np.abs(conformal.y - probabilities)
    global_quantile = float(np.quantile(residuals, TARGET_COVERAGE))
    result: dict[str, dict[str, float | int]] = {}

    for tier in TIERS:
        mask = conformal.frame["selectivity_tier"].to_numpy() == tier
        tier_residuals = residuals[mask]
        raw_width = (
            float(np.quantile(tier_residuals, TARGET_COVERAGE))
            if len(tier_residuals) >= 10
            else global_quantile
        )
        half_width = min(max(raw_width, 0.02), 0.5)
        result[tier] = {
            "mapie_residual_quantile": round(raw_width, 8),
            "interval_half_width": round(half_width, 8),
            "minimum_public_prior_floor": 0.0,
            "calibration_examples": int(len(tier_residuals)),
        }

    return result


def apply_intervals(
    probabilities: np.ndarray,
    tiers: pd.Series,
    conformal_by_tier: dict[str, dict[str, float | int]],
) -> tuple[np.ndarray, np.ndarray]:
    lows = np.zeros_like(probabilities, dtype=float)
    highs = np.zeros_like(probabilities, dtype=float)
    for index, probability in enumerate(probabilities):
        tier = str(tiers.iloc[index])
        half_width = float(conformal_by_tier[tier]["interval_half_width"])
        lows[index] = max(0.0, probability - half_width)
        highs[index] = min(1.0, probability + half_width)
    return lows, highs


def calibration_by_bin(probabilities: np.ndarray, y: np.ndarray) -> list[dict[str, Any]]:
    frame = pd.DataFrame({"predicted": probabilities, "admitted": y})
    frame["bin"] = pd.cut(
        frame["predicted"],
        bins=np.linspace(0, 1, 11),
        include_lowest=True,
        duplicates="drop",
    )
    rows: list[dict[str, Any]] = []
    for interval, group in frame.groupby("bin", observed=False):
        if group.empty:
            continue
        rows.append(
            {
                "bin": f"{max(0.0, float(interval.left)):.2f}-{float(interval.right):.2f}",
                "mean_predicted": round(float(group["predicted"].mean()), 6),
                "admitted_count": int(group["admitted"].sum()),
                "outcome_count": int(len(group)),
            }
        )
    return rows


def calibration_by_tier(
    test_frame: pd.DataFrame,
    probabilities: np.ndarray,
    y: np.ndarray,
) -> list[dict[str, Any]]:
    frame = test_frame.copy()
    frame["predicted"] = probabilities
    frame["admitted"] = y
    rows: list[dict[str, Any]] = []
    for tier in TIERS:
        group = frame[frame["selectivity_tier"] == tier]
        if group.empty:
            rows.append(
                {
                    "tier": tier,
                    "mean_predicted": None,
                    "admitted_count": 0,
                    "outcome_count": 0,
                }
            )
            continue
        rows.append(
            {
                "tier": tier,
                "mean_predicted": round(float(group["predicted"].mean()), 6),
                "admitted_count": int(group["admitted"].sum()),
                "outcome_count": int(len(group)),
            }
        )
    return rows


def interval_comparison(
    test_frame: pd.DataFrame,
    interval_widths: np.ndarray,
    conformal_by_tier: dict[str, dict[str, float | int]],
) -> list[dict[str, Any]]:
    public_artifact = json.loads(PUBLIC_ARTIFACT_PATH.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    for tier in TIERS:
        group_widths = interval_widths[test_frame["selectivity_tier"].to_numpy() == tier]
        real_width = float(group_widths.mean()) if len(group_widths) else None
        public_half = public_artifact["conformal_parameters"]["by_tier"][tier][
            "interval_half_width"
        ]
        rows.append(
            {
                "tier": tier,
                "outcome_count": int((test_frame["selectivity_tier"] == tier).sum()),
                "real_mean_interval_width": None
                if real_width is None
                else round(real_width, 6),
                "real_half_width": conformal_by_tier[tier]["interval_half_width"],
                "phase2_prior_interval_width": round(float(public_half) * 2, 6),
            }
        )
    return rows


def change_course_recommendation(comparison: list[dict[str, Any]]) -> dict[str, Any]:
    top_tiers = [
        row
        for row in comparison
        if row["tier"] in {"elite", "highly_selective"}
        and row["real_mean_interval_width"] is not None
    ]
    if not top_tiers:
        return {
            "status": "insufficient_top_tier_outcomes",
            "recommendation": "Keep the transparent public prior as fallback until consented top-tier outcomes exist.",
        }

    near_full_width = all(float(row["real_mean_interval_width"]) >= 0.90 for row in top_tiers)
    if near_full_width:
        return {
            "status": "top_tier_uncertainty_remains_near_full_range",
            "recommendation": "Pivot messaging to fit plus honest ranges; do not claim proprietary precision at sub-20 schools.",
        }

    return {
        "status": "top_tier_intervals_narrowed_in_heldout_data",
        "recommendation": "Real outcomes narrow some uncertainty, but keep range-first disclosure and monitor calibration before public claims.",
    }


def build_test_vectors(
    schools: pd.DataFrame,
    means: np.ndarray,
    scales: np.ndarray,
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    offsets: dict[str, Any],
    conformal_by_tier: dict[str, dict[str, float | int]],
) -> list[dict[str, Any]]:
    scenarios = [
        (166683, 1540, 35, 3.95, False),
        (243744, 1560, 35, 3.98, True),
        (110662, None, None, 3.85, False),
        (170976, 1380, 31, 3.75, False),
        (100751, 1340, 30, 3.72, True),
    ]
    schools_by_unitid = schools.set_index("unitid")
    vectors: list[dict[str, Any]] = []
    for unitid, sat, act, gpa, applying_early in scenarios:
        school = schools_by_unitid.loc[unitid]
        features = raw_input_to_feature_row(school, sat, act, gpa, applying_early)
        x_raw = np.asarray([[features[feature] for feature in FEATURE_ORDER]], dtype=float)
        x_scaled = (x_raw - means) / scales
        mini_frame = pd.DataFrame(
            [
                {
                    "unitid": unitid,
                    "selectivity_tier": school["selectivity_tier"],
                }
            ]
        )
        raw = sigmoid(predict_global_logit(model, x_scaled) + offset_vector(mini_frame, offsets))
        calibrated = float(np.clip(isotonic.predict(raw)[0], 0.0, 1.0))
        half_width = float(conformal_by_tier[school["selectivity_tier"]]["interval_half_width"])
        low = max(0.0, calibrated - half_width)
        high = min(1.0, calibrated + half_width)
        vectors.append(
            {
                "input": {
                    "unitid": int(unitid),
                    "school_name": school["name"],
                    "selectivity_tier": school["selectivity_tier"],
                    "sat_score": sat,
                    "act_score": act,
                    "gpa": gpa,
                    "application_round": "early" if applying_early else "regular",
                },
                "features": {
                    feature: round(float(features[feature]), 8)
                    for feature in FEATURE_ORDER
                },
                "output": {
                    "point_probability": round(float(raw[0]), 6),
                    "calibrated_probability": round(calibrated, 6),
                    "interval_low": round(low, 6),
                    "interval_high": round(high, 6),
                    "interval_width": round(high - low, 6),
                },
            }
        )
    return vectors


def write_artifact(
    schools: pd.DataFrame,
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    means: np.ndarray,
    scales: np.ndarray,
    conformal_by_tier: dict[str, dict[str, float | int]],
    offsets: dict[str, Any],
    source_label: str,
    export_active: bool,
) -> None:
    artifact = {
        "version": f"{VERSION}-{source_label}",
        "trained_at": os.getenv("ADMIRA_TRAINED_AT", "2026-06-17T00:00:00+00:00"),
        "seed": SEED,
        "model_type": MODEL_TYPE,
        "feature_order": FEATURE_ORDER,
        "feature_documentation": FEATURE_DOCUMENTATION,
        "coefficients": [round(float(value), 12) for value in model.coef_[0]],
        "intercept": round(float(model.intercept_[0]), 12),
        "feature_means": {
            feature: round(float(value), 12)
            for feature, value in zip(FEATURE_ORDER, means, strict=True)
        },
        "feature_scales": {
            feature: round(float(value), 12)
            for feature, value in zip(FEATURE_ORDER, scales, strict=True)
        },
        "isotonic_calibration": {
            "x": [round(float(value), 12) for value in isotonic.X_thresholds_],
            "y": [round(float(value), 12) for value in isotonic.y_thresholds_],
        },
        "conformal_parameters": {
            "method": "Absolute residual conformal recalibration on held-out consented outcomes",
            "target_coverage": TARGET_COVERAGE,
            "alpha": ALPHA,
            "by_tier": conformal_by_tier,
            "note": "No synthetic public-prior floors are applied on the real-outcome path.",
        },
        "school_base_rates": school_base_rates(schools),
        "hierarchical_offsets": offsets,
        "lever_metadata": parse_lever_metadata(LEVERS_PATH),
        "honesty_label": (
            "Consented real-outcome model. Held-out calibration required before claims."
            if source_label != "fixture"
            else "Fixture-trained real-outcome pipeline artifact. Not production evidence."
        ),
    }
    REAL_ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    if export_active:
        ACTIVE_ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")


def write_reports(report: dict[str, Any]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    REAL_REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

    bin_rows = "\n".join(
        "| {bin} | {mean:.3f} | {admitted} of {count} |".format(
            bin=row["bin"],
            mean=float(row["mean_predicted"]),
            admitted=int(row["admitted_count"]),
            count=int(row["outcome_count"]),
        )
        for row in report["calibration_by_bin"]
    )
    tier_rows = "\n".join(
        "| {tier} | {count} | {mean} | {admitted} of {count} |".format(
            tier=row["tier"],
            count=int(row["outcome_count"]),
            mean="n/a"
            if row["mean_predicted"] is None
            else f"{float(row['mean_predicted']):.3f}",
            admitted=int(row["admitted_count"]),
        )
        for row in report["calibration_by_tier"]
    )
    comparison_rows = "\n".join(
        "| {tier} | {count} | {real} | {prior} |".format(
            tier=row["tier"],
            count=int(row["outcome_count"]),
            real="n/a"
            if row["real_mean_interval_width"] is None
            else f"{float(row['real_mean_interval_width']):.3f}",
            prior=f"{float(row['phase2_prior_interval_width']):.3f}",
        )
        for row in report["interval_width_comparison"]
    )

    REAL_REPORT_MD.write_text(
        f"""# Real Outcome Calibration Report

Source: `{report['source']}`  
Status: `{report['status']}`

## Outcome Counts By Tier

{json.dumps(report['outcome_counts_by_tier'], indent=2)}

## Calibration By Predicted Range

| Predicted range | Mean predicted | Observed outcomes |
|---|---:|---:|
{bin_rows}

## Calibration By Tier

| Tier | Held-out outcomes | Mean predicted | Observed outcomes |
|---|---:|---:|---:|
{tier_rows}

## Real vs Phase 2 Prior Interval Width

| Tier | Held-out outcomes | Real mean interval span | Phase 2 prior span |
|---|---:|---:|---:|
{comparison_rows}

## Change-Course Check

Status: `{report['change_course']['status']}`  
Recommendation: {report['change_course']['recommendation']}
""",
        encoding="utf-8",
    )


def write_no_data_report(source: str) -> None:
    public_artifact = json.loads(PUBLIC_ARTIFACT_PATH.read_text(encoding="utf-8"))
    comparison = [
        {
            "tier": tier,
            "outcome_count": 0,
            "real_mean_interval_width": None,
            "real_half_width": None,
            "phase2_prior_interval_width": round(
                float(public_artifact["conformal_parameters"]["by_tier"][tier]["interval_half_width"]) * 2,
                6,
            ),
        }
        for tier in TIERS
    ]
    report = {
        "status": "no_real_outcomes",
        "source": source,
        "model_type": MODEL_TYPE,
        "outcome_counts_by_tier": {tier: 0 for tier in TIERS},
        "calibration_by_bin": [],
        "calibration_by_tier": [
            {
                "tier": tier,
                "mean_predicted": None,
                "admitted_count": 0,
                "outcome_count": 0,
            }
            for tier in TIERS
        ],
        "interval_width_comparison": comparison,
        "change_course": change_course_recommendation(comparison),
    }
    write_reports(report)


def main() -> None:
    args = parse_args()
    if args.source == "fixture" and args.export_active:
        raise RuntimeError(
            "Refusing to export fixture-trained weights to the served artifacts.json. "
            "--export-active is only valid with consented supabase or csv sources."
        )
    schools = load_schools(Path(args.schools_csv))
    if args.source == "fixture":
        real = normalize_joined_outcomes(
            build_fixture_outcomes(schools),
            source_label="fixture",
        )
    elif args.source == "csv":
        if not args.outcomes_csv:
            raise RuntimeError("--outcomes-csv is required with --source csv")
        real = load_real_from_csv(Path(args.outcomes_csv), schools)
    else:
        real = load_real_from_supabase()

    if real.empty:
        write_no_data_report(args.source)
        print("No consented real outcomes available; wrote no-data calibration report.")
        return

    if ("subject_id" in real.columns and real["subject_id"].isna().any()) or (
        "consent_record_id" in real.columns and real["consent_record_id"].isna().any()
    ):
        raise RuntimeError("Every real outcome row must have subject_id and consent_record_id.")

    if real["admitted"].nunique() < 2:
        write_no_data_report(args.source)
        print("Real outcomes have only one class; wrote no-data calibration report.")
        return

    production_minimum = len(FEATURE_ORDER) * 20
    if args.source != "fixture" and not args.allow_small_data and len(real) < production_minimum:
        raise RuntimeError(
            f"Need at least {production_minimum} consented outcomes before production export; "
            f"found {len(real)}. Use --allow-small-data only for an internal audit."
        )

    train, iso, conformal, test = split_data(real)
    means = train.x_raw.mean(axis=0)
    scales = np.where(train.x_raw.std(axis=0) < 1e-8, 1.0, train.x_raw.std(axis=0))
    model = fit_global_model(train)
    offsets = pooled_offsets(train, model)
    isotonic = fit_isotonic(model, iso, offsets)
    _, conformal_probabilities = predict_calibrated(model, isotonic, conformal, offsets)
    conformal_by_tier = conformal_half_widths(conformal, conformal_probabilities)
    _, test_probabilities = predict_calibrated(model, isotonic, test, offsets)
    lows, highs = apply_intervals(
        test_probabilities,
        test.frame["selectivity_tier"],
        conformal_by_tier,
    )
    interval_widths = highs - lows
    comparison = interval_comparison(test.frame, interval_widths, conformal_by_tier)

    report = {
        "status": "fixture_contract_check" if args.source == "fixture" else "trained",
        "source": args.source,
        "model_type": MODEL_TYPE,
        "outcome_counts_by_tier": {
            tier: int((real["selectivity_tier"] == tier).sum()) for tier in TIERS
        },
        "heldout_count": int(len(test.frame)),
        "metrics": {
            "brier": round(float(brier_score_loss(test.y, test_probabilities)), 6),
            "log_loss": round(
                float(log_loss(test.y, np.clip(test_probabilities, 1e-6, 1 - 1e-6))),
                6,
            ),
        },
        "calibration_by_bin": calibration_by_bin(test_probabilities, test.y),
        "calibration_by_tier": calibration_by_tier(test.frame, test_probabilities, test.y),
        "interval_width_comparison": comparison,
        "change_course": change_course_recommendation(comparison),
    }

    vectors = build_test_vectors(
        schools,
        means,
        scales,
        model,
        isotonic,
        offsets,
        conformal_by_tier,
    )
    write_artifact(
        schools,
        model,
        isotonic,
        means,
        scales,
        conformal_by_tier,
        offsets,
        args.source,
        args.export_active,
    )
    REAL_TEST_VECTOR_PATH.write_text(json.dumps(vectors, indent=2), encoding="utf-8")
    if args.export_active:
        ACTIVE_TEST_VECTOR_PATH.write_text(json.dumps(vectors, indent=2), encoding="utf-8")
    write_reports(report)

    print("Admira Phase 6 real-outcome model trained")
    print(f"Source: {args.source}")
    print(f"Outcomes: {len(real):,}")
    print(f"Real artifact: {REAL_ARTIFACT_PATH}")
    print(f"Real test vectors: {REAL_TEST_VECTOR_PATH}")
    print(f"Calibration JSON: {REAL_REPORT_JSON}")
    print(f"Change-course recommendation: {report['change_course']['recommendation']}")


if __name__ == "__main__":
    main()
