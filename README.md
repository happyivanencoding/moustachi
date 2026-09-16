# Moustachi
A long-lived personal Agent identity with task-scoped Codex ACP working sessions. Core, business profiles and computer capabilities are independent components—not nested agent runtimes.

## Current delivery: 0.1.0 foundation
The core is implemented and running locally. Official MCP HTTP handshake, direct native Codex ACP, continued tasks, native session restore across a core restart, progressive skill lookup and a real Runtime computer-tool call have passed integration acceptance.
**The existing production WhatsApp/Ops bot has NOT been switched.** Its old services remain active. The new generic transport and Onward adapter are implemented/tested, but activation is deliberately gated on authorized live-channel verification. See `DEEP_CONTEXT_HANDOFF.md` and `docs/OPERATIONS.md`; do not infer cutover from files or disabled tasks existing.

```
ChatGPT / another client -> Moustachi MCP or API -> Profile -> Task -> ACP -> Codex
ChatGPT                 -> Runtime MCP -> computer
Codex                   -> optional Runtime tools -> computer
WhatsApp transport      -> scoped Moustachi API
Business adapter        -> prepare/v1 + scoped API
```

Core owns identities, task routing, bounded memory, SQLite/FTS history, skills, curation, context selection, permissions and direct ACP. It does not import Onward Web, Runtime ACP, AgentDock or an infrastructure business worker. The companion `moustachi-onward` repository contains Onward persona, policy, analytics enrichment and the outbox worker.

## Run independently
Node.js 24.15+ is required (native SQLite/FTS5). Install Codex's normal supported login separately; this project does not export login files.

```sh
npm ci
node scripts/init-personal.mjs
npm start
```

The default state directory is `%LOCALAPPDATA%\Moustachi` on Windows. A different `MOUSTACHI_HOME` is supported. The personal initializer requires neither an Onward checkout nor OnwardOps. Computer MCP providers are optional configuration, not a runtime prerequisite.

`npm test` runs core tests. `transport-whatsapp` has its own locked dependencies and `npm test`. Run `npm ci` inside that directory only when using WhatsApp. A business-profile upgrade does not install this transport or deploy any Web application.

## Interfaces
- Authenticated loopback `POST /v1`: versioned operation envelope.
- Authenticated `POST /mcp`: stateless MCP Streamable HTTP.
- `npm run mcp`: MCP stdio client facade for the same running core.
- `node scripts/call.mjs`: local owner status utility.

See `docs/API.md` for scopes and lifecycle. Nothing exposes a generic shell as a Moustachi API tool. Submit returns a run ID, not an assertion that work completed.

## Context and learning
Each Profile has a separate Moustachi SQLite database, memory, skills, task results and workspace. New requests create tasks unless an explicit task ID or bound quoted message selects an existing one. Working sessions rotate at 8 turns, 100,000 observed I/O characters, or 6 hours idle by default. Authorization-origin changes also rotate sessions.

Core memory is capped at 2,200 characters; user memory at 1,375. Complete public messages/tool events remain in storage; selected context is bounded. History uses FTS5 plus trigram/short-CJK fallback. Skill discovery loads only an index initially. Evidence-backed distinct completed-task reuse promotes accepted candidates. Curation is reversible and protects pinned skills.

There is no second LLM tool loop, no automatic infinite resume, and no autonomous dreaming daemon in this release. Compaction inside a native session remains Codex-owned. The current installed configuration shares Codex's native provider login/storage; it does **not** claim separate native accounts or an OS security sandbox.

## Provenance and operations
- `docs/AUTHORITY_MAP.md`: observed source/runtime authority and original JPilot commits.
- `docs/ARCHITECTURE.md`: module boundaries.
- `docs/HERMES_REUSE.md`: inspected Hermes source, selected ports and deliberate omissions.
- `docs/LOGIN_BOUNDARY.md`: actual native-login isolation boundary.
- `docs/OPERATIONS.md`: deployed state and activation gates.

New/extracted JPilot code: AGPL-3.0-only. Selectively ported Hermes primitives retain Nous Research's MIT notice in `LICENSES/hermes-MIT.txt` and source attribution. Original JPilot history is preserved in its repository rather than pretending this extraction rewrites that history.
