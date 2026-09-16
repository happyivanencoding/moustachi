# Hermes research and source attribution
Reference: NousResearch/hermes-agent commit `784d5c3f9c2cb77698d8a9d2e72b1d106a38ea88`, read locally at C:\dev\_reference\hermes-agent on 2026-09-16. MIT, Copyright (c) 2025 Nous Research. License: LICENSES/hermes-MIT.txt.

Actual code examined: tools/memory_tool.py and memory_tool_store.py; hermes_state_fts.py and hermes_state_search.py; agent/context_engine.py, memory_manager.py, curator.py, delegation_context.py; tools/skills_tool.py, code_execution_tool.py; hermes_cli/profiles.py.

Selective JavaScript ports in src/vendor/hermes-primitives.mjs retain attribution: bounded §-delimited memory semantics, unique substring replacement matching, quoted FTS tokens, inactivity-based pinned-safe lifecycle transitions. SQLite transaction/storage integration is Moustachi-owned, not a copy of Hermes' legacy schema repair machinery.

Adopted designs: separate complete history from selected active context; frozen bounded core memory; progressive skill discovery; separate task identity/child lineage; usage-backed reversible curation; no auto-archiving newly observed skills; explicit truncation and retained full artifacts.

Deliberately NOT copied: Hermes AIAgent/provider tool loop, its permission execution runtime, Python session kernels, legacy FTS migration/corruption recovery machinery, or its entire context compressor. Codex already owns native shell/code execution and compaction. Moustachi's session rotation handles long-lived identity boundaries without rewriting Codex transcripts. Delegation is a child task with an explicit parent, not a second permanent bot. No automatic LLM dreaming daemon is enabled; evidence-based proposals/curation are separated from autonomous fact rewriting.

Current FTS uses SQLite FTS5 unicode61 plus trigram; short CJK queries use literal substring fallback. Hermes' optional native CJK extension is not required for this small local deployment. This is not claimed to have Hermes' multi-GB CJK search performance.
