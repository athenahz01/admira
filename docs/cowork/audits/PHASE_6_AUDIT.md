ADMIRA V2 — PHASE 6 AUDIT
Scope: commit `be0d0f8 "Phase 6: Narrative & Essay Studio + Major/Career Compass"`,
       branch `v2/phase-6-narrative-compass` (audited against a clean `git archive` export)
Claimed deliverable: Phase 6 — Narrative & Essay Studio + Major/Career Compass (first Anthropic-API phase)
Date: 2026-06-27
Auditor: Cowork

VERDICT: **PASS** (cleared for promotion)

The first LLM phase lands its safety contract cleanly: a three-layer no-ghostwriting defense, the model is
forbidden from emitting numbers (every figure is injected from the data/model layer), the key is server-side
only, and the endpoints are rate-limited + streaming. Compass odds use the real Phase 1 engine, earnings are
sourced-or-null (never fabricated), and ROI is a labeled stub (Money is deferred). Zero Blockers, zero Majors.

Audit method note: LLM prose is non-deterministic, so this audit verifies the *guardrails and contract*
(system prompt read verbatim, input/output guards, mocked-client number-handling, key/rate-limit/logging),
not exact model output — as planned for this phase.

---

FINDINGS

Blockers: none.
Majors: none.

Advisory:
- [A1] `compass_seed.json` ships **empty** (0 majors / 0 careers) by design — zero fabricated salaries; the
  Compass renders "pending dataset" until Athena adds rows. Not a defect (honest absence). When real rows are
  added, the DB enforces `source_url` (https) + `provenance='curated_public'`; re-spot-check lineage then.
- [A2] Carryovers still open: Phase 1 score/tier rounding boundary; drop the unused `pgcrypto` extension in
  the Phase 0 migration.

---

MODEL INTEGRITY
  No ghostwriting (3-layer, verified static): **pass** —
    (1) `detectGhostwritingRequest` refuses write/draft/compose/generate/rewrite-my-essay inputs *before* any
        model call (meaningful regex set);
    (2) the system prompt (read verbatim) forbids drafting/rewriting, requires quoting only SHORT snippets of
        the student's own text, and preserves voice;
    (3) `looksGhostwritten` halts the stream if output turns into "here's your revised essay / you could submit
        this"-style prose.
    No humanizer / AI-evasion path exists. Unit tests cover all three.
  No hallucinated numbers: **pass** — system prompt rule explicitly bans figures; `streamNarrativeFeedback`
    yields qualitative text only; the route sends a deterministic `grounding` SSE frame first carrying any
    numbers (admit tier/score), which come from `buildUsAdmitIntelligence` (the Phase 1 engine), not the model.
  Grounding traceable: **pass** — feedback is grounded in the school's CDS C7 priorities (`c7PrioritiesFrom`,
    real ratings only) + RAG exemplars from `essay_pattern_corpus.json`; the grounding frame reports the
    exemplar `source_url`s used. Tested.
  Compass consistency + lineage: **pass** — admit odds = `buildUsAdmitIntelligence` (== `/api/admit-
    intelligence`); earnings/wages are `SourcedFigure {value:number|null, source_url}` — missing stays null
    ("pending dataset"), never fabricated; `ROI_STUB` carries no number. Tested.

BUILD QUALITY
  Anthropic safety: **pass** — `ANTHROPIC_API_KEY` referenced only in server routes
    (`lib/narrative/server.ts`, `app/api/fit/explain`); no `"use client"` file imports the key or server
    modules (no client-bundle leak; executor's bundle scan agrees). `/api/narrative` + `/api/compass`
    rate-limited (429), Zod-validated; narrative streams (SSE); raw essay text is never logged (grep clean);
    essays are ephemeral (no storage table → no PII-at-rest surface).
  Migration/RLS: **pass (static; matches live-verified pattern)** — `compass_majors`/`compass_careers` with
    `source_url NOT NULL` (https check) + `provenance` check; RLS enabled, public-read-only (select), no write
    policy ⇒ anon/auth cannot write — the same pattern verified live in Phase 0. `verify:rls` extended with
    compass anon-write-blocked checks. `gen_random_uuid()` (no pgcrypto). Reversible down script present.
  Architecture: **pass** — `lib/narrative`, `lib/compass`, flagged APIs (+status), `/studio` + `/compass` UI;
    reuses Xenova embeddings + Phase 1 scorer; no scope drift; no money fields/copy.
  Tests: **pass (static + auditor-run)** — 93 unit + 23 e2e per executor; suites target the exact contract
    (ghostwriting refusal, system-prompt contract, output flag, C7 grounding, exemplar source_urls, RAG
    ranking, admit-odds==Phase 1, ROI-stub-no-number, sourced-earnings-never-fabricated, lineage). `tsc
    --noEmit` clean on the export. (Full vitest/build not run here — mounted node_modules lacks the Linux
    rolldown native binding; environment, not code.)
  Feature flags: **yes** — `ADMIRA_NARRATIVE_ENABLED`, `ADMIRA_COMPASS_ENABLED` default false; no auto-promote.
  MODEL_CARD: **pass** — documents grounding sources, the no-ghostwriting/no-number contract, and the deferred ROI stub.

CONDITIONS / NOTES:
  - Cleared for promotion behind the flags now.
  - Before turning Compass ON for users: seed `compass_seed.json` with real, `source_url`-cited rows and run
    `npm run ingest:compass` (the feature is honest-but-empty until then).
  - Standing reproduction gate (every phase): Linux `npm ci` → `test`+`test:e2e`+`build`; run the extended
    `verify:rls` (incl. the compass anon-write checks) against staging. Auditor verified `tsc` + the static
    LLM-guardrail/contract review + key/rate-limit/logging here.

SIGN-OFF: Cowork — **Pass.** Phases 0,1,2,3,5,6 cleared; Money (4) deferred to last. Next: Phase 7
(Admira Copilot + Stunning Reports) — audit focus: every agent tool-call returns correct module data, **no
hallucinated numbers** in chat or report, report figures == module outputs exactly; money tool/section stays
out until Phase 4.
