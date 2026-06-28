# Executor Handoff — Phase 7: Admira Copilot + Stunning Reports + polish

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — what Admira is, the build/audit loop, repo
> layout, house conventions, what's built (Phases 0–3, 5, 6), and how you'll be audited. Then come back.

*Executor: Codex. Builds on Phase 6 (`be0d0f8`). Branch `v2/phase-7-copilot-reports` off
`v2/phase-6-narrative-compass`. **Commit your work** (the audit reads committed blobs; keep LF endings).*
*Sequencing: **Money/Phase 4 is still deferred to last.** The Copilot has **no money tool**; the report has
**no cost/ROI section** — if asked about cost, the agent says it's coming, never fabricates a number.*

---

## Mission

The capstone: (1) **Admira Copilot** — one Claude agent with tool-access to every shipped module that knows the
profile, answers questions, takes scoped actions, and nudges; and (2) **Stunning Reports** — a branded,
shareable web + PDF report assembling the student's full plan. Plus a global polish pass (animations, empty
states, mobile, performance). This is where everything must *agree* — chat and report numbers have to equal
the modules they came from. Behind flags, no auto-promote.

## Hard constraints (Cowork will block on these)

1. **The agent never invents numbers — every figure comes from a tool-call.** Each Copilot tool wraps a real
   module (`lib/score` admit-intelligence, `lib/list-builder`, `lib/similarity`, `lib/climb`,
   `lib/command-center`, `lib/compass`) and returns *that module's* output. The LLM narrates and routes; all
   figures in chat are tool outputs injected around the model, never produced by it. (Same contract as Phase 6,
   now across all modules.)
2. **Report figures == module outputs, exactly.** The report is assembled from the same module functions the
   app uses — not a re-derivation that could drift. A number in the report must equal what the module returns
   for that profile/school (odds == `/api/admit-intelligence`; list == list-builder; cohort == the k-gated
   Students-Like-You; deltas == climb). Cross-module consistency is the headline audit check here.
3. **Tools return correct module data — no reimplementation.** Wrap the existing modules; do not re-derive
   their logic inside the agent. A tool's output for given inputs equals the module's output for those inputs.
4. **Actions are owner-scoped, authorized, and validated.** Write-actions ("add X to my list", "mark task
   done") go through service-role routes and may only touch the **acting user's own** rows (owner-RLS from
   Phases 3/5). The agent cannot read or mutate another user's data. Validate every tool input (Zod);
   mutations are explicit and reversible by the user. No destructive bulk actions.
5. **Privacy holds through the agent.** The Students-Like-You tool returns only the **k-anonymity-gated**
   aggregates (it calls the same `match_similar_cohort` function — no bypass); no PII, no `subject_id`, no raw
   essays/cohort rows enter the model or the report. Don't log sensitive content.
6. **No money.** No money tool, no cost/net-price/merit/ROI numbers in chat or report. ROI stays the labeled
   stub. If asked, the agent states Money is coming — it never fabricates a figure.
7. **Anthropic safety.** `ANTHROPIC_API_KEY` server-side only; `/api/copilot` rate-limited, Zod-validated,
   streaming tool-use; no sensitive logging. Numbers reproducible (from the deterministic module layer); LLM
   prose may vary.
8. **Shareable report can't leak.** A shared report link must not expose another user's data or PII — use an
   owner-scoped/tokenized access path, not a guessable public id; the shared artifact contains only the
   owner's own plan and no internal identifiers.

## Build

### 1. `lib/copilot/`
- An agent with a typed tool registry; each tool is a thin wrapper over a module (admit-intelligence, list,
  students-like-you, climb, command-center, compass — **no money**). Tool I/O is Zod-validated. The agent loop
  (Anthropic tool-use, streaming) decides which tools to call; numbers are taken from tool results verbatim.
  Keep tool wrappers pure/testable; isolate the single streaming Anthropic call behind a thin server client.
- Actions: write-tools call the existing owner-scoped service-role routes (list/tasks/requirement_status),
  never raw SQL; owner = the authenticated subject.

