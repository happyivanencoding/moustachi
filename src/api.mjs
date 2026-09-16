import {randomUUID} from 'node:crypto';
import {skillIndex} from './context.mjs';
import {requiredString} from './util.mjs';

export function authorizeOperation(client,op,profileId,origin){
  if(!client.operations.includes('*')&&!client.operations.includes(op))throw Object.assign(new Error('Operation is not allowed for this client.'),{status:403});
  if(profileId&&!client.profiles.includes(profileId))throw Object.assign(new Error('Profile is not allowed for this client.'),{status:403});
  if(origin&&!client.origins?.includes(origin))throw Object.assign(new Error('Origin is not allowed for this client.'),{status:403});
}
export async function dispatch(engine,client,body){
  const {op}=body;if(typeof op!=='string')throw Object.assign(new Error('op is required.'),{status:400});
  const profileId=body.profileId||(client.profiles.length===1?client.profiles[0]:undefined);
  authorizeOperation(client,op,profileId,op==='submit'?(body.origin||'owner'):null);
  if(op==='status'){const status=engine.status();return {...status,profiles:status.profiles.filter(p=>client.profiles.includes(p.id))};}
  if(!profileId)throw Object.assign(new Error('Select a profileId.'),{status:400});
  const p=engine.profile(profileId),store=p.store;
  switch(op){
    case 'submit':return engine.submit({...body,profileId});
    case 'get':return engine.get(profileId,requiredString(body.runId,'runId',100));
    case 'cancel':return engine.cancel(profileId,requiredString(body.runId,'runId',100));
    case 'retry':{
      const old=store.run(requiredString(body.runId,'runId',100));if(!['failed','cancelled','interrupted'].includes(old.status))throw new Error('Only a failed/cancelled/interrupted run can be retried.');
      authorizeOperation(client,'submit',profileId,old.input.origin);
      return engine.submit({...old.input,profileId,taskId:old.task_id,externalId:`retry:${old.id}:${randomUUID()}`});
    }
    case 'observe':{
      requiredString(body.channel,'channel',200);requiredString(body.messageId,'messageId',300);requiredString(body.message,'message',20000);
      store.message({channel:body.channel,sourceId:`transport:${body.channel}:${body.messageId}`,role:body.role==='assistant'?'assistant':'user',content:body.message,createdAt:Number(body.timestamp)||Date.now()});return {ok:true};
    }
    case 'bind':{requiredString(body.channel,'channel',200);requiredString(body.messageId,'messageId',300);requiredString(body.taskId,'taskId',100);store.bind(body.channel,body.messageId,body.taskId);return {ok:true};}
    case 'history.search':return {matches:store.search(body.query,body.limit)};
    case 'history.read':{
      const row=store.one('SELECT * FROM messages WHERE id=?',Number(body.messageId));if(!row)throw Object.assign(new Error('Message not found.'),{status:404});
      const offset=Math.max(0,Number(body.offset)||0),limit=Math.min(20000,Math.max(100,Number(body.limit)||8000));const text=row.content;
      return {...row,content:text.slice(offset,offset+limit),offset,nextOffset:offset+limit<text.length?offset+limit:null,totalChars:text.length};
    }
    case 'history.events':{store.run(body.runId);const after=Math.max(0,Number(body.after)||0),limit=Math.min(100,Math.max(1,Number(body.limit)||30));const rows=store.all('SELECT id,kind,data,created_at FROM events WHERE run_id=? AND id>? ORDER BY id LIMIT ?',body.runId,after,limit+1);return {events:rows.slice(0,limit).map(r=>({...r,data:JSON.parse(r.data)})),hasMore:rows.length>limit,nextAfter:rows[Math.min(limit,rows.length)-1]?.id||after};}
    case 'memory.read':return {memory:store.memorySnapshot(),limits:{memory:2200,user:1375}};
    case 'memory.write':return store.memoryWrite(body);
    case 'propose':return store.propose(body);
    case 'proposals.list':return {proposals:store.all("SELECT * FROM proposals WHERE status='pending' ORDER BY created_at DESC LIMIT 100")};
    case 'proposals.resolve':{
      const row=store.one('SELECT * FROM proposals WHERE id=?',body.id);if(!row||row.status!=='pending')throw new Error('Pending proposal not found.');
      if(body.accept){if(row.kind==='memory')store.memoryWrite({target:body.target||'memory',action:'add',content:row.content,source:`proposal:${row.id};run:${row.source_run}`});else store.skillCreate({id:requiredString(body.skillId,'skillId',100),description:requiredString(body.description,'description',500),content:row.content});}
      store.exec('UPDATE proposals SET status=? WHERE id=?',body.accept?'accepted':'rejected',row.id);return {ok:true};
    }
    case 'skills.list':return {skills:skillIndex(store,engine.definition(profileId))};
    case 'skills.read':return engine.skillRead(profileId,requiredString(body.id,'id',100));
    case 'skills.create':return store.skillCreate(body);
    case 'skills.report':return store.skillReport(body);
    case 'skills.curate':return store.curate({dryRun:body.dryRun!==false});
    case 'skills.state':{
      if(!['active','archived','candidate'].includes(body.state))throw new Error('Unsupported skill state.');const row=store.one('SELECT * FROM skills WHERE id=?',body.id);if(!row)throw new Error('Only local skills may be changed; packaged skills belong to their repository.');
      store.exec('UPDATE skills SET state=?,pinned=? WHERE id=?',body.state,body.pinned===undefined?row.pinned:body.pinned?1:0,body.id);store.exec('INSERT INTO skill_events(skill_id,action,data,created_at) VALUES(?,?,?,?)',body.id,'manual_state',JSON.stringify({before:row.state,after:body.state}),Date.now());return {ok:true};
    }
    case 'skills.merge':{
      if(body.from===body.into)throw new Error('Select two different skills.');const a=store.one('SELECT * FROM skills WHERE id=?',body.from),b=store.one('SELECT * FROM skills WHERE id=?',body.into);if(!a||!b||a.pinned)throw new Error('Both local skills must exist and source must not be pinned.');requiredString(body.content,'merged content',24000);
      store.transaction(()=>{store.exec('INSERT INTO skill_events(skill_id,action,data,created_at) VALUES(?,?,?,?)',b.id,'merge',JSON.stringify({from:a,into:b}),Date.now());store.exec('UPDATE skills SET content=? WHERE id=?',body.content,b.id);store.exec("UPDATE skills SET state='archived',merged_into=? WHERE id=?",b.id,a.id);});return {ok:true,archived:a.id,into:b.id};
    }
    case 'context':{const run=store.run(body.runId);return {runId:run.id,inspector:run.inspector,lineage:store.all('SELECT id,parent_id,agent_id,turns,chars,closed,created_at,last_used_at FROM sessions WHERE task_id=? ORDER BY created_at',run.task_id)};}
    case 'tasks.list':return {tasks:store.all('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50')};
    case 'permissions.list':return {permissions:engine.permissions(profileId)};
    case 'permissions.resolve':return engine.resolvePermission(profileId,body.permissionId,body.optionId);
    default:throw Object.assign(new Error('Unknown API operation.'),{status:400});
  }
}
