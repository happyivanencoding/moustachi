import {createHash} from 'node:crypto';

const clean=(value,max=6000)=>String(value??'').trim().slice(0,max);

export function chatRef(jid){
 return `chat-${createHash('sha256').update(String(jid||'')).digest('hex').slice(0,10)}`;
}

export function extractWhatsAppText(message={}){
 const nested=message.ephemeralMessage?.message ?? message.viewOnceMessage?.message ?? message.viewOnceMessageV2?.message ?? message.documentWithCaptionMessage?.message;
 if(nested)return extractWhatsAppText(nested);
 return clean(
  message.conversation ??
  message.extendedTextMessage?.text ??
  message.imageMessage?.caption ??
  message.videoMessage?.caption ??
  message.documentMessage?.caption ??
  message.buttonsResponseMessage?.selectedDisplayText ??
  message.listResponseMessage?.title ??
  '',
  6000,
 );
}

export function extractMentionedJids(message={}){
 const nested=message.ephemeralMessage?.message ?? message.viewOnceMessage?.message ?? message.viewOnceMessageV2?.message ?? message.documentWithCaptionMessage?.message;
 if(nested)return extractMentionedJids(nested);
 const candidates=[
  message.extendedTextMessage?.contextInfo?.mentionedJid,
  message.imageMessage?.contextInfo?.mentionedJid,
  message.videoMessage?.contextInfo?.mentionedJid,
  message.documentMessage?.contextInfo?.mentionedJid,
 ];
 return [...new Set(candidates.flatMap(value=>Array.isArray(value)?value:[]).map(value=>String(value||'').trim()).filter(Boolean))];
}

export function classifyChatTrigger({text,mentionedJids=[],selfJids=[]}={}){
 const raw=clean(text,6000);
 if(!raw)return {triggered:false,message:''};
 const normalize=value=>String(value||'').split(':')[0].toLowerCase();
 const self=new Set(selfJids.map(normalize).filter(Boolean));
 const mentioned=mentionedJids.some(value=>self.has(normalize(value)));
 const contextOnlyInstruction='请根据最近的 chats 群聊上下文处理当前讨论。';
 if(/^\s*@?moustachi\s*$/i.test(raw))return {triggered:true,message:contextOnlyInstruction,reason:'context_call'};
 const prefix=/^\s*@?moustachi\s*(?:[,:，：-]\s*|\s+)([\s\S]+)$/i.exec(raw);
 if(prefix?.[1]?.trim())return {triggered:true,message:prefix[1].trim(),reason:'prefix'};
 if(mentioned){
  const stripped=raw.replace(/@\d{5,20}/g,'').replace(/^\s*@?moustachi\s*[,:，：-]?\s*/i,'').trim();
  return {triggered:true,message:stripped||contextOnlyInstruction,reason:stripped?'mention':'context_call'};
 }
 return {triggered:false,message:''};
}

export function sanitizeGroupLabel(value){
 const text=clean(value,120);
 return text.replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();
}

export function shouldProcessChatMessage({remoteJid,configuredGroupJid,fromMe,messageId,processedIds,text,mentionedJids,selfJids}={}){
 const observed=shouldObserveChatMessage({remoteJid,configuredGroupJid,fromMe,messageId,processedIds,text});
 if(!observed.observe)return {process:false,reason:observed.reason};
 const trigger=classifyChatTrigger({text,mentionedJids,selfJids});
 return trigger.triggered?{process:true,reason:trigger.reason,message:trigger.message}:{process:false,reason:'not_addressed'};
}

export function shouldObserveChatMessage({remoteJid,configuredGroupJid,fromMe,messageId,processedIds,text}={}){
 if(fromMe)return {observe:false,reason:'from_me'};
 if(!remoteJid||remoteJid!==configuredGroupJid)return {observe:false,reason:'wrong_chat'};
 if(!String(remoteJid).endsWith('@g.us'))return {observe:false,reason:'not_group'};
 if(!messageId)return {observe:false,reason:'missing_id'};
 if(processedIds?.has?.(messageId))return {observe:false,reason:'duplicate'};
 if(!clean(text,6000))return {observe:false,reason:'no_text'};
 return {observe:true,reason:'chats_group'};
}

export function addChatContext(state,entry,{limit=500,maxAgeMs=7*24*60*60*1000,now=Date.now()}={}){
 const existing=Array.isArray(state?.chatContext)?state.chatContext:[];
 const id=clean(entry?.id,180),text=clean(entry?.text,6000),senderRef=clean(entry?.senderRef,100);
 const timestamp=Number(entry?.timestamp)||now;
 if(!id||!text||!senderRef)return {...(state&&typeof state==='object'?state:{}),schemaVersion:1};
 const minTimestamp=now-Math.max(60*60*1000,Number(maxAgeMs)||0);
 const context=existing
  .filter(item=>item&&clean(item.id,180)!==id&&Number(item.timestamp)>=minTimestamp&&clean(item.text,6000))
  .concat({id,senderRef,timestamp,text})
  .slice(-Math.max(20,Math.min(Number(limit)||500,1000)));
 return {...(state&&typeof state==='object'?state:{}),schemaVersion:1,chatContext:context,updatedAt:new Date(now).toISOString()};
}

export function recentChatContext(state,{maxEntries=200,maxChars=30000,now=Date.now(),maxAgeMs=7*24*60*60*1000}={}){
 const minTimestamp=now-Math.max(60*60*1000,Number(maxAgeMs)||0);
 const candidates=(Array.isArray(state?.chatContext)?state.chatContext:[])
  .filter(item=>item&&Number(item.timestamp)>=minTimestamp&&clean(item.text,6000)&&clean(item.senderRef,100))
  .slice(-Math.max(1,Math.min(Number(maxEntries)||200,200)));
 const selected=[];let chars=0,limit=Math.max(1000,Math.min(Number(maxChars)||30000,30000));
 for(let index=candidates.length-1;index>=0;index--){
  const item=candidates[index],text=clean(item.text,6000),cost=text.length+80;
  if(selected.length&&chars+cost>limit)break;
  selected.push({senderRef:clean(item.senderRef,100),timestamp:Number(item.timestamp)||0,text});chars+=cost;
 }
 return selected.reverse();
}

export function splitWhatsAppMessage(message,maxLength=3500){
 const text=String(message||'').trim();
 if(!text)return [];
 const limit=Math.max(500,Math.min(Number(maxLength)||3500,4000));
 if(text.length<=limit)return [text];
 const chunks=[];let remaining=text;
 while(remaining.length>limit){
  let cut=remaining.lastIndexOf('\n',limit);
  if(cut<Math.floor(limit*.55))cut=remaining.lastIndexOf(' ',limit);
  if(cut<Math.floor(limit*.55))cut=limit;
  chunks.push(remaining.slice(0,cut).trim());
  remaining=remaining.slice(cut).trimStart();
 }
 if(remaining)chunks.push(remaining);
 return chunks.filter(Boolean);
}

export function addProcessedId(state,messageId,limit=800){
 const ids=Array.isArray(state?.processedIds)?state.processedIds.filter(Boolean):[];
 if(messageId&&!ids.includes(messageId))ids.push(messageId);
 return {...(state&&typeof state==='object'?state:{}),schemaVersion:1,processedIds:ids.slice(-Math.max(50,Math.min(Number(limit)||800,2000))),updatedAt:new Date().toISOString()};
}