### 2. Report generator (`lib/report/` + route)
- Deterministic assembler that pulls profile + list + odds + roadmap + (compass, narrative summary) from the
  same module functions and renders a branded web report + PDF export. Every figure is the module's output.
  Shareable via an owner-scoped token; no PII or internal ids in the artifact.

### 3. APIs
- `/api/copilot` (streaming, tool-use, rate-limited) and the report generate/export routes, behind
  `ADMIRA_COPILOT_ENABLED` and `ADMIRA_REPORTS_ENABLED` (default `"false"`). Zod-validated; server-side keys;
  owner-scoped writes; no sensitive logging.

### 4. Global polish
- Animations, empty states, mobile, performance: AI endpoints stream; pages don't block on slow calls;
  pgvector queries stay indexed; no N+1. Confident headline-first presentation (no hedging copy) — but every
  surfaced number must still trace to a module/data output (polish must not introduce decorative fake figures).

### 5. Tests (required for sign-off)
- **Tool-fidelity test:** each Copilot tool's output equals the underlying module's output for the same input.
- **No-hallucinated-number test:** with the Anthropic client mocked, numbers in chat come from tool results,
  not the model; the agent cannot surface a figure absent a tool-call.
- **Report-consistency test:** every figure in the report equals the module output (odds == admit-intelligence,
  list == list-builder, cohort == k-gated SLY, deltas == climb) for the same profile.
- **Action-authorization test:** a write-action only affects the acting user's rows; cross-user mutation is
  blocked (extend `verify:rls`); inputs validated.
- **k-anonymity-through-agent test:** the SLY tool returns nothing for sub-k cohorts.
- **No-money test:** no money tool registered; no cost/ROI number in chat or report.
- **Share-link privacy test:** a shared report exposes only the owner's plan; no PII/internal ids; access is
  token/owner-scoped, not a guessable public id.
- **Security tests:** key not in client bundle; `/api/copilot` rate-limited; no sensitive logging.
- Playwright e2e for a copilot conversation (mocked Anthropic, incl. an action) and report generate/export
  (flag on).

## Acceptance criteria (Cowork checks exactly)
- [ ] Every number in chat/report comes from a module tool-call; the LLM emits no figures.
- [ ] Report figures equal module outputs exactly (odds/list/cohort/deltas all consistent across surfaces).
- [ ] Copilot tools wrap real modules (no reimplementation); tool output == module output.
- [ ] Write-actions are owner-scoped + validated; no cross-user read/mutation; `verify:rls` extended & green.
- [ ] SLY through the agent respects k-anonymity; no PII/subject_id/raw essays in model input, logs, or report.
- [ ] No money tool/section; ROI stays a labeled stub; cost questions answered honestly, never fabricated.
- [ ] `ANTHROPIC_API_KEY` server-side only; `/api/copilot` rate-limited, Zod-validated, streaming.
- [ ] Shared report link is owner/token-scoped; no PII or internal ids leak.
- [ ] Behind `ADMIRA_COPILOT_ENABLED` / `ADMIRA_REPORTS_ENABLED` (default false); no auto-promote.
- [ ] Polish introduces no fabricated/decorative numbers; existing flows unregressed.
- [ ] Migration (if any) applies + reverses cleanly; no pgcrypto; `npm run lint`,`test`,`test:e2e`,`build`,`verify:rls` green.
- [ ] `MODEL_CARD.md` documents the tool registry, the numbers-only-from-tools contract, and the report-consistency guarantee.

## Out of scope (do NOT do)
- Money / net price / merit / ROI numbers (Phase 4, deferred to last) — ROI stays a labeled stub.
- Feeding agent/cohort/essay signals back into the admit score (leakage; still off).
- New scoring logic — Copilot orchestrates existing modules, it doesn't change them.

## Deliver to the auditor
A committed branch/PR + commit range, and a note on: the tool registry (which module each tool wraps), how
numbers are kept out of the LLM and proven equal to module outputs, the action-authorization/owner-scoping
model, and how the shareable report link is access-controlled.
