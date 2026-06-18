from __future__ import annotations

"""Train Fitty's Phase 2 public-data prior model.

This is not a real-outcome admissions model. Phase 2 has only public,
school-level facts, so the training labels are synthetic by design:

1. For each school, synthetic applicants are drawn around that school's
   published SAT/ACT middle-50% bands. Missing bands produce neutral gap
   features plus explicit missing indicators.
2. Each applicant receives an admission probability from a monotonic link:
   higher standardized position relative to the middle-50% bands increases
   admission probability; an ED/EA bump is added only when a school has
   ed_admit_rate > rd_admit_rate.
3. A per-school intercept is solved so the mean generated probability matches
   the school's published admit_rate. The sampled label is a Bernoulli draw
   from that probability.
4. Race and ethnicity are never generated, loaded, stored, or modeled.

The resulting coefficients re-encode public anchors rather than independent
learned evidence. The durable output of this phase is the plain-JSON artifact
contract, calibration machinery, and intentionally wide uncertainty ranges.
"""

import argparse
import json
import math
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from mapie.regression import MapieRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.model_selection import train_test_split

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - Supabase is optional for cached runs.
    create_client = None


SEED = 20260616
MODEL_TYPE = "public_prior_logistic_v1"
VERSION = "2026.06.16-phase2"
TRAINED_AT = os.getenv("FITTY_TRAINED_AT", "2026-06-16T00:00:00+00:00")
TARGET_COVERAGE = 0.80
ALPHA = 1.0 - TARGET_COVERAGE

ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "pipeline" / "data" / "schools_public_cache.csv"
ARTIFACT_PATH = ROOT / "lib" / "model" / "artifacts.json"
TEST_VECTOR_PATH = ROOT / "lib" / "model" / "test_vectors.json"
REPORT_DIR = ROOT / "pipeline" / "reports"
REPORT_PATH = REPORT_DIR / "calibration_report.md"
RELIABILITY_PNG = REPORT_DIR / "reliability_curve.png"
LEVERS_PATH = ROOT / "lib" / "levers.ts"

TIERS = ["accessible", "selective", "highly_selective", "elite"]
TIER_WIDTH_FLOORS = {
    "accessible": 0.11,
    "selective": 0.18,
    "highly_selective": 0.27,
    "elite": 0.46,
}
TEST_POLICIES = ["required", "optional", "blind", "unknown"]
SETTINGS = ["city", "suburb", "town", "rural", "unknown"]

FEATURE_ORDER = [
    "sat_gap",
    "sat_missing",
    "act_gap",
    "act_missing",
    "gpa_gap",
    "gpa_missing",
    "applying_early",
    "log_school_size",
    "tier_accessible",
    "tier_selective",
    "tier_highly_selective",
    "tier_elite",
    "test_policy_required",
    "test_policy_optional",
    "test_policy_blind",
    "test_policy_unknown",
    "setting_city",
    "setting_suburb",
    "setting_town",
    "setting_rural",
    "setting_unknown",
]

FEATURE_DOCUMENTATION = {
    "sat_gap": "Applicant SAT position vs. the school's SAT middle-50 midpoint, scaled by the middle-50 width.",
    "sat_missing": "1 when the school has no usable SAT middle-50 range or the applicant has no SAT value.",
    "act_gap": "Applicant ACT position vs. the school's ACT middle-50 midpoint, scaled by the middle-50 width.",
    "act_missing": "1 when the school has no usable ACT middle-50 range or the applicant has no ACT value.",
    "gpa_gap": "Applicant GPA position vs. school average GPA when available; neutral 0 when unavailable.",
    "gpa_missing": "1 when school average GPA or applicant GPA is unavailable.",
    "applying_early": "Synthetic ED/EA indicator; the label generator only bumps probability when ED/RD public rates imply an advantage.",
    "log_school_size": "Natural log of undergraduate enrollment, with zero when size is unavailable.",
    "tier_accessible": "One-hot selectivity tier from published admit_rate above 50%.",
    "tier_selective": "One-hot selectivity tier from published admit_rate between 25% and 50%.",
    "tier_highly_selective": "One-hot selectivity tier from published admit_rate between 10% and 25%.",
    "tier_elite": "One-hot selectivity tier from published admit_rate below 10%.",
    "test_policy_required": "One-hot school test policy from CDS seed/cache.",
    "test_policy_optional": "One-hot school test policy from CDS seed/cache.",
    "test_policy_blind": "One-hot school test policy from CDS seed/cache.",
    "test_policy_unknown": "One-hot school test policy from CDS seed/cache.",
    "setting_city": "One-hot Scorecard locale bucket.",
    "setting_suburb": "One-hot Scorecard locale bucket.",
    "setting_town": "One-hot Scorecard locale bucket.",
    "setting_rural": "One-hot Scorecard locale bucket.",
    "setting_unknown": "One-hot Scorecard locale bucket for missing locale.",
}


