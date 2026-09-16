# Operations — 2026-09-16

## Production authority after cutover

Onward production now uses the independent Moustachi stack:

- `Moustachi Core`: Enabled/Running on loopback `39178`, source `C:\dev\moustachi\src\server.mjs`.
- `Moustachi WhatsApp`: Enabled/Running on loopback `39177`, source `C:\dev\moustachi\transport-whatsapp\bridge.mjs`, profile `onward`.
- `Moustachi Onward Ops`: Enabled periodic worker from `C:\dev\moustachi-onward\src\worker.mjs`; recent no-work cycles exit `0`.
- Legacy `Onward WhatsApp Bridge`: Disabled.
- Legacy `Onward Ops Agent`: Disabled.

Core state/config is `%LOCALAPPDATA%\Moustachi`; business config is `%LOCALAPPDATA%\MoustachiOnward`. Runtime is an optional computer MCP provider and no longer owns Moustachi ACP sessions. AgentDock is not a production dependency. The legacy repair worktree `C:\dev\onward-moustachi-recovery-20260916` at `dc5b94c` is retained only as historical/rollback source.

## Cutover evidence

Before stopping legacy services, a real scoped request used client `whatsapp`, profile `onward`, origin `whatsapp`, channel `onward-founders`. It passed Onward profile preparation and direct Codex ACP, returning exactly `MOUSTACHI_ONWARD_ACCEPTANCE_OK` with no tool/state mutation.

Rollback material was exported before cutover to `%LOCALAPPDATA%\Moustachi\rollback\cutover-20260916-165213`.

The legacy worker had no active child process. The legacy WhatsApp schedule was disabled/stopped; its surviving Node child was explicitly stopped before the new transport touched the shared auth directory. `scripts/migrate-transport.mjs` then completed once and wrote `%LOCALAPPDATA%\Moustachi\transports\whatsapp\migration.json`, preserving/importing:

- 27 rolling founders-group context messages;
- 29 processed message IDs;
- 3 existing outbound receipts.

The provider-owned WhatsApp auth directory is referenced in place, not copied. Full legacy ACP/Codex history was not imported or deleted.

The new Bridge verified authenticated health with `connected=true`, `paired=true`, `groupConfigured=true`. A real idempotent `/send` smoke delivered the cutover notice and returned WhatsApp message id `3EB0ADEEB06B8F686724A9`. No synthetic tester/outbox record was created. The real outbox had no pending event, and the new worker's direct business API probe plus scheduled no-work cycle succeeded.

No second external human account was available for a live inbound `@Moustachi` during cutover. Trigger/routing is covered by transport tests; the real Onward-origin ACP acceptance plus real WhatsApp connection/outbound send validate both production sides without manufacturing a founder instruction.

## Windows service runner

The generic installer uses invisible WScript -> PowerShell -> Node. PowerShell 5 can promote native stderr to PowerShell ErrorRecords, so generated runners use `$ErrorActionPreference='Continue'` and trust the Node exit code.

`install-windows-service.ps1` now supports `-DiscardOutput`. Use it for `Moustachi WhatsApp`: the current Baileys/libsignal dependency can print Signal session objects directly through `console.*`, bypassing the Bridge's silent Pino logger. Production health is therefore observed through authenticated `/health` plus Task Scheduler. The installed WhatsApp runner already discards raw output.

A pre-mitigation `%LOCALAPPDATA%\Moustachi\services\whatsapp\service.log` remains because local tool safety blocked deletion. It is not an authority and stopped growing after discard-output activation. Do not publish or parse it; remove it through normal local administration when permitted. Do not delete WhatsApp auth/state directories.

## Onward Control

`Onward Control Observer` now reads Moustachi Core/WhatsApp authenticated health and the three new task names rather than old OnwardOps authority. It delivered the new observation successfully. Control release `20260916T172235-moustachi-cutover` is deployed and `onward-control-web-1` is healthy. No Onward V1 product code was deployed.

## Validation baseline

- Core: 13 focused tests.
- Generic WhatsApp transport: 12 focused tests at cutover baseline.
- Onward profile/worker: 9 focused tests.
- Earlier real MCP handshake (15 tools), direct Codex reply, same-task continuation, native restart/resume, knowledge-tool lookup and Runtime exec marker remain accepted.

Private acceptance artifacts live under Moustachi home rather than Git.

## Rollback

The legacy task XML/config/state snapshot remains in the rollback directory above. To roll back:

1. Stop/disable `Moustachi Onward Ops`.
2. Stop/disable `Moustachi WhatsApp` and ensure its Node child exits.
3. Ensure port `39177` is free and no Baileys process owns the shared auth directory.
4. Restore/enable legacy `Onward WhatsApp Bridge` and `Onward Ops Agent` definitions as needed.
5. Verify legacy authenticated health.

Never reset/copy the WhatsApp login for an ordinary service-path failure. Keep old source/auth/native history through the rollback period.
