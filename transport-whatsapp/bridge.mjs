#!/usr/bin/env node
import {MoustachiClient} from '../src/client.mjs';
import {MessageSpool} from './spool.mjs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {timingSafeEqual} from 'node:crypto';
import readline from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import {
  addChatContext,
  addProcessedId,
  classifyChatTrigger,
  extractMentionedJids,
  extractWhatsAppText,
  chatRef,
  recentChatContext,
  sanitizeGroupLabel,
  shouldObserveChatMessage,
  splitWhatsAppMessage,
} from './bridge-core.mjs';
import {restorePairedCredsBackup,snapshotPairedCredsBackup} from './auth-resilience.mjs';

const argv=process.argv.slice(2);
const hasFlag=name=>argv.includes(name);
const argValue=(name,fallback='')=>{const i=argv.indexOf(name);return i>=0&&argv[i+1]?argv[i+1]:fallback;};
const pairWebMode=hasFlag('--pair-web');
const pairMode=hasFlag('--pair')||pairWebMode;
const smokeMode=hasFlag('--smoke');
const home=path.resolve(argValue('--home',process.env.MOUSTACHI_WHATSAPP_HOME?.trim()||path.join(process.env.LOCALAPPDATA||os.homedir(),'Moustachi','transports','whatsapp')));
const bridgeRoot=home;
const configFile=path.join(bridgeRoot,'config.json');
const stateFile=path.join(bridgeRoot,'state.json');

const tmpDir=path.join(home,'tmp');
const readJson=(file,fallback={})=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const writeJsonAtomic=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,'utf8');fs.renameSync(tmp,file);};
const config=readJson(configFile,{});
const authDir=path.resolve(config.authDir||path.join(bridgeRoot,'auth'));
const port=Math.max(1024,Math.min(Number(argValue('--port',process.env.MOUSTACHI_WHATSAPP_PORT||config.port))||39177,65535));
const tokenFile=path.resolve(process.env.MOUSTACHI_WHATSAPP_TOKEN_FILE?.trim()||config.tokenFile||path.join(home,'secrets','whatsapp-bridge'));

const logger=pino({level:process.env.MOUSTACHI_WHATSAPP_DEBUG==='1'?'debug':'silent'});
const pairToken=String(argValue('--pair-token','')).trim();
const pairExpiresAt=Number(argValue('--pair-expires-at',''))||0;

fs.mkdirSync(bridgeRoot,{recursive:true});fs.mkdirSync(authDir,{recursive:true});fs.mkdirSync(tmpDir,{recursive:true});

let bridgeState=readJson(stateFile,{schemaVersion:1,processedIds:[]});
let processedIds=new Set(bridgeState.processedIds||[]);
let sock=null,connected=false,paired=false,starting=false,reconnectTimer=null,pairSelectionRunning=false;
let sendQueue=Promise.resolve();
let pairQrDataUrl='',pairQrUpdatedAt='',pairGroups=[],pairPhase=pairWebMode?'starting':'idle',pairError='',pairComplete=false;

if(pairWebMode&&pairToken.length<43)throw new Error('Remote pairing requires a high-entropy pair token.');
if(pairWebMode&&(!Number.isFinite(pairExpiresAt)||pairExpiresAt<=Date.now()))throw new Error('Remote pairing expiry is missing or already expired.');

