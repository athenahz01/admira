# Fitty Design Notes

## Direction

Direction 3: Admissions Almanac. The interface borrows from annual statistical almanacs, Common Data Set tables, marginal notes, and admissions records. The product should feel calm, exact, and willing to show uncertainty rather than smoothing it away.

## Signature

The confidence band is a horizontal 0-100 measurement scale. The shaded interval is the answer. The calibrated point is only a thin tick inside the interval. This appears in result cards, list balance mini-bands, loading states, and card copy.

## Token System

Light and dark modes use the same hue family. Only lightness, contrast, and temperature shift.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--almanac-sheet` | `#EDF0E8` | `#151A1B` | Archive-green page paper |
| `--almanac-plate` | `#FFFAF0` | `#1C2222` | Primary panels |
| `--almanac-panel` | `#F6F1E3` | `#202727` | Evidence panels |
| `--almanac-inset` | `#E7E1D2` | `#121718` | Inputs and rails |
| `--ledger-ink` | `#1F2523` | `#EFE9DC` | Main text and point tick |
| `--ledger-muted` | `#58625D` | `#B7ADA0` | Supporting text |
| `--ledger-rule` | translucent ink | translucent paper | Hairline structure |
| `--oxide-band` | `#B9653B` | `#D08A5F` | Confidence band accent |
| `--slate-green` | `#566B67` | `#82A09A` | Calm positive signal |
| `--annotation-plum` | `#6D5365` | `#B895A9` | Secondary annotation |

## Type

- Heading: Literata, for almanac/editorial authority.
- Body: Public Sans, for plain interface readability.
- Data: JetBrains Mono with tabular numerals, for ranges, gaps, counts, and logit contributions.

## Structure

The page is a decision workspace:

- Left ledger: student profile, school search, list balance.
- Right record stack: one result card per school.
- Result card hierarchy: range band first, then lever map, unseen factors, C7 grounding, disclosures.

## Defaults Rejected

- Big percentage hero: replaced by interval-first measurement scale.
- Donut/progress ring: replaced by horizontal 0-100 rule.
- Traffic-light safety chips: replaced by secondary interval-derived labels.
- Generic stat cards: replaced by evidence panels and almanac record cards.
- College-brochure blue: replaced by oxide, paper, ledger ink, slate green, and annotation plum.

## Accessibility Notes

The band has `role="img"` and an aria label naming the interval and point marker. It is keyboard-focusable. Meaning is not color-only: low/high labels, marker text, interval-derived labels, and disclosure copy are all textual.
