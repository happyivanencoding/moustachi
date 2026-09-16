import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from './store.mjs';
import {CodexAcp} from './acp.mjs';
import {snapshot,buildContext,prepareTurn,packagedSkills,skillIndex} from './context.mjs';
import {bounded,profileId,readJson,requiredString,writeJson} from './util.mjs';

export class Engine {
  constructor(home,config,{Acp=CodexAcp}={}){this.home=home;this.config=config;this.Acp=Acp;this.profiles=new Map();this.stopping=false;}
  definition(id){profileId(id);const entry=this.config.profiles[id];if(!entry)throw Object.assign(new Error('Profile is not configured.'),{status:404});const def=entry.definitionFile?readJson(entry.definitionFile):entry;const resolved={...def,...entry,id};const base=entry.definitionFile?path.dirname(entry.definitionFile):this.home;for(const key of ['personaFile','skillsDir'])if(resolved[key])resolved[key]=path.resolve(base,resolved[key]);if(resolved.prepare)resolved.prepare={...resolved.prepare,cwd:path.resolve(base,resolved.prepare.cwd||'.')};return resolved;}
  profile(id){
    const def=this.definition(id);let p=this.profiles.get(id);if(p)return p;
    const root=path.join(this.home,'profiles',id);fs.mkdirSync(path.join(root,'workspace'),{recursive:true});
    p={id,root,store:new Store(root),busy:false,currentRun:null,cancelRequested:false,permissions:new Map(),acp:null};p.store.recover();
    this.profiles.set(id,p);return p;
  }
  start(){for(const id of Object.keys(this.config.profiles)){this.profile(id);void this.pump(id);}}
  submit(input){const id=profileId(input.profileId),def=this.definition(id);requiredString(input.message,'message');const origin=input.origin||'owner';if(!['owner','whatsapp','feedback','maintenance'].includes(origin))throw new Error('Unknown origin.');const channel=String(input.channel||origin);requiredString(channel,'channel',200);const p=this.profile(id);const run=p.store.submit({...input,origin,channel});void this.pump(id);return this.publicRun(run);}
  publicRun(run){const {input,...rest}=run;return {...rest,message:input.message,origin:input.origin,channel:input.channel};}
  get(id,runId){return this.publicRun(this.profile(id).store.run(runId));}
  async pump(id){
    const p=this.profile(id);if(p.busy||this.stopping)return;p.busy=true;
    try{while(!this.stopping){const row=p.store.one("SELECT id FROM runs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1");if(!row)break;await this.execute(p,p.store.run(row.id));}}
    finally{p.busy=false;p.currentRun=null;}
  }
  resolveMcp(def,p,origin){
    const knowledge={name:'moustachi-knowledge',command:process.execPath,args:[fileURLToPath(new URL('./mcp-stdio.mjs',import.meta.url)),'--home',this.home,'--profile',p.id],env:[]};
    // Automated product feedback does not receive the computer MCP. It has supplied evidence and read-only Codex mode.
    const providers=origin==='feedback'?[]:(def.mcpServers||[]).map(s=>{const {headersFromFiles,envFromFiles,...server}=s;if(headersFromFiles)server.headers=[...(s.headers||[]),...Object.entries(headersFromFiles).map(([name,file])=>({name,value:fs.readFileSync(file,'utf8').trim()}))];if(envFromFiles)server.env=[...(s.env||[]),...Object.entries(envFromFiles).map(([name,file])=>({name,value:fs.readFileSync(file,'utf8').trim()}))];return server;});
    return [knowledge,...providers];
  }
  ensureAcp(p,def){
    if(p.acp&&!p.acp.closed)return p.acp;
    p.acp=new this.Acp({cwd:path.join(p.root,'workspace'),codexHome:def.useExistingCodexLogin?undefined:path.join(p.root,'codex'),codexConfig:def.codexConfig||{},...def.acp},{
      onUpdate:update=>{if(!p.currentRun)return;p.store.event(p.currentRun,update.sessionUpdate,update);p.observedChars+=(JSON.stringify(update).length);},
      onPermission:params=>this.permission(p,params),
    });return p.acp;
  }
  async permission(p,params){
    const run=p.store.run(p.currentRun);const id=randomUUID();
    if(p.cancelRequested||this.stopping)return {outcome:{outcome:'cancelled'}};
    if(run.input.origin==='feedback'){p.store.event(run.id,'permission_rejected',{id,reason:'Automated feedback cannot authorize tools.',options:params.options,toolCall:params.toolCall});return {outcome:{outcome:'cancelled'}};}
    p.store.event(run.id,'permission_requested',{id,options:params.options,toolCall:params.toolCall});p.store.exec("UPDATE runs SET status='awaiting_permission',updated_at=? WHERE id=?",Date.now(),run.id);
    return new Promise(resolve=>p.permissions.set(id,{runId:run.id,params,resolve}));
  }
  permissions(id){return [...this.profile(id).permissions.entries()].map(([id,p])=>({id,runId:p.runId,options:p.params.options,toolCall:p.params.toolCall}));}
  resolvePermission(id,permissionId,optionId){const p=this.profile(id),pending=p.permissions.get(permissionId);if(!pending)throw new Error('Pending permission not found.');const option=pending.params.options.find(o=>o.optionId===optionId);if(!option)throw new Error('Choose one of the advertised permission options.');p.permissions.delete(permissionId);p.store.event(pending.runId,'permission_decided',{permissionId,optionId});p.store.exec("UPDATE runs SET status='running',updated_at=? WHERE id=?",Date.now(),pending.runId);pending.resolve({outcome:{outcome:'selected',optionId}});return {ok:true};}
  async execute(p,run){
    const def=this.definition(p.id),store=p.store;p.currentRun=run.id;p.observedChars=0;p.cancelRequested=false;
    store.exec("UPDATE runs SET status='running',updated_at=? WHERE id=?",Date.now(),run.id);
    let session;
    try{
      const fresh={...snapshot(store,def),origin:run.input.origin};session=store.chooseSession(run.task_id,fresh,def.sessionBudgets);
      const cx=buildContext(store,def,run,session),prepared=await prepareTurn(def,{profileId:p.id,runId:run.id,taskId:run.task_id,input:run.input,recent:cx.recent,history:cx.history});
      if(p.cancelRequested||this.stopping)throw Object.assign(new Error('Cancelled before agent execution.'),{cancelled:true});
      const prompt=[cx.header,`CURRENT RUN: ${run.id}. Task: ${run.task_id}. Origin: ${run.input.origin}.`,prepared.instruction].filter(Boolean).join('\n\n');
      if(prompt.length>52000)throw new Error('Prepared context exceeds 52000 characters; reduce profile context instead of truncating the current request.');
      const inspector={...cx.inspector,promptChars:prompt.length};store.exec('UPDATE runs SET session_id=?,inspector=? WHERE id=?',session.id,JSON.stringify(inspector),run.id);
      const acp=this.ensureAcp(p,def),mode=run.input.origin==='feedback'?'read-only':def.mode||'agent';
      const agentId=await acp.session({agentId:session.agent_id,cwd:path.join(p.root,'workspace'),mcpServers:this.resolveMcp(def,p,run.input.origin),additionalDirectories:def.additionalDirectories||[],mode});
      store.exec('UPDATE sessions SET agent_id=? WHERE id=?',agentId,session.id);
      if(p.cancelRequested||this.stopping)throw Object.assign(new Error('Cancelled before prompt.'),{cancelled:true});
      const result=await acp.prompt(agentId,prompt,def.timeoutMs||600000);
      const saved={schema:'moustachi.result/v1',taskId:run.task_id,workingSessionId:session.id,agentSessionId:agentId,runId:run.id,stopReason:result.stopReason,summary:bounded(result.message,5000),summaryKind:'extractive',fullAnswerStored:true,toolEventsStored:true,finishedAt:new Date().toISOString()};
      store.complete(run.id,result.message,saved);writeJson(path.join(p.root,'results',`${run.id}.json`),{...saved,answer:result.message});
      store.exec('UPDATE sessions SET turns=turns+1,chars=chars+?,last_used_at=? WHERE id=?',prompt.length+p.observedChars,Date.now(),session.id);
    }catch(e){
      const status=(e.cancelled||p.cancelRequested)?'cancelled':'failed';store.exec('UPDATE runs SET status=?,error=?,updated_at=? WHERE id=?',status,String(e.message),Date.now(),run.id);store.event(run.id,'turn_error',{message:e.message});
      if(session)store.exec('UPDATE sessions SET closed=1 WHERE id=?',session.id);
    }finally{
      for(const [id,permission]of p.permissions){if(permission.runId===run.id){permission.resolve({outcome:{outcome:'cancelled'}});p.permissions.delete(id);}}
      p.currentRun=null;
    }
  }
  async cancel(id,runId){const p=this.profile(id),run=p.store.run(runId);if(run.status==='queued'){p.store.exec("UPDATE runs SET status='cancelled',updated_at=? WHERE id=?",Date.now(),runId);return {ok:true};}if(p.currentRun!==runId)throw new Error('Run is not active.');p.cancelRequested=true;for(const [key,v]of p.permissions){v.resolve({outcome:{outcome:'cancelled'}});p.permissions.delete(key);}await p.acp?.cancel();const timer=setTimeout(()=>{if(p.currentRun===runId){p.acp?.close();}},5000);timer.unref();return {ok:true};}
  skillRead(id,skillId){const p=this.profile(id),packaged=packagedSkills(this.definition(id)).find(s=>s.id===skillId);if(packaged)return {id:skillId,description:packaged.description,content:fs.readFileSync(packaged.file,'utf8'),state:'active',pinned:true,packaged:true};const row=p.store.one('SELECT * FROM skills WHERE id=?',skillId);if(!row)throw new Error('Skill not found in this profile.');return row;}
  status(){return {service:'moustachi',version:'0.1.0',pid:process.pid,profiles:[...this.profiles.values()].map(p=>({id:p.id,busy:p.busy,activeRun:p.currentRun,acpPid:p.acp?.child?.pid||null,queued:p.store.one("SELECT count(*) n FROM runs WHERE status='queued'").n,pendingPermissions:p.permissions.size}))};}
  async close(){this.stopping=true;for(const p of this.profiles.values()){for(const v of p.permissions.values())v.resolve({outcome:{outcome:'cancelled'}});await p.acp?.cancel();p.acp?.close();}while([...this.profiles.values()].some(p=>p.busy))await new Promise(r=>setTimeout(r,50));for(const p of this.profiles.values())p.store.close();}
}