function pairExpired(){return pairWebMode&&Date.now()>=pairExpiresAt;}
function pairAuthorized(req){
 if(!pairWebMode||pairExpired())return false;
 const header=String(req.headers.authorization||'');if(!header.startsWith('Bearer '))return false;
 const supplied=header.slice(7).trim(),a=Buffer.from(pairToken),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);
}
function pairPublicState(){
 return {
  ok:true,
  phase:pairExpired()?'expired':pairPhase,
  expiresAt:pairExpiresAt||null,
  qrDataUrl:pairExpired()?'':pairQrDataUrl,
  qrUpdatedAt:pairQrUpdatedAt||null,
  connected,
  paired,
  groups:pairGroups.map(group=>({id:group.id,label:group.label,participants:group.participants})),
  complete:pairComplete,
  error:pairError||'',
 };
}
function html(res,status,body){
 res.writeHead(status,{
  'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff','x-frame-options':'DENY',
  'content-security-policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
 });
 res.end(body);
}
const pairingPage=()=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moustachi · WhatsApp pairing</title><style>
html,body{margin:0;min-height:100%;background:#f4f0e6;color:#17382f;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{display:grid;place-items:center;padding:28px;box-sizing:border-box}.card{width:min(520px,100%);background:#fffdf7;border:1px solid rgba(23,56,47,.14);border-radius:28px;padding:28px;box-shadow:0 24px 70px rgba(23,56,47,.12)}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b7d74}.brand{font-family:Georgia,"Times New Roman",serif;font-size:40px;line-height:1;margin:8px 0 12px}.muted{color:#63736c;line-height:1.55}.status{margin:20px 0;padding:14px 16px;border-radius:16px;background:#eef3ed}.qr{display:block;width:min(340px,100%);height:auto;margin:18px auto;border-radius:18px}.groups{display:grid;gap:10px;margin-top:16px}.group{width:100%;border:1px solid rgba(23,56,47,.18);background:#fff;border-radius:16px;padding:14px 16px;text-align:left;color:#17382f;font:inherit;cursor:pointer}.group:hover{background:#f4f7f2}.small{font-size:12px;color:#7a8982;margin-top:4px}.done{font-family:Georgia,"Times New Roman",serif;font-size:28px}.hidden{display:none}</style></head><body><main class="card"><div class="eyebrow">Moustachi transport</div><div class="brand">Moustachi</div><p class="muted">Pair the dedicated WhatsApp account, then choose the chats group. This page expires automatically and does not display WhatsApp credentials.</p><div id="status" class="status">Preparing secure pairing…</div><img id="qr" class="qr hidden" alt="WhatsApp pairing QR"><div id="groups" class="groups"></div><p id="footer" class="small"></p></main><script src="/pair/app.js"></script></body></html>`;
const pairingScript=()=>`(()=>{let token=(location.hash||'').slice(1);if(token){history.replaceState(null,'','/pair')}const status=document.getElementById('status'),qr=document.getElementById('qr'),groups=document.getElementById('groups'),footer=document.getElementById('footer');const h=()=>({Authorization:'Bearer '+token,'Content-Type':'application/json'});const esc=s=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));async function poll(){if(!token){status.textContent='This pairing link is missing its one-time token.';return}try{let r=await fetch('/pair/state',{headers:h(),cache:'no-store'});if(r.status===401||r.status===410){status.textContent='This pairing link is invalid or expired.';return}let s=await r.json();if(s.phase==='expired'){status.textContent='This pairing link has expired.';qr.classList.add('hidden');groups.innerHTML='';return}let seconds=Math.max(0,Math.ceil((s.expiresAt-Date.now())/1000));footer.textContent='Expires in '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');if(s.complete){status.innerHTML='<div class="done">Moustachi is connected.</div><div class="small">The background bridge is starting. You can close this page.</div>';qr.classList.add('hidden');groups.innerHTML='';return}if(s.error){status.textContent=s.error}if(s.qrDataUrl&&!s.connected){status.textContent='Open WhatsApp → Linked devices → Link a device, then scan this QR.';qr.src=s.qrDataUrl;qr.classList.remove('hidden')}if(s.connected){qr.classList.add('hidden');status.textContent=s.groups.length?'WhatsApp connected. Choose the chats group:':'WhatsApp connected. Loading groups…'}if(s.groups.length){groups.innerHTML=s.groups.map(g=>'<button class="group" data-id="'+esc(g.id)+'"><strong>'+esc(g.label)+'</strong><div class="small">'+g.participants+' members</div></button>').join('');for(const b of groups.querySelectorAll('button'))b.onclick=async()=>{for(const x of groups.querySelectorAll('button'))x.disabled=true;status.textContent='Saving chats group…';let rr=await fetch('/pair/select',{method:'POST',headers:h(),body:JSON.stringify({groupId:b.dataset.id})});if(!rr.ok){status.textContent='Could not save this group. Please retry.';for(const x of groups.querySelectorAll('button'))x.disabled=false}else{status.textContent='Moustachi is connected.'}}}setTimeout(poll,1000)}catch(e){status.textContent='Pairing service is temporarily unreachable. Retrying…';setTimeout(poll,1500)}}poll()})();`;

function persistChatContext({messageId,senderRef,text,timestamp}){
 bridgeState=addChatContext(bridgeState,{id:messageId,senderRef,text,timestamp});
 bridgeState=addProcessedId(bridgeState,messageId,800);
 processedIds=new Set(bridgeState.processedIds||[]);
 writeJsonAtomic(stateFile,bridgeState);
}
function rememberedOutbound(key){return key&&bridgeState?.outbound?.[key]||null;}
function persistOutbound(key,messageIds){
 if(!key)return;
 const outbound={...(bridgeState.outbound||{}),[key]:{messageIds,at:new Date().toISOString()}};
 const keys=Object.keys(outbound);for(const old of keys.slice(0,Math.max(0,keys.length-300)))delete outbound[old];
 bridgeState={...bridgeState,outbound};writeJsonAtomic(stateFile,bridgeState);
}
function localToken(){try{return fs.readFileSync(tokenFile,'utf8').trim();}catch{return '';}}
function authorized(req){
 const expected=localToken(),header=String(req.headers.authorization||'');if(expected.length<32||!header.startsWith('Bearer '))return false;
 const supplied=header.slice(7).trim(),a=Buffer.from(expected),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);
}
function json(res,status,value){const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body)});res.end(body);}
async function requestJson(req,max=16000){
 let body='';for await(const chunk of req){body+=chunk;if(body.length>max)throw Object.assign(new Error('Request too large.'),{status:413});}
 try{return JSON.parse(body||'{}');}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
}
function enqueueSend(fn){const next=sendQueue.then(fn,fn);sendQueue=next.catch(()=>{});return next;}
async function sendText(message,quoted){
 if(!connected||!sock)throw Object.assign(new Error('WhatsApp is not connected.'),{status:503});
 const groupJid=String(config.groupJid||'').trim();if(!groupJid)throw Object.assign(new Error('Chats group is not configured.'),{status:503});
 const ids=[];
 for(const chunk of splitWhatsAppMessage(message)){
  const sent=await enqueueSend(()=>Promise.race([
   sock.sendMessage(groupJid,{text:chunk},quoted?{quoted}:{}),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('WhatsApp send timed out.')),30000)),
  ]));
  if(sent?.key?.id)ids.push(sent.key.id);
 }
 return ids;
}
function selfJids(){return [sock?.user?.id,sock?.user?.lid].filter(Boolean).map(value=>jidNormalizedUser(value));}

