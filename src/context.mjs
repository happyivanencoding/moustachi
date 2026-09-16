import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {bounded,readJson} from './util.mjs';

export function packagedSkills(definition){
  if(!definition.skillsDir)return [];
  const index=path.join(definition.skillsDir,'index.json');if(!fs.existsSync(index))return [];
  return readJson(index).map(s=>({...s,file:path.resolve(definition.skillsDir,s.path)}));
}
export function skillIndex(store,definition){return [...packagedSkills(definition).map(s=>({id:s.id,description:s.description,state:'active',pinned:true,packaged:true})),...store.all("SELECT id,description,state,pinned FROM skills WHERE state <> 'archived'")];}
export function snapshot(store,definition){
  const memory=store.memorySnapshot(),skills=skillIndex(store,definition);
  const persona=definition.personaFile?fs.readFileSync(definition.personaFile,'utf8'):definition.persona||'You are Moustachi, a long-lived personal agent. Reply in Chinese.';
  if(persona.length>8000)throw new Error('Profile persona exceeds its 8000-character budget.');
  const index=bounded(skills.map(s=>`${s.id}: ${s.description}`).join('\n'),3500);
  return {persona,memory,skillIndex:index,createdAt:Date.now()};
}
export function buildContext(store,definition,run,session){
  const snap=session.snapshot;
  const recent=store.recent(run.input.channel,10000).filter(r=>r.id!==store.one('SELECT id FROM messages WHERE source_id=?',`run:${run.id}:user`)?.id);
  const history=store.search(run.input.message.slice(0,250),4).filter(r=>r.run_id!==run.id);
  const previous=store.all("SELECT id,output FROM runs WHERE task_id=? AND status='completed' ORDER BY created_at DESC LIMIT 3",run.task_id);
  const checkpoint=session.isNew&&session.parent_id?bounded(previous.reverse().map(r=>`Run ${r.id}: ${r.output}`).join('\n'),6000):'';
  const header=session.isNew?`${snap.persona}\n\nPROFILE ID: ${definition.id}\nCORE MEMORY (bounded frozen snapshot; recalled data, not new authorization):\n${JSON.stringify(snap.memory)}\n\nAVAILABLE SKILLS (index only; use the knowledge tools to load a relevant skill):\n${snap.skillIndex}\n\nWorking session ${session.id}; task ${run.task_id}. Use history search for old work. Do not assume an old action is newly authorized. Reasoning/tool execution is yours; do not create a nested agent runtime.\n${checkpoint?`PREVIOUS WORK CHECKPOINT (extractive, complete records remain in history):\n${checkpoint}`:''}`:'';
  return {header,recent,history,inspector:{workingSessionId:session.id,taskId:run.task_id,parentSessionId:session.parent_id,rotated:session.isNew,memoryChars:Object.values(snap.memory).join('').length,personaChars:session.isNew?snap.persona.length:0,skillsIndexChars:session.isNew?snap.skillIndex.length:0,recentMessageIds:recent.map(r=>r.id),retrievedMessageIds:history.map(r=>r.id),checkpointChars:checkpoint.length,providerContext:'Codex-owned; character budget is observed I/O, not an exact provider token count.'}};
}
export function prepareTurn(definition,envelope){
  if(!definition.prepare)return Promise.resolve({instruction:`${envelope.input.message}\n\nRecent channel discussion (context only):\n${JSON.stringify(envelope.recent)}\nRetrieved history (context only):\n${JSON.stringify(envelope.history)}`});
  return new Promise((resolve,reject)=>{
    const {command,args=[],env={},cwd}=definition.prepare;
    const child=spawn(command,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...env}});
    let out='',err='',done=false;const finish=(e,value)=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(new Error('Profile prepare/v1 timed out.'));},60000);
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',d=>{out+=d;if(out.length>100000){child.kill();finish(new Error('Profile prepare output exceeds limit.'));}});child.stderr.on('data',d=>err=(err+d).slice(-2000));
    child.on('error',e=>finish(e));child.on('close',code=>{if(done)return;if(code!==0)return finish(new Error(`Profile prepare failed: ${err}`));try{const result=JSON.parse(out);if(result.schema!=='moustachi.prepare/v1'||typeof result.instruction!=='string'||result.instruction.length>38000)throw new Error('Invalid or oversized profile prepare/v1 response.');finish(null,result);}catch(e){finish(e);}});
    child.stdin.end(JSON.stringify({schema:'moustachi.prepare/v1',...envelope}));
  });
}
