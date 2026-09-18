# Authority and migration baseline — 2026-09-16
## Observed before changing anything
- Onward policy: `C:\dev\onward\DEEP_CONTEXT_HANDOFF_FINAL.md`.
- Running JavaScript: `%LOCALAPPDATA%\OnwardOps\bin` and `whatsapp-bridge\app`.
- Maintained source: JPilot worktree `C:\dev\onward-moustachi-recovery-20260916`, branch `fix/moustachi-auth-recovery-20260916`, commit `dc5b94c`. Its history contains original outbox integration `34ce749`, SSH relay `97be301`, bridge `c65b2ba`, pairing `5b28a63`, rolling context `9c56e6a`, analytics `6bc8e12`, full streamed answer `c8b8f04`, founder policy `a1e33d1`, credentials recovery `dc5b94c`.
- `C:\dev\onward-v1-mobile-web-20260912` is a latency experiment branch, NOT the source authority merely because it sounds like production.
- Existing scheduled tasks: Onward Ops Agent (minute polling), Onward WhatsApp Bridge (persistent). They run hidden through WScript. Health on loopback 39177 was connected/paired/groupConfigured=true. The earlier handoff's pending re-pair statement is stale; actual pairing succeeded 2026-09-16 14:10 Paris.
- Old worker owns one Runtime wrapper session in OnwardOps/state.json. A Runtime child process hosts Codex ACP; this is the dependency being removed. Runtime wrapper IDs are NOT ACP-native thread IDs.
- Onward V1 still owns the durable feedback ledger/API, analysis/delivery leases and application analytics. Do not relocate the product database or redeploy Web to update this agent.
- server-infra owns existing SSH relay transport/deployment. It and onward-control have unrelated dirty work: leave untouched.
## Target authorities
| Concern | Authority |
|---|---|
| Identity, task/session routing, history, bounded memory, learning lifecycle, ACP, public MCP/API | moustachi |
| Generic WhatsApp bridge, pairing/credentials/reconnect/message delivery | moustachi/transport-whatsapp |
| Onward persona, founder policy, analytics enrichment, feedback polling | moustachi-onward |
| Actual Onward user/feedback/analytics data | Onward Web API / application storage |
| Shell/files/browser/UI/LSP | independent Runtime, optional tool provider |
| Tunnel/DNS/service deployment/secret references | deployment config / server-infra |
| Development/fallback only | AgentDock |
Runtime, Web and infra binaries are not changed by this extraction. Old source/history/auth remain for rollback until the new live path is verified.
