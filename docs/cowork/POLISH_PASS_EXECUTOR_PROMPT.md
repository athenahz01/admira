# Executor Handoff — Global Polish Pass (UI/UX, empty states, mobile, performance)

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — what Admira is, the build/audit loop, repo
> layout, house conventions, what's built (Phases 0–3, 5, 6, 7), and how you'll be audited. Then come back.

*Builds on Phase 7 (`4d80e42`). Branch `v2/polish-pass` off `v2/phase-7-copilot-reports`. **Commit your
work** (the audit reads committed blobs; keep LF endings).*
*Sequencing: **Money/Phase 4 is still last.** This pass adds no money UI; ROI stays a labeled stub.*

---

## Mission

Make the whole product feel like a premium intelligence dashboard, end to end: cohesive visual system,
animated reveals, honest empty/loading/error states everywhere, mobile parity, and snappy performance. This is
a **presentational pass** — it polishes how things look and feel across all shipped modules (Admit
Intelligence + Profile Studio, Universe + List Builder, Students-Like-You, Climb + Command Center, Narrative +
Compass, Copilot + Reports). It must change **how it looks, not what it computes.**

## The non-negotiable for a polish pass (any violation = Blocker)

**Polish is presentational only. It must not change behavior, numbers, or data flow.**
- Every number on screen still traces to its module/data source. **No decorative, placeholder, sample, or
  "demo" numbers** baked into components — a polished card must render real props, never a hardcoded "92" or
  fake distribution that could ship as if real.
- No scoring/list/cohort/report logic moves into the client or gets re-derived in a component (that would
  drift from the server module). Components render what the modules return.
- No new data path bypasses RLS / k-anonymity / consent. No secrets or PII reach the client bundle, logs, or
  analytics (the existing analytics scrubber must still cover any new telemetry).
- Flags stay default-off; this pass does not flip any feature on.
- The full existing test suite stays green (no regressions).

## Scope (presentational)

1. **Design system.** Consolidate tokens (color, type scale, spacing, radius, shadow, motion) so every module
   shares one premium dark-dashboard language. No one-off styles drifting per page.
2. **Animated reveals.** Score reveal, radar/spider, distribution bands, list re-balance, roadmap timeline,
   report assembly — tasteful, performant. **Honor `prefers-reduced-motion`** (animations degrade to instant).
3. **Honest empty/loading/error states for every module.** These must be truthful, never fabricated:
   - Admit Intelligence: no profile yet / school not scored.
   - Students-Like-You: sub-k cohort → "not enough similar students yet" (never a partial/fake cohort).
   - Command Center: "Deadline not loaded" where no sourced deadline exists.
   - Compass: "pending dataset" where earnings rows aren't seeded (no fake salaries).
   - List Builder / Universe / Copilot / Reports: empty, loading (skeletons with **no fake numbers**), and
     error states.
4. **Mobile parity.** Every flow works and looks right at mobile widths; touch targets, no overflow, no layout
   shift (CLS). Keyboard navigation + focus states.
5. **Performance.** AI endpoints stream (keep); pages don't block on slow calls (Suspense/loading boundaries);
   pgvector queries stay indexed; no N+1; images optimized; avoid heavy client compute that duplicates the
   server. No regressions in build size that ship secrets.
6. **Accessibility.** Reasonable contrast, alt text, roles/labels, focus order, reduced-motion.

## Build notes
- Prefer shared components + tokens over per-page CSS. Keep all module logic in `lib/*`; components are
  presentational and take typed props.
- If you add a loading/skeleton, it shows structure only — no numeric placeholders that read as data.
- Any new analytics/telemetry routes through the existing `lib/analytics` scrubber (booleans/counts only,
  no PII).

## Tests (required for sign-off)
- **No-regression:** `npm run lint`, `test`, `test:e2e`, `build` all green; behavior unchanged.
- **Empty/loading/error e2e:** each module renders its honest empty, loading, and error state (assert the
  truthful copy, e.g. sub-k message, "Deadline not loaded", "pending dataset") with **no fabricated numbers**.
- **No-hardcoded-number check:** a test/lint guard that presentational components don't embed literal
  stats/figures (numbers come from props/data).
- **Reduced-motion test:** animations are disabled/instant under `prefers-reduced-motion`.
- **Mobile e2e:** key flows pass at a mobile viewport (no overflow, targets reachable).
- **Bundle/secret check:** no secrets or PII in the client bundle; analytics payloads remain scrubbed.

## Acceptance criteria (Cowork checks exactly)
- [ ] No number on screen is hardcoded/decorative; every figure traces to a module/data output (incl. skeletons).
- [ ] No scoring/list/cohort/report logic re-implemented client-side; components render module outputs.
- [ ] Every module has honest empty/loading/error states; sub-k / deadline-not-loaded / pending-dataset copy is truthful.
- [ ] `prefers-reduced-motion` respected; mobile parity; reasonable a11y (focus, contrast, labels).
- [ ] No new data path bypasses RLS/k-anon/consent; no secrets/PII in bundle, logs, or analytics.
- [ ] Flags unchanged (default off); no feature flipped on; no money UI; ROI stays a labeled stub.
- [ ] Full suite green; no behavior/number changes vs Phase 7 (diff is presentational).
- [ ] `MODEL_CARD.md`/docs unchanged in substance (no new claims); design tokens documented if added.

## Out of scope (do NOT do)
- Any money/cost/ROI UI or numbers (Phase 4, last).
- New features, new modules, new scoring/logic, or changes to module outputs.
- Turning on any feature flag; changing RLS/consent/k-anon behavior.

## Deliver to the auditor
A committed branch/PR + commit range, and a note confirming the diff is presentational (no logic/number
changes), plus how empty/loading/error states and reduced-motion/mobile were handled. Call out any file where
you touched logic (there should be none) so the auditor can focus the regression check.
