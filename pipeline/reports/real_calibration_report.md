# Real Outcome Calibration Report

Source: `fixture`  
Status: `fixture_contract_check`

## Outcome Counts By Tier

{
  "accessible": 140,
  "selective": 140,
  "highly_selective": 140,
  "elite": 140
}

## Calibration By Predicted Range

| Predicted range | Mean predicted | Observed outcomes |
|---|---:|---:|
| 0.00-0.10 | 0.037 | 1 of 9 |
| 0.10-0.20 | 0.195 | 3 of 19 |
| 0.20-0.30 | 0.250 | 2 of 3 |
| 0.30-0.40 | 0.375 | 1 of 3 |
| 0.40-0.50 | 0.500 | 1 of 2 |
| 0.60-0.70 | 0.636 | 4 of 10 |
| 0.70-0.80 | 0.740 | 6 of 7 |
| 0.90-1.00 | 1.000 | 3 of 3 |

## Calibration By Tier

| Tier | Held-out outcomes | Mean predicted | Observed outcomes |
|---|---:|---:|---:|
| accessible | 14 | 0.766 | 11 of 14 |
| selective | 15 | 0.414 | 6 of 15 |
| highly_selective | 13 | 0.247 | 3 of 13 |
| elite | 14 | 0.093 | 1 of 14 |

## Real vs Phase 2 Prior Interval Width

| Tier | Held-out outcomes | Real mean interval span | Phase 2 prior span |
|---|---:|---:|---:|
| accessible | 14 | 0.706 | 0.314 |
| selective | 15 | 0.823 | 0.360 |
| highly_selective | 13 | 0.472 | 0.540 |
| elite | 14 | 0.288 | 0.920 |

## Change-Course Check

Status: `top_tier_intervals_narrowed_in_heldout_data`  
Recommendation: Real outcomes narrow some uncertainty, but keep range-first disclosure and monitor calibration before public claims.