@dataclass(frozen=True)
class SplitData:
    frame: pd.DataFrame
    x_raw: np.ndarray
    x_scaled: np.ndarray
    y: np.ndarray


class CalibratedProbabilityEstimator:
    def __init__(
        self,
        model: LogisticRegression,
        isotonic: IsotonicRegression,
        feature_means: np.ndarray,
        feature_scales: np.ndarray,
    ) -> None:
        self.model = model
        self.isotonic = isotonic
        self.feature_means = feature_means
        self.feature_scales = feature_scales
        self.is_fitted_ = True

    def fit(self, x: np.ndarray, y: np.ndarray) -> "CalibratedProbabilityEstimator":
        return self

    def predict(self, x: np.ndarray) -> np.ndarray:
        x_scaled = (x - self.feature_means) / self.feature_scales
        raw = self.model.predict_proba(x_scaled)[:, 1]
        return np.clip(self.isotonic.predict(raw), 0.0, 1.0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train Fitty's synthetic public-data prior model."
    )
    parser.add_argument(
        "--schools-csv",
        default=str(CACHE_PATH),
        help="Cached public schools CSV. Used by default for clean-checkout runs.",
    )
    parser.add_argument(
        "--source",
        choices=["cache", "supabase"],
        default="cache",
        help="Load schools from the checked-in cache or from Supabase.",
    )
    parser.add_argument(
        "--applicants-per-school",
        type=int,
        default=320,
        help="Synthetic applicants generated per school.",
    )
    return parser.parse_args()


def finite_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number):
        return None
    return number


def logit(value: float) -> float:
    clipped = min(max(value, 1e-4), 1 - 1e-4)
    return math.log(clipped / (1 - clipped))


def sigmoid(value: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-value))


def solve_intercept(scores: np.ndarray, target_rate: float) -> float:
    low = -20.0
    high = 20.0
    for _ in range(80):
        midpoint = (low + high) / 2.0
        mean_probability = float(np.mean(sigmoid(midpoint + scores)))
        if mean_probability < target_rate:
            low = midpoint
        else:
            high = midpoint
    return (low + high) / 2.0


def selectivity_tier(admit_rate: float | None) -> str:
    if admit_rate is None:
        return "accessible"
    if admit_rate < 0.10:
        return "elite"
    if admit_rate < 0.25:
        return "highly_selective"
    if admit_rate < 0.50:
        return "selective"
    return "accessible"


def load_schools_from_cache(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing cached school data at {path}. Run Phase 1 ingest into "
            "Supabase and export a CSV, or use the checked-in cache."
        )
    frame = pd.read_csv(path)
    return normalize_school_frame(frame)


def load_schools_from_supabase() -> pd.DataFrame:
    load_dotenv()
    if create_client is None:
        raise RuntimeError("supabase is not installed; use --source cache instead")
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --source supabase"
        )
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


