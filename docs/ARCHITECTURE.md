# Architecture v0.1
Moustachi is a long-lived identity/service, not a second reasoning engine. It speaks ACP v1 directly to the maintained @agentclientprotocol/codex-acp adapter. Codex owns reasoning, tool execution and its own in-session compaction.

ChatGPT -> Moustachi MCP/API -> Profile -> Task -> bounded WorkingSession -> ACP -> Codex
ChatGPT -> Runtime MCP -> computer capabilities
Codex -> optional configured Runtime MCP -> computer capabilities

Profiles have physically separate Moustachi SQLite databases, memory, Skills and workspaces. The installed configuration currently reuses Codex own existing login/native storage; login files are not exported. ACP thread IDs and profile API scopes stay separate, but this is not a separate OS account or separate native CODEX_HOME. A Profile definition is JSON and optionally declares a `prepare/v1` subprocess: JSON stdin -> bounded instruction JSON stdout. No business module is imported into core.

New requests create new tasks unless a task ID or a quoted message binding explicitly selects an existing task. A task's working session rotates on turn/character/idle budgets; parent lineage and an extractive result checkpoint survive. Old conversations remain searchable; raw tool output is stored as events and not re-injected into new sessions. Frozen memory/skill-index snapshots are injected only when a working session starts.

Per-profile queues serialize ACP prompts. Core crash marks in-flight runs interrupted rather than blindly replaying possible mutations. Durable queued requests resume. Client idempotency keys avoid duplicate submits; retries of interrupted/failed tasks are explicit. ACP permissions are surfaced, not silently approved. Profile/channel policy remains explicit; this is trusted-owner orchestration, not an OS security sandbox.

Skills use list/read progressive disclosure. Mere reads never count as successful reuse. Candidates need explicit successful completed-task evidence from distinct tasks before promotion. Pinned package skills never auto-archive; curation is reversible. Memory writes are bounded and provenance-bearing; over-cap writes fail rather than silently dropping old facts. Learning proposals are not silently promoted into permanent facts.

MCP/API never exposes a generic shell/filesystem execution tool. Computer providers are configuration, not imported Runtime or AgentDock modules. Onward-specific enrichment/polling stays behind the prepare and API contracts.
