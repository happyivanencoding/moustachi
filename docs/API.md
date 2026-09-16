# Narrow API and MCP contract v1
All requests are authenticated against named local client scopes. Every client has an explicit Profile allowlist, operation allowlist and (for task submission) permitted origin list. Credentials are held outside Git; request bodies never select a more privileged client.

`POST /v1` receives an object such as:
```json
{"op":"submit","profileId":"personal","origin":"owner","channel":"owner","message":"A concrete task","externalId":"optional-client-idempotency-key"}
```
The response contains `id` (run), `task_id`, `status`. Poll `{op:"get", profileId, runId}`. Terminal states are completed, failed, cancelled, interrupted. Startup recovers queued work but marks in-flight work interrupted instead of blindly replaying potential mutations. `retry` is explicit and preserves the task with a new run ID.

New request -> new task by default. Supply taskId for continuation. `bind` ties a transport message ID to a task; a later submit with replyTo selects that task. parentTaskId creates child-task lineage within the same Profile. It is not an automatic multi-agent delegation loop.

Read operations: status, get, tasks.list, history.search, history.read (paged), history.events (paged), memory.read, skills.list/read, context, permissions.list, proposals.list.
Write operations: submit/cancel/retry, observe/bind, memory.write, propose/proposals.resolve, skills.create/report/curate/state/merge, permissions.resolve. State/permission writes require corresponding client scopes. API operation names are not automatically MCP tool names.

The MCP surface intentionally offers 15 tools: status, submit, task, cancel, history search/read, memory read/write, skills list/read, proposal, successful skill reuse report, context inspector, permissions list/resolve. The knowledge client injected into Codex exposes only profile-scoped knowledge operations—not task submission, general shell or approval escalation.

Permission outcomes use the actual ACP option IDs. A pending permission keeps its run in awaiting_permission until the owner explicitly chooses an advertised option, cancels, or the turn times out. Tester feedback cannot approve a permission. Historical group context cannot authorize a new mutation.

Memory write requires source provenance. Over-capacity writes fail atomically. Proposals require a source run and do not silently become permanent facts. Accepted skill candidates need two successful reports from distinct completed tasks to promote; reads alone do not count. Curation uses 14-day stale / 30-day archive thresholds, leaves candidates/pinned skills alone and never deletes their content. There is no periodic curator/dreamer scheduled in 0.1.0.

Context inspector reports selected message IDs, lineage and character budgets. It does not expose hidden reasoning or pretend observed character counts are exact provider token counts. Results retain complete public answers; summary checkpoints are explicitly extractive.

HTTP MCP has been verified on localhost. A public Tunnel and a separate ChatGPT connector have not been provisioned by this task. Expose only through a separately authorized deployment with the scoped authentication preserved; never expose an unauthenticated owner endpoint.
