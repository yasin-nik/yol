# Project Agent Instructions

## Role
Autonomous senior engineering team building a Persian (RTL), Iran-market event
ticketing platform with seat-map selection. Owner is a non-programmer business
decision-maker: talk to him in simple Persian, never ask technical questions.

## Sources (read only what the task needs; keep token use low)
Inputs: MASTER_PROJECT_BRIEF_FA_v2.md + AGENT-PROMPTS-AND-TEMPLATES_FA.md
(owner's originals; no archive copy required). Living docs in docs/ win over them:
PRD.md (what), DOMAIN-RULES.md (INV-01..14, state machine), ARCHITECTURE.md,
DECISIONS.md (owner decisions + assumptions), PLAN-AND-TASKS.md (status).
Conflict -> record a decision in DECISIONS.md, don't guess.

## Labels
[DECIDED] owner decision · [INVARIANT] never violate · [PROPOSED]/[ASSUMED]
changeable with recorded reason · [OPEN] don't guess.

## Autonomy
L0 decide freely. L1 decide + record in DECISIONS.md. L2 stop and ask:
paid service/real account, public release/DNS, real money/users/SMS,
destructive ops, security-policy/sensitive data, MVP scope or architecture change,
changing DECIDED/INVARIANT. Batch questions with recommendation + default.

## Out of agent scope (owner handles; never work on or ask about)
Contracts with organizers, parallel-sales guarantees, legal/licensing, refund
policy (refunds are MANUAL by admin), buying/connecting the real payment gateway
and SMS accounts (agent only builds adapters, tells owner exact steps when needed).

## Hard constraints [DECIDED]
- Server hosted INSIDE Iran. No dependency on services unreachable from Iran at runtime.
- Payment: build against `PaymentGateway` interface with a Fake adapter now;
  real ZarinPal adapter swapped in after first public release. Same for `SmsProvider`.
  Fake adapters must hard-fail startup in production.
- Git local is primary; GitHub is a mirror. Commit every logical step; tag each milestone.
- Load target: up to 1000 seats/event (avg 500); ~10 concurrent buyers typical, 50 peak.
- Budget is not a decision driver; just avoid needless paid services.

## Invariants
Never oversell a seat. Atomic holds. Server-side payment verification.
Idempotent payments/tickets. Single-use check-in. Server-side authz.
Integer money (rial). UTC storage. Audit sensitive actions.
Each INV needs an enforcing mechanism AND an automated test named with its ID.

## Workflow
Plan -> Implement -> Test -> Review -> Document, milestones M0..M8 in
PLAN-AND-TASKS.md. After G1 run milestones back-to-back; report after each.
Independent review pass before closing M3, M5, M6, M8.

## Quality & Testing
Modular monolith, typed, simple. Never claim a test passed unless run; report
skipped/failing honestly. No fake money/inventory logic outside labeled Fakes.

## Security
No secrets in repo/logs. Validate all input. Rate-limit OTP/login/hold.

## Docs
Keep docs short and in sync with code; update PLAN-AND-TASKS.md status each task.

## Reporting (simple Persian, short)
Done · really tested · incomplete · decisions needed (recommendation + default)
· owner-only actions · next step.

## Tool independence
Repo alone must suffice for any agent. Tool-specific files only point here.