def normalize_school_frame(frame: pd.DataFrame) -> pd.DataFrame:
    required = {
        "unitid",
        "name",
        "state",
        "setting",
        "size",
        "admit_rate",
        "sat_25",
        "sat_75",
        "act_25",
        "act_75",
        "gpa_avg",
        "test_policy",
        "ed_admit_rate",
        "rd_admit_rate",
        "c7_factors",
        "selectivity_tier",
    }
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"School data is missing required columns: {sorted(missing)}")

    normalized = frame.copy()
    numeric_columns = [
        "unitid",
        "size",
        "admit_rate",
        "sat_25",
        "sat_75",
        "act_25",
        "act_75",
        "gpa_avg",
        "ed_admit_rate",
        "rd_admit_rate",
    ]
    for column in numeric_columns:
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

    normalized["unitid"] = normalized["unitid"].astype(int)
    normalized["test_policy"] = (
        normalized["test_policy"].fillna("unknown").replace("", "unknown")
    )
    normalized.loc[
        ~normalized["test_policy"].isin(TEST_POLICIES), "test_policy"
    ] = "unknown"
    normalized["setting"] = normalized["setting"].fillna("unknown").replace("", "unknown")
    normalized.loc[~normalized["setting"].isin(SETTINGS), "setting"] = "unknown"
    normalized["selectivity_tier"] = normalized.apply(
        lambda row: row["selectivity_tier"]
        if isinstance(row["selectivity_tier"], str)
        and row["selectivity_tier"] in TIERS
        else selectivity_tier(finite_float(row["admit_rate"])),
        axis=1,
    )
    normalized = normalized.dropna(subset=["admit_rate"]).reset_index(drop=True)
    return normalized


