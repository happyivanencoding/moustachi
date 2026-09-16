# Generic WhatsApp transport
Extracted from running JPilot dc5b94c, preserving Baileys 7.0.0-rc14, configured-group boundaries, triggers, rolling context, split delivery, idempotency, port-before-auth startup, paired credential recovery, remote pairing and reconnect. No business worker or Runtime ACP remains.

Install separately with npm ci. Run node bridge.mjs --home <state-directory>. config.json declares profileId/channel/coreUrl/coreTokenFile/port/tokenFile/optional authDir/groupJid/groupLabel. A profile-scoped core credential enforces the routing boundary.

New login: --pair; or --pair-web --pair-token <one-time-secret> --pair-expires-at <epoch-ms> through separately managed pairing infrastructure. Stop the normal transport first; never run two Baileys processes against one authDir. Existing provider auth can remain in place via a config reference, without copying/exporting credentials.

All observed group messages enter a durable spool. Only an explicit name/@ mention submits a model task. New mentions start tasks; quoted bound messages continue a task. Full replies split without silent truncation. Receipts prevent repeated sends after core/binding failures, but a crash between a network send and receipt write can still duplicate delivery: this is not exactly-once network delivery.
