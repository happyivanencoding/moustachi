import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {Readable,Writable} from 'node:stream';
import {createRequire} from 'node:module';
import {client,ndJsonStream} from '@agentclientprotocol/sdk';
const require=createRequire(import.meta.url);
const adapterEntry=require.resolve('@agentclientprotocol/codex-acp');

/** One direct ACP client per Profile. No Runtime/AgentDock ACP RPCs. */
export class CodexAcp {
  constructor(config,{onUpdate=()=>{},onPermission=async()=>({outcome:{outcome:'cancelled'}})}={}){
    this.config=config;this.onUpdate=onUpdate;this.onPermission=onPermission;this.loaded=new Set();this.active=null;this.loading=false;this.closed=false;
  }
  async connect(){
    if(this.agent&&!this.closed)return this.hello;
    this.closed=false;
    if(this.config.codexHome)fs.mkdirSync(this.config.codexHome,{recursive:true});
    let resolveReady,rejectReady;const ready=new Promise((yes,no)=>{resolveReady=yes;rejectReady=no;});
    this.child=spawn(this.config.command||process.execPath,this.config.args||[adapterEntry],{
      cwd:this.config.cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],
      env:{...process.env,...(this.config.codexHome?{CODEX_HOME:this.config.codexHome}:{}),INITIAL_AGENT_MODE:'read-only',NO_BROWSER:'1',CODEX_CONFIG:JSON.stringify(this.config.codexConfig||{}),...this.config.env},
    });
    this.stderr='';this.child.stderr.setEncoding('utf8');this.child.stderr.on('data',d=>{this.stderr=(this.stderr+d).slice(-4000);});
    this.child.on('error',rejectReady);
    this.child.on('exit',code=>{this.closed=true;this.agent=null;this.loaded.clear();rejectReady(new Error(`ACP adapter exited (${code}). ${this.stderr.slice(-1000)}`));});
    this.connection=client({name:'moustachi',version:'0.1.0'})
      .onConnect(({agent})=>{this.agent=agent;resolveReady(agent);})
      .onNotification('session/update',({params})=>{
        // session/load replays old content. Never re-send replayed answers as this turn's response.
        if(this.loading||!this.active||params.sessionId!==this.active.sessionId)return;
        const update=params.update;
        if(update.sessionUpdate==='agent_thought_chunk')return;
        if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text')this.active.chunks.push(update.content.text);
        this.onUpdate(update);
      })
      .onRequest('session/request_permission',({params})=>this.active?this.onPermission(params):{outcome:{outcome:'cancelled'}})
      .connect(ndJsonStream(Writable.toWeb(this.child.stdin),Readable.toWeb(this.child.stdout)));
    try{
      await this.limit(ready,20000,'ACP connection');
      this.hello=await this.limit(this.agent.request('initialize',{protocolVersion:1,clientInfo:{name:'moustachi',version:'0.1.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}}),30000,'ACP initialize');
      return this.hello;
    }catch(e){this.close();throw e;}
  }
  async limit(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${ms}ms.`)),ms);})]);}finally{clearTimeout(timer);}}
  async session({agentId,cwd,mcpServers=[],additionalDirectories=[],mode='read-only'}){
    await this.connect();const caps=this.hello.agentCapabilities||{};
    if(this.loaded.size>=4&&!this.loaded.has(agentId)){
      if(caps.sessionCapabilities?.close){for(const id of this.loaded){await this.agent.request('session/close',{sessionId:id});}this.loaded.clear();}
      else{this.close();await this.connect();}
    }
    const actualCaps=this.hello.agentCapabilities||{};
    const params={cwd,mcpServers,...(actualCaps.sessionCapabilities?.additionalDirectories&&additionalDirectories.length?{additionalDirectories}:{})};
    if(agentId&&!this.loaded.has(agentId)){
      this.loading=true;
      try{
        if(actualCaps.sessionCapabilities?.resume)await this.limit(this.agent.request('session/resume',{...params,sessionId:agentId}),60000,'ACP resume');
        else if(actualCaps.loadSession)await this.limit(this.agent.request('session/load',{...params,sessionId:agentId}),60000,'ACP load');
        else throw new Error('Agent does not support persisted sessions; start a new working session explicitly.');
      }finally{this.loading=false;}
    }else if(!agentId){const created=await this.limit(this.agent.request('session/new',params),60000,'ACP new session');agentId=created.sessionId;}
    this.loaded.add(agentId);
    await this.limit(this.agent.request('session/set_mode',{sessionId:agentId,modeId:mode}),20000,'ACP set mode');
    return agentId;
  }
  async prompt(sessionId,text,timeoutMs=600000){
    if(this.active)throw new Error('ACP profile already has an active prompt.');
    this.active={sessionId,chunks:[]};
    try{
      const response=await this.limit(this.agent.request('session/prompt',{sessionId,prompt:[{type:'text',text}]}),timeoutMs,'ACP prompt');
      const message=this.active.chunks.join('').trim();
      if(response.stopReason==='cancelled')throw Object.assign(new Error('ACP turn cancelled.'),{cancelled:true});
      if(!message)throw new Error(`ACP completed without a public answer (${response.stopReason}).`);
      return {message,stopReason:response.stopReason};
    }catch(e){
      if(/timed out/.test(e.message)){await this.cancel();this.close();}
      throw e;
    }finally{this.active=null;}
  }
  async cancel(){if(this.agent&&this.active){try{await this.agent.notify('session/cancel',{sessionId:this.active.sessionId});}catch{}}}
  close(){
    this.closed=true;try{this.connection?.close();}catch{}
    if(this.child&&!this.child.killed&&this.child.exitCode===null){
      // Kill only this owned adapter tree; Codex grandchildren must not survive a timed-out turn.
      if(process.platform==='win32')spawnSync('taskkill',['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});
      else this.child.kill('SIGTERM');
    }
    this.agent=null;this.loaded.clear();
  }
}