def draw_gap_from_band(
    rng: np.random.Generator,
    school_low: float | None,
    school_high: float | None,
    latent_strength: np.ndarray,
    noise_scale: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = len(latent_strength)
    if school_low is None or school_high is None or school_high <= school_low:
        return np.zeros(n), np.ones(n), np.full(n, np.nan)

    midpoint = (school_low + school_high) / 2.0
    scale = max((school_high - school_low) / 1.349, 1.0)
    score = midpoint + scale * (latent_strength + rng.normal(0.0, noise_scale, n))
    gap = (score - midpoint) / scale
    return gap, np.zeros(n), score


def generate_synthetic_applicants(
    schools: pd.DataFrame,
    applicants_per_school: int,
    seed: int,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    frames: list[pd.DataFrame] = []

    for school in schools.itertuples(index=False):
        n = applicants_per_school
        admit_rate = float(school.admit_rate)
        latent_strength = np.clip(rng.normal(0.0, 1.0, n), -2.8, 2.8)

        sat_gap, sat_missing, sat_score = draw_gap_from_band(
            rng,
            finite_float(school.sat_25),
            finite_float(school.sat_75),
            latent_strength,
            noise_scale=0.28,
        )
        act_gap, act_missing, act_score = draw_gap_from_band(
            rng,
            finite_float(school.act_25),
            finite_float(school.act_75),
            latent_strength,
            noise_scale=0.32,
        )

        gpa_avg = finite_float(school.gpa_avg)
        if gpa_avg is None:
            gpa_gap = np.zeros(n)
            gpa_missing = np.ones(n)
            gpa = np.full(n, np.nan)
        else:
            gpa = np.clip(gpa_avg + 0.28 * latent_strength + rng.normal(0.0, 0.12, n), 0, 4)
            gpa_gap = (gpa - gpa_avg) / 0.35
            gpa_missing = np.zeros(n)

        ed_rate = finite_float(school.ed_admit_rate)
        rd_rate = finite_float(school.rd_admit_rate)
        has_ed_advantage = (
            ed_rate is not None and rd_rate is not None and ed_rate > rd_rate
        )
        applying_early = rng.binomial(1, 0.16 if has_ed_advantage else 0.10, n)
        ed_bump = 0.0
        if has_ed_advantage:
            ed_bump = min(max(logit(ed_rate) - logit(rd_rate), 0.0), 1.25)

        academic_score = (
            0.58 * sat_gap * (1 - sat_missing)
            + 0.32 * act_gap * (1 - act_missing)
            + 0.10 * gpa_gap * (1 - gpa_missing)
        )
        raw_scores = academic_score + ed_bump * applying_early
        intercept = solve_intercept(raw_scores, admit_rate)
        generated_probability = np.clip(sigmoid(intercept + raw_scores), 0.0, 1.0)
        admitted = rng.binomial(1, generated_probability)

        frames.append(
            pd.DataFrame(
                {
                    "unitid": int(school.unitid),
                    "school_name": school.name,
                    "selectivity_tier": school.selectivity_tier,
                    "test_policy": school.test_policy,
                    "setting": school.setting,
                    "school_size": finite_float(school.size),
                    "published_admit_rate": admit_rate,
                    "sat_score": sat_score,
                    "act_score": act_score,
                    "gpa": gpa,
                    "sat_gap": sat_gap,
                    "sat_missing": sat_missing,
                    "act_gap": act_gap,
                    "act_missing": act_missing,
                    "gpa_gap": gpa_gap,
                    "gpa_missing": gpa_missing,
                    "applying_early": applying_early,
                    "generated_probability": generated_probability,
                    "admitted": admitted,
                }
            )
        )

    return pd.concat(frames, ignore_index=True)


def feature_row_from_values(values: dict[str, Any]) -> dict[str, float]:
    tier = values.get("selectivity_tier") or "accessible"
    test_policy = values.get("test_policy") or "unknown"
    setting = values.get("setting") or "unknown"
    size = finite_float(values.get("school_size"))

    features: dict[str, float] = {
        "sat_gap": float(values.get("sat_gap", 0.0)),
        "sat_missing": float(values.get("sat_missing", 1.0)),
        "act_gap": float(values.get("act_gap", 0.0)),
        "act_missing": float(values.get("act_missing", 1.0)),
        "gpa_gap": float(values.get("gpa_gap", 0.0)),
        "gpa_missing": float(values.get("gpa_missing", 1.0)),
        "applying_early": float(values.get("applying_early", 0.0)),
        "log_school_size": math.log1p(size) if size is not None and size > 0 else 0.0,
    }

    for known_tier in TIERS:
        features[f"tier_{known_tier}"] = 1.0 if tier == known_tier else 0.0
    for policy in TEST_POLICIES:
        features[f"test_policy_{policy}"] = 1.0 if test_policy == policy else 0.0
    for known_setting in SETTINGS:
        features[f"setting_{known_setting}"] = 1.0 if setting == known_setting else 0.0

    return features


def build_feature_matrix(frame: pd.DataFrame) -> np.ndarray:
    feature_rows = [
        feature_row_from_values(row._asdict())
        for row in frame[
            [
                "sat_gap",
                "sat_missing",
                "act_gap",
                "act_missing",
                "gpa_gap",
                "gpa_missing",
                "applying_early",
                "school_size",
                "selectivity_tier",
                "test_policy",
                "setting",
            ]
        ].itertuples(index=False)
    ]
    return np.asarray(
        [[feature_row[feature] for feature in FEATURE_ORDER] for feature_row in feature_rows],
        dtype=float,
    )


def split_data(cohort: pd.DataFrame) -> tuple[SplitData, SplitData, SplitData, SplitData]:
    train_frame, temp_frame = train_test_split(
        cohort,
        test_size=0.40,
        random_state=SEED,
        stratify=cohort["selectivity_tier"],
    )
    iso_frame, temp_frame = train_test_split(
        temp_frame,
        test_size=0.50,
        random_state=SEED + 1,
        stratify=temp_frame["selectivity_tier"],
    )
    conformal_frame, test_frame = train_test_split(
        temp_frame,
        test_size=0.50,
        random_state=SEED + 2,
        stratify=temp_frame["selectivity_tier"],
    )

    train_x_raw = build_feature_matrix(train_frame)
    means = train_x_raw.mean(axis=0)
    scales = train_x_raw.std(axis=0)
    scales = np.where(scales < 1e-8, 1.0, scales)

    def pack(frame: pd.DataFrame) -> SplitData:
        x_raw = build_feature_matrix(frame)
        x_scaled = (x_raw - means) / scales
        return SplitData(
            frame=frame.reset_index(drop=True),
            x_raw=x_raw,
            x_scaled=x_scaled,
            y=frame["admitted"].to_numpy(dtype=int),
        )

    train = pack(train_frame)
    train = SplitData(train.frame, train.x_raw, train.x_scaled, train.y)
    return train, pack(iso_frame), pack(conformal_frame), pack(test_frame)


def fit_model(train: SplitData, iso: SplitData) -> tuple[LogisticRegression, IsotonicRegression]:
    model = LogisticRegression(
        penalty="l2",
        C=0.85,
        solver="lbfgs",
        max_iter=1000,
        random_state=SEED,
    )
    model.fit(train.x_scaled, train.y)

    iso_raw = model.predict_proba(iso.x_scaled)[:, 1]
    isotonic = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    isotonic.fit(iso_raw, iso.y)
    return model, isotonic


def predict_calibrated(
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    x_scaled: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    raw = model.predict_proba(x_scaled)[:, 1]
    calibrated = np.clip(isotonic.predict(raw), 0.0, 1.0)
    return raw, calibrated


def conformal_half_widths(
    estimator: CalibratedProbabilityEstimator,
    conformal: SplitData,
) -> dict[str, dict[str, float]]:
    result: dict[str, dict[str, float]] = {}
    previous_width = 0.0
    for tier in TIERS:
        mask = conformal.frame["selectivity_tier"].to_numpy() == tier
        x_tier = conformal.x_raw[mask]
        y_tier = conformal.frame.loc[mask, "generated_probability"].to_numpy(dtype=float)
        if len(y_tier) < 20:
            raw_width = TIER_WIDTH_FLOORS[tier]
        else:
            mapie = MapieRegressor(
                estimator=estimator,
                cv="prefit",
                method="base",
                random_state=SEED,
            )
            mapie.fit(x_tier, y_tier)
            _, intervals = mapie.predict(x_tier, alpha=ALPHA)
            raw_width = float(np.median((intervals[:, 1, 0] - intervals[:, 0, 0]) / 2.0))

        half_width = max(raw_width, TIER_WIDTH_FLOORS[tier], previous_width + 0.01)
        half_width = min(half_width, 0.49)
        result[tier] = {
            "mapie_residual_quantile": round(raw_width, 8),
            "interval_half_width": round(half_width, 8),
            "minimum_public_prior_floor": TIER_WIDTH_FLOORS[tier],
            "calibration_examples": int(len(y_tier)),
        }
        previous_width = half_width

    return result


def apply_intervals(
    probabilities: np.ndarray,
    tiers: pd.Series,
    conformal_by_tier: dict[str, dict[str, float]],
) -> tuple[np.ndarray, np.ndarray]:
    lows = np.zeros_like(probabilities, dtype=float)
    highs = np.zeros_like(probabilities, dtype=float)
    for index, probability in enumerate(probabilities):
        tier = str(tiers.iloc[index])
        half_width = conformal_by_tier[tier]["interval_half_width"]
        lows[index] = max(0.0, probability - half_width)
        highs[index] = min(1.0, probability + half_width)
    return lows, highs


def reliability_bins(probabilities: np.ndarray, y: np.ndarray, bins: int = 10) -> pd.DataFrame:
    frame = pd.DataFrame({"predicted": probabilities, "observed": y})
    frame["bin"] = pd.qcut(frame["predicted"], q=bins, duplicates="drop")
    grouped = frame.groupby("bin", observed=False)
    return grouped.agg(
        mean_predicted=("predicted", "mean"),
        observed_rate=("observed", "mean"),
        bin_count=("observed", "size"),
    ).reset_index(drop=True)


def plot_reliability(reliability: pd.DataFrame) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(6.5, 5.2))
    plt.plot([0, 1], [0, 1], color="#8a8f98", linestyle="--", linewidth=1.2)
    plt.plot(
        reliability["mean_predicted"],
        reliability["observed_rate"],
        marker="o",
        color="#2563eb",
        linewidth=2,
    )
    plt.title("Synthetic public-prior reliability")
    plt.xlabel("Mean calibrated prior probability")
    plt.ylabel("Observed synthetic admit rate")
    plt.xlim(0, 1)
    plt.ylim(0, 1)
    plt.grid(True, color="#d6d9de", linewidth=0.7, alpha=0.75)
    plt.tight_layout()
    plt.savefig(RELIABILITY_PNG, dpi=160)
    plt.close()


def school_base_rates(schools: pd.DataFrame) -> dict[str, float]:
    return {
        str(int(row.unitid)): round(float(row.admit_rate), 8)
        for row in schools.itertuples(index=False)
    }


def parse_lever_metadata(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\{\s*feature:\s*"(?P<feature>[^"]+)",\s*'
        r'lever:\s*"(?P<lever>[^"]+)",\s*'
        r'label:\s*"(?P<label>[^"]+)",'
        r'(?:\s*note:\s*"(?P<note>[^"]+)",)?\s*\}',
        flags=re.DOTALL,
    )
    levers: list[dict[str, str]] = []
    for match in pattern.finditer(text):
        item = {
            "feature": match.group("feature"),
            "lever": match.group("lever"),
            "label": match.group("label"),
        }
        if match.group("note"):
            item["note"] = match.group("note")
        levers.append(item)
    if not levers:
        raise ValueError(f"Could not parse lever metadata from {path}")
    return levers


def raw_input_to_feature_row(
    school: pd.Series,
    sat_score: float | None,
    act_score: float | None,
    gpa: float | None,
    applying_early: bool,
) -> dict[str, float]:
    sat_25 = finite_float(school.get("sat_25"))
    sat_75 = finite_float(school.get("sat_75"))
    if sat_score is None or sat_25 is None or sat_75 is None or sat_75 <= sat_25:
        sat_gap = 0.0
        sat_missing = 1.0
    else:
        sat_gap = (sat_score - ((sat_25 + sat_75) / 2.0)) / max(
            (sat_75 - sat_25) / 1.349, 1.0
        )
        sat_missing = 0.0

    act_25 = finite_float(school.get("act_25"))
    act_75 = finite_float(school.get("act_75"))
    if act_score is None or act_25 is None or act_75 is None or act_75 <= act_25:
        act_gap = 0.0
        act_missing = 1.0
    else:
        act_gap = (act_score - ((act_25 + act_75) / 2.0)) / max(
            (act_75 - act_25) / 1.349, 1.0
        )
        act_missing = 0.0

    gpa_avg = finite_float(school.get("gpa_avg"))
    if gpa is None or gpa_avg is None:
        gpa_gap = 0.0
        gpa_missing = 1.0
    else:
        gpa_gap = (gpa - gpa_avg) / 0.35
        gpa_missing = 0.0

    return feature_row_from_values(
        {
            "sat_gap": sat_gap,
            "sat_missing": sat_missing,
            "act_gap": act_gap,
            "act_missing": act_missing,
            "gpa_gap": gpa_gap,
            "gpa_missing": gpa_missing,
            "applying_early": 1.0 if applying_early else 0.0,
            "school_size": finite_float(school.get("size")),
            "selectivity_tier": school.get("selectivity_tier"),
            "test_policy": school.get("test_policy"),
            "setting": school.get("setting"),
        }
    )


def predict_one(
    feature_values: dict[str, float],
    means: np.ndarray,
    scales: np.ndarray,
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    tier: str,
    conformal_by_tier: dict[str, dict[str, float]],
) -> dict[str, float]:
    x_raw = np.asarray([[feature_values[feature] for feature in FEATURE_ORDER]], dtype=float)
    x_scaled = (x_raw - means) / scales
    raw, calibrated = predict_calibrated(model, isotonic, x_scaled)
    half_width = conformal_by_tier[tier]["interval_half_width"]
    low = max(0.0, float(calibrated[0]) - half_width)
    high = min(1.0, float(calibrated[0]) + half_width)
    return {
        "point_probability": round(float(raw[0]), 6),
        "calibrated_probability": round(float(calibrated[0]), 6),
        "interval_low": round(low, 6),
        "interval_high": round(high, 6),
        "interval_width": round(high - low, 6),
    }


def build_test_vectors(
    schools: pd.DataFrame,
    means: np.ndarray,
    scales: np.ndarray,
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    conformal_by_tier: dict[str, dict[str, float]],
) -> list[dict[str, Any]]:
    scenarios = [
        (166683, 1540, 35, 3.95, False),
        (243744, 1560, 35, 3.98, True),
        (110662, None, None, 3.85, False),
        (167358, 1490, 34, 3.9, True),
        (139755, 1510, 34, 3.88, False),
        (199120, 1440, 32, 3.8, True),
        (170976, 1380, 31, 3.75, False),
        (134130, 1360, 30, 3.72, False),
        (228778, 1470, 33, 3.86, False),
        (243780, 1360, 30, 3.7, False),
        (240444, 1280, 28, 3.55, False),
        (163286, 1420, 32, 3.8, True),
        (104151, 1240, 25, 3.4, False),
        (100751, 1340, 30, 3.72, True),
        (204796, 1260, 28, 3.58, False),
    ]

    vectors: list[dict[str, Any]] = []
    schools_by_unitid = schools.set_index("unitid")
    for unitid, sat, act, gpa, applying_early in scenarios:
        school = schools_by_unitid.loc[unitid]
        features = raw_input_to_feature_row(school, sat, act, gpa, applying_early)
        output = predict_one(
            features,
            means,
            scales,
            model,
            isotonic,
            str(school["selectivity_tier"]),
            conformal_by_tier,
        )
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
                "output": output,
            }
        )
    return vectors


