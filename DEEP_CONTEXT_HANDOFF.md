# Moustachi — authoritative repository handoff
Updated 2026-09-16. Highest project policy remains `C:\dev\career-ops\DEEP_CONTEXT_HANDOFF_FINAL.md`.

## Read first
`README.md`, `docs/AUTHORITY_MAP.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/HERMES_REUSE.md`, `docs/LOGIN_BOUNDARY.md`.

## Current source and deployment
Core: C:\dev\moustachi -> happyivanencoding/moustachi, main, AGPL-3.0-only with retained Hermes MIT attribution. Companion: C:\dev\moustachi-onward -> happyivanencoding/moustachi-onward. Business-specific migration scripts live in the companion, not core. Core has a personal-only initializer.

Moustachi Core is installed/running through its own hidden Windows scheduled task on port 39178. Its private home is %LOCALAPPDATA%\Moustachi. The official ACP adapter is a direct child of core; Runtime is an optional computer MCP with ACP disabled, not the owner of these sessions.

**Production WhatsApp and feedback still use the old OnwardOps services/source dc5b94c.** New Moustachi WhatsApp and Moustachi Onward Ops tasks are disabled. No transport state migration or outbox cutover occurred. No Onward Web deploy, Runtime binary change, new VPS, public Tunnel or ChatGPT connector was performed.

## Accepted evidence
Core 12 tests, generic transport 12, business profile 9 passed before final initializer regression. Real MCP handshake (15 tools), direct Codex reply, same-task continuation, native restart/resume, knowledge-tool lookup and actual Runtime exec marker passed. New analytics adapter read the real aggregate. Acceptance records live outside Git in the private home's acceptance directory.

## Important boundaries and blockers
Native Codex login/cache/history still uses the existing provider-owned account. Profile Moustachi databases/memory/skills/workspaces are separate; no claim of isolated native accounts or an OS sandbox. A credential-copy attempt was blocked and abandoned. Legacy Runtime metadata read and a live Onward-origin test were blocked; do not bypass them by changing identities/connectors. Keep original files and the working production chain in place until an authorized live test succeeds.

Only known public group rolling history is prepared for migration; full old ACP history was not imported. Automated dreaming/LLM consolidation, automatic isolated delegation, broad multi-chat/Personal WhatsApp routing, public connector registration and Control dashboard source rewiring are not delivered as live features. Candidate/proposal, evidence-based promotion, manual reversible curator, parent-task lineage, native compaction ownership and context inspection are implemented building blocks, not claims of autonomous learning in production.

Next work starts at the activation gates in docs/OPERATIONS.md. Do not rerun configure-migration against an existing live config or infer authority from directory names. Do not modify unrelated dirty repos. Every code change gets focused validation, handoff update, scoped commit and push to this repository's main.
