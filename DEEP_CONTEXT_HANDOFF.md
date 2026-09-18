# Moustachi — authoritative repository handoff
Updated 2026-09-18. Highest Onward project policy is `C:\dev\onward\DEEP_CONTEXT_HANDOFF_FINAL.md`; Moustachi core remains a shared platform rather than an Onward child repository.

## Read first
`README.md`, `docs/AUTHORITY_MAP.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/HERMES_REUSE.md`, `docs/LOGIN_BOUNDARY.md`.

## Current source and deployment
Core: C:\dev\moustachi -> happyivanencoding/moustachi, main, AGPL-3.0-only with retained Hermes MIT attribution. Companion: C:\dev\moustachi-onward -> happyivanencoding/moustachi-onward. Business-specific migration scripts live in the companion, not core. Core has a personal-only initializer.

Moustachi Core is installed/running through its own hidden Windows scheduled task on port 39178. Its private home is %LOCALAPPDATA%\Moustachi. The official ACP adapter is a direct child of core; Runtime is an optional computer MCP with ACP disabled, not the owner of these sessions.

**Production is now cut over to the independent Moustachi stack.** `Moustachi Core` and `Moustachi WhatsApp` are Running; `Moustachi Onward Ops` is enabled. Legacy `Onward WhatsApp Bridge` and `Onward Ops Agent` are Disabled and retained only for rollback. The one-time transport migration completed and Onward Control now observes the new authority.

## Accepted evidence
Core 13 tests, generic transport 12 and business profile 9 passed at the cutover baseline. Real MCP handshake (15 tools), direct Codex reply, same-task continuation, native restart/resume, knowledge-tool lookup and actual Runtime exec marker passed. A real scoped Onward/WhatsApp-origin acceptance returned `MOUSTACHI_ONWARD_ACCEPTANCE_OK`; after migration the new WhatsApp Bridge was connected/paired/group-configured and a real outbound smoke succeeded. New analytics/business API reads also passed. Acceptance records live outside Git in the private home's acceptance directory.

## Important boundaries and blockers
Native Codex login/cache/history still uses the existing provider-owned account. Profile Moustachi databases/memory/skills/workspaces are separate; no claim of isolated native accounts or an OS sandbox. Credential copying was not performed. Legacy Runtime/Codex native histories are retained rather than imported/deleted. Rollback definitions are preserved under `%LOCALAPPDATA%\Moustachi\rollback\cutover-20260916-165213`; do not re-enable legacy services while the new Bridge owns the shared WhatsApp auth directory.

The one-time transport migration has completed: 27 rolling group messages, 29 processed IDs and 3 pre-existing outbound receipts were preserved/imported while provider-owned WhatsApp auth stayed in place. Full old ACP history was not imported. Onward Control source observation was rewired and release `20260916T172235-moustachi-cutover` is deployed. Automated dreaming/LLM consolidation, automatic isolated delegation, broad multi-chat/Personal WhatsApp routing and public connector registration are not delivered as live features. Candidate/proposal, evidence-based promotion, reversible curation, parent-task lineage, native compaction ownership and context inspection are implemented building blocks, not claims of autonomous learning in production.

Production activation gates are complete. Do not rerun `configure-migration` or `migrate-transport` against the live config. The Windows service installer now avoids PowerShell-5 native-stderr termination and supports `-DiscardOutput`; the installed WhatsApp runner discards raw transport output because upstream libsignal can print Signal session objects. A pre-mitigation WhatsApp `service.log` remains because local tool safety blocked deletion; it stopped growing and is not an authority. Future work should start from the live service state in `docs/OPERATIONS.md`, preserve rollback data, and keep code changes scoped/validated/pushed.
