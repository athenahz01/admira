# Admira Design Notes

## Direction

Fit and Honest Chance. Every result answers two separate questions: is this school a good fit, and what is the honest admissions range. Chance stays oxide and range-first. FIT stays teal, explainable, and separate from admission odds.

## Token System

Light mode uses the uploaded warm paper palette. Dark mode keeps the same hue roles and shifts lightness for contrast.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--chance-ink` | `#7C2D12` | `#FED7AA` | Chance text and tick emphasis |
| `--chance-deep` | `#9A3412` | `#FDBA74` | Deep chance accent |
| `--chance-primary` | `#C2410C` | `#FB923C` | Primary chance action and range color |
| `--chance-bright` | `#EA580C` | `#F97316` | Bright chance accent |
| `--chance-soft` | `#FDBA74` | `#9A3412` | Soft chance band |
| `--chance-wash` | `#FFF6F1` | `#34170F` | Chance wash and reach background |
| `--fit-ink` | `#0B3D34` | `#C7F7E8` | FIT text |
| `--fit-teal` | `#0F766E` | `#5EEAD4` | FIT outline and radar stroke |
| `--fit-green` | `#10B981` | `#34D399` | Student radar fill and good states |
| `--fit-wash` | `#E5F5F0` | `#0F2F2A` | FIT wash |
| `--school-indigo` | `#6366F1` | `#A5B4FC` | Typical admit reference |
| `--school-indigo-wash` | `#EEF0FE` | `#20254C` | Methodology and school wash |
| `--canvas` | `#E7E5DF` | `#17120F` | Warm page paper |
| `--warm-card` | `#FFF8F2` | `#211813` | Main cards |
| `--plain-card` | `#FFFFFF` | `#261D17` | High-contrast plain card |
| `--ink` | `#2A1F18` | `#F6EFE7` | Main text |
| `--muted` | `#6B5F54` | `#C9BDB2` | Supporting text |
| `--faint` | `#9A938A` | `#A89B90` | Labels and axes |

Oxide is reserved for chance. Teal and green are reserved for FIT. Indigo is reserved for the school or typical-admit reference.

## Polish Pass Tokens

Shared product surfaces use `--shadow-border` and `--shadow-border-hover` so dashboard cards, loading cards, and Phase 5 panels sit on the same visual plane in light and dark mode. Legacy `--paper-shadow` remains for older controls and secondary pages.

Motion is centralized with `--motion-fast`, `--motion-medium`, `--motion-slow`, and `--ease-out-quart`. `dashboard-reveal` is used for card entrance, while `data-bar-grow` and `meter-rise` only animate bars that are already sized by real model or list data. Loading skeletons continue to use `band-scan` and never display temporary scores, percentages, costs, or counts.

Reduced-motion users get instant surfaces: the polish animations, data-bar transforms, and skeleton scans are disabled inside `prefers-reduced-motion: reduce`.

## Depth & atmosphere tokens (Polish B)

Elevation is a named scale — `--elev-1/2/3` — of warm, layered shadows (warm-ink shadow color in light, a brightening ring plus a deep drop in dark so cards still read on near-black). `--shadow-border`/`--paper-shadow` now alias `--elev-2/3` so every card deepens consistently. `--rail-shadow` is the long soft shadow that lifts the ink `--rail-bg` surfaces above the paper; `--card-highlight` is the faint inner top highlight on raised cards. `--tier-target-text` consolidates the target-tier amber that was previously scattered inline.

The `--canvas` carries one whisper-quiet warm-paper grain (a fixed, non-interactive `body::before` fractal-noise layer at `--grain-opacity`, ~5% light / ~3.5% dark) so the cream is never dead-flat; it is a static texture, not motion.

Motion budget adds `card-enter` (a ≤240ms fade/translate reveal as content mounts) and hover/active lift on cards and buttons (transform + elevation), plus a `useCountUp` hook for the headline score (counts up on first mount, ease-out-quart). All of it is ≤250ms on `--ease-out-quart` and disabled under `prefers-reduced-motion`; the count-up's initial and reduced-motion render is always the real final number (no hydration mismatch, no invented figure).

## Type

- Display and headings: Bricolage Grotesque, weight 800.
- Body and UI: Plus Jakarta Sans, weights 400 to 700.
- Labels, ranges, axes, and data: Space Mono with tabular numerals.

## Signature Elements

1. Honest Chance Range Bar: 0 to 100 track, oxide interval, and a most-likely tick. The visible answer is the interval, such as `9-19%`; the tick is only a marker.
2. Reach Ladder: reach, target, and likely zones with the actual interval and tick placed by their numeric values. The ladder footnote says the position follows the interval.
3. Fit Radar: five axes, Academics, Major, Selectivity, Interest, and Rigor. Student overlap is green. Typical admit reference is indigo dashed. The same data is listed as text.
4. Fit Overlap: `FIT NN` is a 0 to 100 profile-overlap score, not a probability. It sits beside the chance range and never replaces it.

## FIT Score Definition

`lib/fit/fit-score.ts` computes FIT server-side for Fit Finder results:

- Academics compares GPA and submitted test scores with public middle-50 bands or GPA average.
- Major embeds the student's intended major and interests against the school's program areas with `Xenova/all-MiniLM-L6-v2`, the pinned Fit Finder embedding model.
- Selectivity compares academic strength with the school's selectivity tier.
- Interest uses the school-document similarity returned by the pinned embedding search.
- Rigor is a thin proxy because Fit Finder does not receive a course-rigor transcript field. It uses academic signal plus the school's CDS rigor rating when available and labels the limitation.

The score is the equal-weight mean of known axes. Unknown axes are excluded and reported in coverage.

## Climb Levers

`lib/fit/levers.ts` separates numeric deltas from direction-only guidance:

- Test score gets a numeric range movement only after rerunning the existing chance inference with a modest higher submitted score.
- Application round gets a numeric value only from loaded published ED/RD rate spread.
- Essays, recommendations, and demonstrated interest are direction-only. They say these factors can narrow the real outcome range, but they are not in the model yet.

## Accessibility Notes

The range bar, reach ladder, and radar have text equivalents or aria labels. Color is never the only signal: labels, axis rows, `FIT NN`, chance range text, ladder zones, and blind-spot chips all name their meaning. Dark mode keeps the same semantic hue roles.