def write_artifacts(
    schools: pd.DataFrame,
    model: LogisticRegression,
    isotonic: IsotonicRegression,
    means: np.ndarray,
    scales: np.ndarray,
    conformal_by_tier: dict[str, dict[str, float]],
) -> None:
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    artifact = {
        "version": VERSION,
        "trained_at": TRAINED_AT,
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
            "method": "MAPIE MapieRegressor(cv='prefit', method='base') on held-out conformal split using the synthetic generating probability as the interval target",
            "target_coverage": TARGET_COVERAGE,
            "alpha": ALPHA,
            "by_tier": conformal_by_tier,
            "note": "Tier-conditioned MAPIE residual intervals are widened by a public-prior uncertainty floor so low-admit schools do not get falsely precise ranges.",
        },
        "school_base_rates": school_base_rates(schools),
        "lever_metadata": parse_lever_metadata(LEVERS_PATH),
        "honesty_label": "Synthetic public-data prior. Not validated real-outcome accuracy.",
    }
    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")


def write_test_vectors(vectors: list[dict[str, Any]]) -> None:
    TEST_VECTOR_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEST_VECTOR_PATH.write_text(json.dumps(vectors, indent=2), encoding="utf-8")


def write_report(
    reliability: pd.DataFrame,
    interval_summary: pd.DataFrame,
    metrics: dict[str, float],
    applicants_per_school: int,
) -> None:
    plot_reliability(reliability)
    interval_rows = "\n".join(
        "| {tier} | {n:,} | {mean:.3f} | {half:.3f} |".format(
            tier=row.selectivity_tier,
            n=int(row.n),
            mean=float(row.mean_interval_width),
            half=float(row.interval_half_width),
        )
        for row in interval_summary.itertuples(index=False)
    )
    reliability_rows = "\n".join(
        "| {idx} | {pred:.3f} | {obs:.3f} | {count:,} |".format(
            idx=index + 1,
            pred=float(row.mean_predicted),
            obs=float(row.observed_rate),
            count=int(row.bin_count),
        )
        for index, row in reliability.iterrows()
    )

    REPORT_PATH.write_text(
        f"""# Calibration Report

This report is for Fitty's Phase 2 synthetic public-data prior model, not real-outcome accuracy.

![Reliability curve](reliability_curve.png)

## Synthetic Reliability

| Bin | Mean predicted | Observed synthetic admit rate | Count |
|---|---:|---:|---:|
{reliability_rows}

Held-out synthetic test Brier score: `{metrics['brier']:.4f}`  
Held-out synthetic test log loss: `{metrics['log_loss']:.4f}`

## Mean Interval Width By Selectivity Tier

Intervals are generated from held-out MAPIE residuals and widened by tier-specific public-prior uncertainty floors. The intended product behavior is that public-data-only ranges get wider as selectivity rises.

| Tier | Test examples | Mean interval width | Exported half-width |
|---|---:|---:|---:|
{interval_rows}

## Honesty Statement

This is a synthetic prior model, not a validated real-world admissions model. Its labels are generated from public anchors: published admit rate, position relative to published middle-50% bands, and public ED/RD rates where available. Synthetic calibration is useful for testing the artifact contract and for enforcing wide uncertainty where public data cannot see essays, recommendations, institutional priorities, and class-shaping needs. It is not evidence of individual real-world accuracy.

Run details: seed `{SEED}`, `{applicants_per_school}` synthetic applicants per school, model type `{MODEL_TYPE}`.
""",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    if args.source == "supabase":
        schools = load_schools_from_supabase()
        data_source = "Supabase schools table"
    else:
        schools = load_schools_from_cache(Path(args.schools_csv))
        data_source = str(Path(args.schools_csv))

    cohort = generate_synthetic_applicants(
        schools,
        applicants_per_school=args.applicants_per_school,
        seed=SEED,
    )
    train, iso, conformal, test = split_data(cohort)
    means = train.x_raw.mean(axis=0)
    scales = train.x_raw.std(axis=0)
    scales = np.where(scales < 1e-8, 1.0, scales)

    model, isotonic = fit_model(train, iso)
    estimator = CalibratedProbabilityEstimator(model, isotonic, means, scales)
    conformal_by_tier = conformal_half_widths(estimator, conformal)

    _, test_probability = predict_calibrated(model, isotonic, test.x_scaled)
    lows, highs = apply_intervals(
        test_probability,
        test.frame["selectivity_tier"],
        conformal_by_tier,
    )
    test_with_predictions = test.frame.copy()
    test_with_predictions["calibrated_probability"] = test_probability
    test_with_predictions["interval_low"] = lows
    test_with_predictions["interval_high"] = highs
    test_with_predictions["interval_width"] = highs - lows

    reliability = reliability_bins(test_probability, test.y)
    interval_summary = (
        test_with_predictions.groupby("selectivity_tier", observed=False)
        .agg(
            n=("interval_width", "size"),
            mean_interval_width=("interval_width", "mean"),
        )
        .reset_index()
    )
    interval_summary["tier_order"] = interval_summary["selectivity_tier"].map(
        {tier: index for index, tier in enumerate(TIERS)}
    )
    interval_summary = interval_summary.sort_values("tier_order")
    interval_summary["interval_half_width"] = interval_summary["selectivity_tier"].map(
        lambda tier: conformal_by_tier[tier]["interval_half_width"]
    )
    interval_summary = interval_summary.drop(columns=["tier_order"])

    vectors = build_test_vectors(
        schools,
        means,
        scales,
        model,
        isotonic,
        conformal_by_tier,
    )

    metrics = {
        "brier": brier_score_loss(test.y, test_probability),
        "log_loss": log_loss(test.y, np.clip(test_probability, 1e-6, 1 - 1e-6)),
    }

    write_artifacts(schools, model, isotonic, means, scales, conformal_by_tier)
    write_test_vectors(vectors)
    write_report(reliability, interval_summary, metrics, args.applicants_per_school)

    print("Fitty Phase 2 public-prior model trained")
    print(f"Data source: {data_source}")
    print(f"Synthetic applicants: {len(cohort):,}")
    print(f"Artifacts: {ARTIFACT_PATH}")
    print(f"Test vectors: {TEST_VECTOR_PATH}")
    print(f"Calibration report: {REPORT_PATH}")
    print("Mean interval width by tier:")
    for row in interval_summary.itertuples(index=False):
        print(
            f"  {row.selectivity_tier}: {row.mean_interval_width:.3f} "
            f"(half-width {row.interval_half_width:.3f}, n={int(row.n):,})"
        )


if __name__ == "__main__":
    main()
