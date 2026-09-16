// Selective JS ports from NousResearch/hermes-agent 784d5c3.
// Copyright (c) 2025 Nous Research. MIT: ../../LICENSES/hermes-MIT.txt.
// Sources: tools/memory_tool_store.py, hermes_state_search.py, agent/curator.py.
export const ENTRY_DELIMITER = '\n§\n';
export const MEMORY_LIMITS = Object.freeze({memory: 2200, user: 1375});
export function uniqueMemoryMatch(entries, oldText) {
  const matches = entries.map((text,index)=>({text,index})).filter(e=>e.text.includes(oldText));
  if (new Set(matches.map(e=>e.text)).size > 1) throw new Error('Memory replacement is ambiguous; use a unique oldText.');
  return matches[0]?.index ?? -1;
}
export function quoteFtsTokens(query) {
  // Literal tokens only: unlike Hermes' advanced query UI, this API does not expose Boolean operators.
  return String(query).trim().split(/\s+/u).filter(Boolean).map(t=>'"'+t.replaceAll('"','""')+'"').join(' AND ');
}
export function skillLifecycle(row, now=Date.now(), staleDays=14, archiveDays=30) {
  if (row.pinned || row.state==='candidate' || row.state==='archived') return row.state;
  const anchor = row.last_used_at || row.created_at || now;
  const ageDays = (now-anchor)/86400000;
  if (ageDays>=archiveDays) return 'archived';
  if (ageDays>=staleDays) return 'stale';
  return row.state==='stale' ? 'active' : row.state;
}
