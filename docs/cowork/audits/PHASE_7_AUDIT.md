ADMIRA V2 — PHASE 7 AUDIT
Scope: commit `4d80e42 "Build phase 7 copilot reports"`, branch `v2/phase-7-copilot-reports`
       (audited against a clean `git archive` export; DB checks run on a real Postgres 15 + pgvector)
Claimed deliverable: Phase 7 — Admira Copilot + Stunning Reports + polish (integration capstone)
Date: 2026-06-27
Auditor: Cowork

VERDICT: **PASS** (cleared for promotion)

The capstone makes everything agree. The Copilot's tools wrap the real modules, the agent cannot surface a
number that didn't come from a tool result (enforced, not just prompted), the report copies module outputs and
redacts PII + deferred-money fields, and share links use hashed high-entropy tokens with owner RLS — verified
live. Zero Blockers, zero Majors.

Audit method note: as in Phase 6, LLM prose is non-deterministic, so this verifies the guardrails/contract
(tool fidelity, the numbers-from-tools assertion, redaction, key/rate-limit, share access) — not exact model
output. DB owner-isolation + migration apply were run on a real database.

---

FINDINGS

Blockers: none.
Majors: none.

Advisory:
- [A1] The Copilot's Students-Like-You tool shapes caller-provided `tool_context.students_like_you` rows via
  `studentsLikeYouResponse`, which re-applies the k-anonymity floor (`cohort_size >= K`). The authoritative
  k-gate remains the `match_similar_cohort` SQL function (Phase 3); since cohort rows are aggregate-only with
  no PII/`subject_id`, there is nothing to leak even via context. No action needed — noted for awareness.
- [A2] `report_shares.report_payload` is stored as the generated payload (owner-RLS protected at rest); the
  public share path redacts on read. Fine; if you later want defense-in-depth, redact at write time too.
- [A3] Carryovers still open: Phase 1 score/tier rounding boundary; drop the unused `pgcrypto` extension.

---

MODEL INTEGRITY
  No hallucinated numbers (enforced, verified static): **pass** —
    • `sanitizeModelText` strips $-figures, percentages, fractions, bare numbers, and "phase N" from prose;
    • `assertChatNumbersCameFromTools` collects the numeric tokens present in the actual tool results and
      **throws** if the model text contains any number not in that allowed set. A hallucinated figure aborts
      the turn. Unit-tested ("only renders numbers from tool receipts", "does not pass through model-invented
      numbers").
  Tool fidelity: **pass** — the registry wraps the real modules (`buildUsAdmitIntelligence`, `generateList`,
    `studentsLikeYouResponse`, `buildClimbRoadmap`, command-center, `generateCompass`); each tool's output is
    the module's output (no reimplementation). Documented via `wraps:` and tested ("delegates every read tool
    to the real module output").
  Report consistency: **pass** — the report copies figures from tool outputs (== module outputs), so report
    odds/list/cohort/deltas equal the live modules. Tested ("copies report figures from tool outputs").
  No money: **pass** — no money tool registered; a `MONEY_NOTE` makes the agent decline cost questions without
    a number; `redactReportForShare` strips a money/cost/ROI/aid/sticker/merit regex and internal ids. ROI
    stays a labeled stub. Tested ("wraps the existing modules without a money tool", "refuses money questions",
    "omits deferred-money fields and internal identifiers").

BUILD QUALITY
  Share-link privacy: **pass — owner isolation verified live.** `report_shares` stores only a SHA-256
    `token_hash` (unique, `length >= 64`); tokens are 32 random bytes (base64url) — unguessable; the plaintext
    is never stored. Owner RLS (`subject_id = auth.uid()`) for select/insert/update/delete. The public route
    uses the service-role client to look up by `token_hash`, checks `revoked_at`, and returns
    `redactReportForShare(...)`. Live results (two simulated users): A sees 0 of B's shares; A insert-as-B
    blocked (42501); A delete of B's share → 0 rows; B reads own. Tested ("uses unguessable token hashes").
  Action authorization: **pass** — write-tools (e.g. `update_command_center_status`) are owner-scoped through
    the existing service-role routes; receipts reversible. `verify:rls` extended with report-share checks.
  Anthropic safety: **pass** — `ANTHROPIC_API_KEY` only in server modules (`lib/copilot/server.ts`,
    `lib/narrative/server.ts`, `app/api/fit/explain`); no client component imports it; `/api/copilot`
    rate-limited, Zod-validated, SSE streaming; no sensitive logging.
  Migration: **pass — apply verified live; reverse present.** Full chain (…→phase7) applies cleanly on a real
    PG+pgvector; `report_shares` + indexes; `gen_random_uuid()` (no pgcrypto); down script present.
  Architecture/tests: **pass** — `lib/copilot`, `lib/report`, flagged APIs (copilot + reports
    generate/export/share); 104 unit + 25 e2e per executor, suites on-target; `tsc --noEmit` clean on export.
  Feature flags: **yes** — `ADMIRA_COPILOT_ENABLED`, `ADMIRA_REPORTS_ENABLED` default false; no auto-promote.
  MODEL_CARD: **pass** — documents the tool registry, numbers-only-from-tools contract, and report consistency.

CONDITIONS / NOTES:
  - Cleared for promotion behind the flags now.
  - Standing reproduction gate (every phase): Linux `npm ci` → `test`+`test:e2e`+`build`; run the extended
    `verify:rls` (incl. Phase 7 report-share checks) against staging. Auditor verified `tsc` + the static
    guardrail/contract review + the live report_shares owner-isolation + migration apply here.

SIGN-OFF: Cowork — **Pass.** All feature phases cleared: **0, 1, 2, 3, 5, 6, 7**. Remaining: the global polish
pass, then Phase 4 (Money) last. The screenshot→plan→shareable-report loop is closed and audited.
