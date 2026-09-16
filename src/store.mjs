import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {ENTRY_DELIMITER,MEMORY_LIMITS,uniqueMemoryMatch,quoteFtsTokens,skillLifecycle} from './vendor/hermes-primitives.mjs';
import {bounded,requiredString} from './util.mjs';

export class Store {
  constructor(root){
    fs.mkdirSync(root,{recursive:true});this.root=root;this.db=new DatabaseSync(path.join(root,'history.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES tasks(id),title TEXT NOT NULL,channel TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),parent_id TEXT REFERENCES sessions(id),agent_id TEXT,snapshot TEXT NOT NULL DEFAULT '{}',turns INTEGER NOT NULL DEFAULT 0,chars INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_used_at INTEGER NOT NULL,closed INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS sessions_task ON sessions(task_id,created_at);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),session_id TEXT REFERENCES sessions(id),external_id TEXT UNIQUE,status TEXT NOT NULL,input TEXT NOT NULL,output TEXT NOT NULL DEFAULT '',error TEXT,inspector TEXT,result TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS runs_task ON runs(task_id,created_at);
      CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,task_id TEXT,run_id TEXT,channel TEXT NOT NULL,source_id TEXT UNIQUE,role TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_channel ON messages(channel,created_at);
      CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(content,content='messages',content_rowid='id');
      CREATE VIRTUAL TABLE IF NOT EXISTS message_trigram USING fts5(content,content='messages',content_rowid='id',tokenize='trigram');
      CREATE TRIGGER IF NOT EXISTS message_insert AFTER INSERT ON messages BEGIN
        INSERT INTO message_fts(rowid,content) VALUES(new.id,new.content);
        INSERT INTO message_trigram(rowid,content) VALUES(new.id,new.content);
      END;
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),kind TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id);
      CREATE TABLE IF NOT EXISTS bindings(channel TEXT NOT NULL,message_id TEXT NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id),PRIMARY KEY(channel,message_id));
      CREATE TABLE IF NOT EXISTS memory(target TEXT NOT NULL,ordinal INTEGER NOT NULL,content TEXT NOT NULL,source TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(target,ordinal));
      CREATE TABLE IF NOT EXISTS memory_revisions(id INTEGER PRIMARY KEY,target TEXT NOT NULL,before_text TEXT NOT NULL,after_text TEXT NOT NULL,source TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,kind TEXT NOT NULL,content TEXT NOT NULL,source_run TEXT NOT NULL REFERENCES runs(id),status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY,description TEXT NOT NULL,content TEXT NOT NULL,state TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_used_at INTEGER,merged_into TEXT);
      CREATE TABLE IF NOT EXISTS skill_uses(skill_id TEXT NOT NULL REFERENCES skills(id),task_id TEXT NOT NULL REFERENCES tasks(id),run_id TEXT NOT NULL REFERENCES runs(id),evidence TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(skill_id,task_id));
      CREATE TABLE IF NOT EXISTS skill_events(id INTEGER PRIMARY KEY,skill_id TEXT NOT NULL,action TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL);
    `);
  }
  one(sql,...args){return this.db.prepare(sql).get(...args);}
  all(sql,...args){return this.db.prepare(sql).all(...args);}
  exec(sql,...args){return this.db.prepare(sql).run(...args);}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  recover(){return this.exec("UPDATE runs SET status='interrupted',error='Core restarted during this turn; explicit retry required.',updated_at=? WHERE status IN ('running','awaiting_permission')",Date.now()).changes;}
  run(id){const row=this.one('SELECT * FROM runs WHERE id=?',id);if(!row)throw Object.assign(new Error('Run not found in this profile.'),{status:404});return {...row,input:JSON.parse(row.input),inspector:row.inspector?JSON.parse(row.inspector):null,result:row.result?JSON.parse(row.result):null};}
  submit(input){
    if(input.externalId){const old=this.one('SELECT id FROM runs WHERE external_id=?',`${input.channel}:${input.externalId}`);if(old)return this.run(old.id);}
    return this.transaction(()=>{
      let taskId=input.taskId;
      if(!taskId&&input.replyTo)taskId=this.one('SELECT task_id FROM bindings WHERE channel=? AND message_id=?',input.channel,input.replyTo)?.task_id;
      if(taskId&&!this.one('SELECT id FROM tasks WHERE id=?',taskId))throw Object.assign(new Error('Task not found in this profile.'),{status:404});
      if(!taskId){taskId=randomUUID();this.exec('INSERT INTO tasks VALUES(?,?,?,?,?)',taskId,input.parentTaskId||null,input.message.slice(0,120),input.channel,Date.now());}
      const id=randomUUID(),now=Date.now();
      this.exec('INSERT INTO runs(id,task_id,external_id,status,input,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,taskId,input.externalId?`${input.channel}:${input.externalId}`:null,'queued',JSON.stringify(input),now,now);
      if(input.externalId)this.bind(input.channel,input.externalId,taskId);
      this.message({taskId,runId:id,channel:input.channel,role:'user',content:input.message,sourceId:`run:${id}:user`});
      return this.run(id);
    });
  }
  bind(channel,messageId,taskId){if(!this.one('SELECT id FROM tasks WHERE id=?',taskId))throw new Error('Unknown task.');this.exec('INSERT OR IGNORE INTO bindings VALUES(?,?,?)',channel,messageId,taskId);}
  message({taskId=null,runId=null,channel,sourceId=null,role,content,createdAt=Date.now()}){this.exec('INSERT OR IGNORE INTO messages(task_id,run_id,channel,source_id,role,content,created_at) VALUES(?,?,?,?,?,?,?)',taskId,runId,channel,sourceId,role,String(content),createdAt);}
  recent(channel,maxChars=10000){const rows=this.all('SELECT id,role,content,created_at FROM messages WHERE channel=? ORDER BY id DESC LIMIT 30',channel);const out=[];let n=0;for(const r of rows){const text=bounded(r.content,2500);if(n+text.length>maxChars)break;out.unshift({...r,content:text});n+=text.length;}return out;}
  search(query,limit=8){
    query=requiredString(query,'query',500);limit=Math.max(1,Math.min(Number(limit)||8,30));let hits=[];
    const match=quoteFtsTokens(query);
    if(match){try{hits=this.all(`SELECT m.id,m.task_id,m.run_id,m.role,m.channel,substr(m.content,1,800) AS snippet,m.created_at FROM message_fts f JOIN messages m ON m.id=f.rowid WHERE message_fts MATCH ? ORDER BY rank LIMIT ?`,match,limit);}catch(e){if(!/fts5|syntax/i.test(e.message))throw e;}}
    if(hits.length===0&&query.length>=3){hits=this.all(`SELECT m.id,m.task_id,m.run_id,m.role,m.channel,substr(m.content,max(1,instr(m.content,?)-100),800) AS snippet,m.created_at FROM message_trigram f JOIN messages m ON m.id=f.rowid WHERE message_trigram MATCH ? ORDER BY rank LIMIT ?`,query,'"'+query.replaceAll('"','""')+'"',limit);}
    if(hits.length===0){const literal=query.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_');hits=this.all(`SELECT id,task_id,run_id,role,channel,substr(content,max(1,instr(content,?)-100),800) AS snippet,created_at FROM messages WHERE content LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ?`,query,`%${literal}%`,limit);}
    return hits;
  }
  memorySnapshot(){return Object.fromEntries(Object.keys(MEMORY_LIMITS).map(target=>[target,this.all('SELECT content FROM memory WHERE target=? ORDER BY ordinal',target).map(r=>r.content).join(ENTRY_DELIMITER)]));}
  memoryWrite({target='memory',action,content='',oldText='',source}){
    if(!(target in MEMORY_LIMITS))throw new Error('Unknown memory target.');requiredString(source,'source',500);
    return this.transaction(()=>{
      const entries=this.all('SELECT content FROM memory WHERE target=? ORDER BY ordinal',target).map(r=>r.content);const before=entries.join(ENTRY_DELIMITER);
      if(action==='add'){content=requiredString(content,'content',MEMORY_LIMITS[target]);if(!entries.includes(content))entries.push(content);}
      else if(action==='replace'||action==='remove'){requiredString(oldText,'oldText',MEMORY_LIMITS[target]);const index=uniqueMemoryMatch(entries,oldText);if(index<0)throw new Error('Memory oldText not found.');if(action==='remove')entries.splice(index,1);else entries[index]=requiredString(content,'content',MEMORY_LIMITS[target]);}
      else throw new Error('Use add, replace or remove.');
      const after=entries.join(ENTRY_DELIMITER);if(after.length>MEMORY_LIMITS[target])throw new Error(`Memory capacity exceeded: ${after.length}/${MEMORY_LIMITS[target]}. Consolidate explicitly; nothing was changed.`);
      this.exec('DELETE FROM memory WHERE target=?',target);entries.forEach((text,i)=>this.exec('INSERT INTO memory VALUES(?,?,?,?,?)',target,i,text,source,Date.now()));
      this.exec('INSERT INTO memory_revisions(target,before_text,after_text,source,created_at) VALUES(?,?,?,?,?)',target,before,after,source,Date.now());return {target,chars:after.length,limit:MEMORY_LIMITS[target],content:after};
    });
  }
  event(runId,kind,data){this.exec('INSERT INTO events(run_id,kind,data,created_at) VALUES(?,?,?,?)',runId,kind,JSON.stringify(data),Date.now());}
  chooseSession(taskId,snapshot,{maxTurns=8,maxChars=100000,idleMs=6*3600000}={}){
    let row=this.one('SELECT * FROM sessions WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',taskId);const now=Date.now();
    if(row&&!row.closed&&row.turns<maxTurns&&row.chars<maxChars&&now-row.last_used_at<idleMs&&JSON.parse(row.snapshot).origin===snapshot.origin)return {...row,isNew:false,snapshot:JSON.parse(row.snapshot)};
    const parent=row?.id||null;if(parent)this.exec('UPDATE sessions SET closed=1 WHERE id=?',parent);
    const id=randomUUID();this.exec('INSERT INTO sessions(id,task_id,parent_id,snapshot,created_at,last_used_at) VALUES(?,?,?,?,?,?)',id,taskId,parent,JSON.stringify(snapshot),now,now);
    return {...this.one('SELECT * FROM sessions WHERE id=?',id),isNew:true,snapshot};
  }
  complete(runId,output,result){const run=this.run(runId);this.transaction(()=>{this.exec("UPDATE runs SET status='completed',output=?,result=?,updated_at=? WHERE id=?",output,JSON.stringify(result),Date.now(),runId);this.message({taskId:run.task_id,runId,channel:run.input.channel,role:'assistant',content:output,sourceId:`run:${runId}:assistant`});});}
  propose({kind,content,sourceRun}){if(!['memory','skill'].includes(kind))throw new Error('Unknown proposal kind.');this.run(sourceRun);requiredString(content,'content',12000);const id=randomUUID();this.exec('INSERT INTO proposals(id,kind,content,source_run,created_at) VALUES(?,?,?,?,?)',id,kind,content,sourceRun,Date.now());return {id,status:'pending'};}
  skillCreate({id,description,content,pinned=false}){requiredString(id,'skill id',100);requiredString(description,'description',500);requiredString(content,'skill content',24000);this.exec('INSERT INTO skills VALUES(?,?,?,?,?,?,?,?)',id,description,content,pinned?'active':'candidate',pinned?1:0,Date.now(),null,null);return {id,state:pinned?'active':'candidate'};}
  skillReport({id,runId,evidence}){
    requiredString(evidence,'evidence',3000);const run=this.run(runId);if(run.status!=='completed')throw new Error('Skill reuse requires a completed task turn and explicit evidence.');
    return this.transaction(()=>{const s=this.one('SELECT * FROM skills WHERE id=?',id);if(!s)throw new Error('Skill not found.');this.exec('INSERT OR IGNORE INTO skill_uses VALUES(?,?,?,?,?)',id,run.task_id,runId,evidence,Date.now());const uses=this.one('SELECT count(*) AS n FROM skill_uses WHERE skill_id=?',id).n;const state=s.state==='candidate'&&uses>=2?'active':s.state==='stale'?'active':s.state;this.exec('UPDATE skills SET state=?,last_used_at=? WHERE id=?',state,Date.now(),id);return {id,state,successfulDistinctTasks:uses};});
  }
  curate({dryRun=true,now=Date.now()}={}){const changes=[];for(const s of this.all('SELECT * FROM skills')){const next=skillLifecycle(s,now);if(next!==s.state){changes.push({id:s.id,from:s.state,to:next});if(!dryRun){this.exec('UPDATE skills SET state=? WHERE id=?',next,s.id);this.exec('INSERT INTO skill_events(skill_id,action,data,created_at) VALUES(?,?,?,?)',s.id,'curate',JSON.stringify({from:s.state,to:next}),now);}}}return {dryRun,changes};}
  close(){this.db.close();}
}