const coreClient=new MoustachiClient({url:config.coreUrl||'http://127.0.0.1:39178',tokenFile:config.coreTokenFile||path.join(home,'core-token'),profileId:config.profileId,origin:'whatsapp'});
const channel=String(config.channel||'whatsapp-group');
const spool=new MessageSpool({getState:()=>bridgeState,updateState:fn=>{bridgeState=fn(bridgeState);writeJsonAtomic(stateFile,bridgeState);},call:(op,args)=>coreClient.call(op,args),send:sendText,channel,log:error=>console.error(`[moustachi-whatsapp] delivery queue: ${String(error.message||error).slice(0,400)}`)});
function replyMessageId(message){const content=message?.extendedTextMessage||message?.imageMessage||message?.videoMessage||message?.documentMessage;if(content?.contextInfo?.stanzaId)return String(content.contextInfo.stanzaId);for(const key of ['ephemeralMessage','viewOnceMessage','viewOnceMessageV2'])if(message?.[key]?.message)return replyMessageId(message[key].message);return '';}
function onMessages({messages,type}){
 if(type!=='notify'&&type!=='append')return;
 for(const msg of messages||[]){
  if(!msg?.message)continue;
  const remoteJid=String(msg.key?.remoteJid||''),messageId=String(msg.key?.id||''),text=extractWhatsAppText(msg.message),mentionedJids=extractMentionedJids(msg.message);
  const observed=shouldObserveChatMessage({remoteJid,configuredGroupJid:String(config.groupJid||''),fromMe:Boolean(msg.key?.fromMe),messageId,processedIds,text});if(!observed.observe)continue;
  const senderRef=chatRef(String(msg.key?.participant||remoteJid||'')),timestamp=Number(msg.messageTimestamp)*1000||Date.now(),trigger=classifyChatTrigger({text,mentionedJids,selfJids:selfJids()});
  // Context, dedupe and durable intent commit together. A core outage cannot discard a mention.
  bridgeState=addChatContext(bridgeState,{id:messageId,senderRef,text,timestamp});bridgeState=addProcessedId(bridgeState,messageId,800);
  bridgeState={...bridgeState,incomingSpool:[...(bridgeState.incomingSpool||[]),{id:messageId,text,timestamp,senderRef,request:trigger.triggered?trigger.message:null,replyTo:replyMessageId(msg.message),groupLabel:sanitizeGroupLabel(config.groupLabel||'Configured group'),quoted:{key:msg.key,message:{conversation:text}}}]};
  processedIds=new Set(bridgeState.processedIds||[]);writeJsonAtomic(stateFile,bridgeState);console.log(JSON.stringify({event:'group_message_recorded',messageId,triggered:trigger.triggered}));
 }
 void spool.drain();
}
async function loadChatsGroups(){
 let groups={};
 for(let attempt=0;attempt<5;attempt++){
  try{groups=await sock.groupFetchAllParticipating();if(Object.keys(groups||{}).length)break;}
  catch(error){pairError=String(error?.message||error).slice(0,300);}
  await new Promise(r=>setTimeout(r,1200));
 }
 const choices=Object.values(groups||{}).map(group=>({id:group.id,label:sanitizeGroupLabel(group.subject||'Unnamed group'),participants:Array.isArray(group.participants)?group.participants.length:0})).sort((a,b)=>a.label.localeCompare(b.label));
 if(!choices.length)throw new Error('No WhatsApp groups were returned for this account.');
 return choices;
}
function saveChatsGroup(selected){
 config.groupJid=selected.id;config.groupLabel=selected.label;config.pairedAt=new Date().toISOString();
 writeJsonAtomic(configFile,config);
 pairComplete=true;pairPhase='complete';pairGroups=[];pairQrDataUrl='';pairError='';
}
async function selectChatsGroup(){
 if(pairSelectionRunning||!sock)return;pairSelectionRunning=true;
 try{
  const choices=await loadChatsGroups();
  console.log('\n可用 WhatsApp 群：');choices.forEach((group,index)=>console.log(`  ${index+1}. ${group.label} (${group.participants} members)`));
  const rl=readline.createInterface({input,output});let selected=null;
  try{while(!selected){const answer=(await rl.question('\n请选择此 transport 绑定的群编号: ')).trim();const index=Number(answer)-1;if(Number.isInteger(index)&&choices[index])selected=choices[index];else console.log('编号无效，请重试。');}}finally{rl.close();}
  saveChatsGroup(selected);
  console.log(`\n已选择 chats 群：${selected.label}`);console.log('Moustachi WhatsApp Bridge 配对完成。后台服务现在可以自动启动。');
  setTimeout(()=>process.exit(0),1200);
 }finally{pairSelectionRunning=false;}
}
async function connectWhatsApp(){
 if(smokeMode||starting)return;starting=true;
 try{
  const restored=restorePairedCredsBackup(authDir);if(restored.restored)console.warn('[moustachi-whatsapp] restored paired credentials from local backup');
  const {state,saveCreds}=await useMultiFileAuthState(authDir);paired=Boolean(state.creds?.registered||state.creds?.me?.id);
  if(!pairMode&&!paired){console.error('[moustachi-whatsapp] WhatsApp 尚未配对。请按 transport README 使用 --pair 配对。');setTimeout(()=>process.exit(22),100);return;}
  const persistCreds=async()=>{
   await saveCreds();
   paired=Boolean(state.creds?.registered||state.creds?.me?.id);
   if(paired)snapshotPairedCredsBackup(authDir);
  };
  let version;try{version=(await fetchLatestBaileysVersion()).version;}catch{}
  sock=makeWASocket({...(version?{version}:{}),auth:state,logger,printQRInTerminal:false,browser:['Moustachi','Chrome','120.0'],syncFullHistory:false,markOnlineOnConnect:false,getMessage:async()=>({conversation:''})});
  sock.ev.on('creds.update',()=>{void persistCreds().catch(error=>console.error(`[moustachi-whatsapp] credential save failed: ${String(error?.message||error).slice(0,300)}`));});
  sock.ev.on('messages.upsert',onMessages);
  sock.ev.on('connection.update',update=>{
   if(update.qr&&pairMode){
    pairPhase='qr';pairError='';pairQrUpdatedAt=new Date().toISOString();
    if(pairWebMode){void QRCode.toDataURL(update.qr,{errorCorrectionLevel:'M',margin:2,width:420}).then(value=>{pairQrDataUrl=value;}).catch(error=>{pairError=`QR render failed: ${String(error?.message||error).slice(0,180)}`;});}
    else{console.log('\n请用 Moustachi 的 WhatsApp 账号扫码：\n');qrcode.generate(update.qr,{small:true});console.log('\n等待扫码…\n');}
   }
   if(update.connection==='open'){
    connected=true;paired=true;pairQrDataUrl='';pairPhase='connected';console.log('[moustachi-whatsapp] connected');
    void persistCreds().catch(error=>console.error(`[moustachi-whatsapp] credential snapshot failed: ${String(error?.message||error).slice(0,300)}`));
    if(pairWebMode){void loadChatsGroups().then(groups=>{pairGroups=groups;pairPhase='groups';pairError='';}).catch(error=>{pairError=String(error?.message||error).slice(0,300);pairPhase='connected';});}
    else if(pairMode)void selectChatsGroup();
   }
   if(update.connection==='close'){
    connected=false;const reason=Number(update.lastDisconnect?.error?.output?.statusCode||update.lastDisconnect?.error?.data?.statusCode||0);
    if(reason===DisconnectReason.loggedOut){paired=false;console.error('[moustachi-whatsapp] WhatsApp 已登出，需要重新扫码。');return;}
    if(reconnectTimer)clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{starting=false;void connectWhatsApp();},reason===515?1000:3000);
   }
  });
 }finally{starting=false;}
}

