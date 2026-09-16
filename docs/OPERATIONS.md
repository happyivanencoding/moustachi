# Operations — 2026-09-16
## Actual deployment
`Moustachi Core` is a running Windows Task Scheduler service. WScript launches PowerShell with an invisible window, and the runner starts `C:\dev\moustachi\src\server.mjs`. It does not run as a Runtime/AgentDock command-session child. At-logon plus minute recovery triggers use IgnoreNew; no second core should acquire port 39178. Log: `%LOCALAPPDATA%\Moustachi\services\core\service.log`.

`Moustachi WhatsApp` and `Moustachi Onward Ops` are registered **disabled**. The production `Onward WhatsApp Bridge` and `Onward Ops Agent` tasks remain active. Existing WhatsApp uses port 39177 and its original OnwardOps state. Production source remains JPilot repair worktree dc5b94c until a later successful cutover entry explicitly supersedes it.

Core config/state: `%LOCALAPPDATA%\Moustachi`. Business config staged at `%LOCALAPPDATA%\MoustachiOnward`. The staged business bridge-token reference is finalized by the unexecuted transport migration; do not enable that worker prematurely.

## Acceptance actually completed
- Core: 12 targeted tests; transport: 12; companion: 9 (33 total before standalone-initializer test is added).
- Actual MCP HTTP handshake and 15 tools.
- Native direct ACP answer and same-task continuation.
- Native session restored after stopping the temporary core and starting the scheduled core.
- Codex actually called the profile knowledge skill tool and Runtime exec_command, producing the expected marker.
- New business analytics adapter read real product aggregate successfully.
Private acceptance records: `acceptance/direct-acp.json`, `acceptance/restore-tools.json` under Moustachi home. No WhatsApp test message was sent.

## Activation gates still open
Live Onward-origin acceptance was blocked by the tool safety check and was not retried through a different identity/connector. Reading legacy Runtime session metadata was also blocked; original files remain untouched. Login-file copying was blocked earlier and was not performed.

Before cutover, obtain a successful authorized Onward path verification. Then ensure the old worker has no active turn, export existing scheduled-task definitions, disable the two old task schedules, and stop the old bridge. **Never run two Baileys processes against the same auth directory.** Only then run the companion's `scripts/migrate-transport.mjs`, which copies non-login rolling state/receipts, imports known group messages through the core API and references the original provider-owned auth directory. It has not been executed in this task.

Start the new bridge, verify connected/paired/group/routing, and only then enable the new outbox worker. Verify real claim/complete/release/delivery behavior without manufacturing tester events. Close the obsolete Runtime ACP session only after the new live path is confirmed. Do not delete old code, auth, state or native history before a successful retained rollback period.

The original rolling state most recently contained 27 context messages, 29 processed IDs and 3 outgoing receipts. These counts are observations, NOT a claim they have been migrated. No full old ACP transcript import was completed.

Onward Control's existing observer was not changed/redeployed in this task. Its observation sources must be checked during the later cutover; do not paper over old status by writing a second authority state file. The new bridge preserves the existing 39177 health/send field contracts, but that is not a verified dashboard cutover.

## Rollback
Currently no rollback is needed: the old production transport/worker were never disabled. If a later migration fails before acceptance, stop/disable the new transport first, then restore/enable the old task definitions. Preserve any new pending messages before discarding a partially activated transport state. Never reset the WhatsApp login to solve an ordinary service-path failure.