const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
  if(pairWebMode&&req.method==='GET'&&url.pathname==='/pair')return html(res,200,pairingPage());
  if(pairWebMode&&req.method==='GET'&&url.pathname==='/pair/app.js'){
   const body=pairingScript();res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-length':Buffer.byteLength(body)});return res.end(body);
  }
  if(pairWebMode&&url.pathname==='/pair/state'){
   if(pairExpired())return json(res,410,{error:'Pairing link expired.'});
   if(!pairAuthorized(req))return json(res,401,{error:'Pairing not authorized.'});
   if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
   return json(res,200,pairPublicState());
  }
  if(pairWebMode&&url.pathname==='/pair/select'){
   if(pairExpired())return json(res,410,{error:'Pairing link expired.'});
   if(!pairAuthorized(req))return json(res,401,{error:'Pairing not authorized.'});
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
   const body=await requestJson(req,4000),groupId=String(body.groupId||'').trim();
   const selected=pairGroups.find(group=>group.id===groupId);if(!selected)return json(res,400,{error:'Unknown chats group.'});
   saveChatsGroup(selected);json(res,200,{ok:true,groupLabel:selected.label});setTimeout(()=>process.exit(0),1600);return;
  }
  if(!authorized(req))return json(res,401,{error:'Not authorized.'});
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'moustachi-whatsapp-bridge',profileId:config.profileId||null,pendingObservations:(bridgeState.incomingSpool||[]).length,pendingReplies:Object.keys(bridgeState.pendingTurns||{}).length,connected,paired,groupConfigured:Boolean(config.groupJid),groupLabel:sanitizeGroupLabel(config.groupLabel||'')});
  if(req.method==='POST'&&url.pathname==='/send'){
   if(!connected)return json(res,503,{error:'WhatsApp is not connected.'});
   const body=await requestJson(req,100000),message=String(body.message||'').trim(),idempotencyKey=String(body.idempotencyKey||'').trim().slice(0,260);if(!message)return json(res,400,{error:'Message required.'});
   const previous=rememberedOutbound(idempotencyKey);if(previous)return json(res,200,{ok:true,messageIds:previous.messageIds||[],idempotent:true});
   const ids=await sendText(message);persistOutbound(idempotencyKey,ids);return json(res,200,{ok:true,messageIds:ids,idempotent:false});
  }
  return json(res,404,{error:'Not found.'});
 }catch(error){return json(res,Number(error?.status)||500,{error:Number(error?.status)>=400&&Number(error?.status)<500?String(error.message):'Bridge request failed.'});}
});
server.on('error',error=>{
 console.error(`[moustachi-whatsapp] loopback bind failed: ${String(error?.message||error).slice(0,300)}`);
 setTimeout(()=>process.exit(23),50);
});

if(pairWebMode){
 const remaining=Math.max(0,pairExpiresAt-Date.now());
 setTimeout(()=>{pairPhase='expired';pairQrDataUrl='';pairGroups=[];pairError='Pairing link expired.';setTimeout(()=>process.exit(24),15000);},remaining);
}

server.listen(port,'127.0.0.1',()=>{
 console.log(`[moustachi-whatsapp] loopback API http://127.0.0.1:${port}`);
 if(smokeMode)console.log('[moustachi-whatsapp] smoke mode: WhatsApp socket disabled');
 else {void connectWhatsApp();setInterval(()=>void spool.drain(),5000).unref();}
});

for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{try{server.close();}catch{}process.exit(0);});
