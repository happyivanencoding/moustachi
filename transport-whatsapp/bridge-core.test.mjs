import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addChatContext,
  addProcessedId,
  classifyChatTrigger,
  extractMentionedJids,
  extractWhatsAppText,
  chatRef,
  recentChatContext,
  shouldObserveChatMessage,
  shouldProcessChatMessage,
  splitWhatsAppMessage,
} from './bridge-core.mjs';

test('extracts supported text forms without carrying unrelated message fields',()=>{
 assert.equal(extractWhatsAppText({conversation:'Moustachi, hello'}),'Moustachi, hello');
 assert.equal(extractWhatsAppText({extendedTextMessage:{text:'Moustachi: status'}}),'Moustachi: status');
 assert.equal(extractWhatsAppText({imageMessage:{caption:'Moustachi image note'}}),'Moustachi image note');
 assert.deepEqual(extractMentionedJids({extendedTextMessage:{contextInfo:{mentionedJid:['123@s.whatsapp.net']}}}),['123@s.whatsapp.net']);
});

test('only explicit Moustachi prefix or bot mention triggers the chat agent',()=>{
 assert.deepEqual(classifyChatTrigger({text:'@Moustachi 看一下刚才的搜索'}),{triggered:true,message:'看一下刚才的搜索',reason:'prefix'});
 assert.deepEqual(classifyChatTrigger({text:'Moustachi, 看一下刚才的搜索'}),{triggered:true,message:'看一下刚才的搜索',reason:'prefix'});
 assert.equal(classifyChatTrigger({text:'项目同事，看一下刚才的搜索'}).triggered,false);
 assert.equal(classifyChatTrigger({text:'晚饭吃什么'}).triggered,false);
 const mentioned=classifyChatTrigger({text:'@123456 帮我查日志',mentionedJids:['123456@s.whatsapp.net'],selfJids:['123456@s.whatsapp.net']});
 assert.equal(mentioned.triggered,true);assert.equal(mentioned.message,'帮我查日志');
 const mentionOnly=classifyChatTrigger({text:'@123456',mentionedJids:['123456@s.whatsapp.net'],selfJids:['123456@s.whatsapp.net']});
 assert.equal(mentionOnly.triggered,true);assert.equal(mentionOnly.reason,'context_call');
 const bare=classifyChatTrigger({text:'@Moustachi'});
 assert.equal(bare.triggered,true);assert.equal(bare.reason,'context_call');
});

test('route gate ignores DMs, other groups, own messages and duplicates',()=>{
 const base={configuredGroupJid:'chats@g.us',messageId:'m1',processedIds:new Set(),text:'Moustachi: hello',mentionedJids:[],selfJids:[]};
 assert.equal(shouldProcessChatMessage({...base,remoteJid:'someone@s.whatsapp.net'}).process,false);
 assert.equal(shouldProcessChatMessage({...base,remoteJid:'other@g.us'}).process,false);
 assert.equal(shouldProcessChatMessage({...base,remoteJid:'chats@g.us',fromMe:true}).process,false);
 assert.equal(shouldProcessChatMessage({...base,remoteJid:'chats@g.us',processedIds:new Set(['m1'])}).process,false);
 const accepted=shouldProcessChatMessage({...base,remoteJid:'chats@g.us'});assert.equal(accepted.process,true);assert.equal(accepted.message,'hello');
});

test('chats group messages are observable even when they do not trigger the agent',()=>{
 const base={configuredGroupJid:'chats@g.us',messageId:'m1',processedIds:new Set(),text:'昨天有三个 tester 卡在搜索'};
 assert.equal(shouldObserveChatMessage({...base,remoteJid:'chats@g.us'}).observe,true);
 assert.equal(shouldProcessChatMessage({...base,remoteJid:'chats@g.us',mentionedJids:[],selfJids:[]}).process,false);
 assert.equal(shouldObserveChatMessage({...base,remoteJid:'other@g.us'}).observe,false);
 assert.equal(shouldObserveChatMessage({...base,remoteJid:'chats@g.us',fromMe:true}).observe,false);
 assert.equal(shouldObserveChatMessage({...base,remoteJid:'chats@g.us',processedIds:new Set(['m1'])}).observe,false);
});

test('rolling chat context persists bounded messages and returns recent chronological context',()=>{
 const now=Date.now();let state={processedIds:['keep'],outbound:{event1:{messageIds:['x']}}};
 state=addChatContext(state,{id:'c1',senderRef:'chat-a',timestamp:now-5000,text:'昨天有三个 tester 卡在搜索'},{now});
 state=addChatContext(state,{id:'c2',senderRef:'chat-b',timestamp:now-3000,text:'我这里也看到 96% 卡住'},{now});
 state=addChatContext(state,{id:'c2',senderRef:'chat-b',timestamp:now-2000,text:'重复消息不应该出现两次'},{now});
 const context=recentChatContext(state,{now,maxEntries:10,maxChars:5000});
 assert.deepEqual(context.map(item=>item.senderRef),['chat-a','chat-b']);
 assert.equal(context[1].text,'重复消息不应该出现两次');
 assert.deepEqual(state.outbound,{event1:{messageIds:['x']}});
});

test('chat references are stable pseudonyms and long replies are chunked',()=>{
 assert.equal(chatRef('33612345678@s.whatsapp.net'),chatRef('33612345678@s.whatsapp.net'));
 assert.match(chatRef('33612345678@s.whatsapp.net'),/^chat-[a-f0-9]{10}$/);
 const chunks=splitWhatsAppMessage('a'.repeat(7200),3500);assert.equal(chunks.length,3);assert(chunks.every(chunk=>chunk.length<=3500));
});

test('processed ids stay bounded and deduplicated',()=>{
 let state={processedIds:['a'],outbound:{event1:{messageIds:['x']}}};state=addProcessedId(state,'b',50);state=addProcessedId(state,'b',50);assert.deepEqual(state.processedIds,['a','b']);assert.deepEqual(state.outbound,{event1:{messageIds:['x']}});
 for(let i=0;i<80;i++)state=addProcessedId(state,`m${i}`,50);assert.equal(state.processedIds.length,50);assert.equal(state.processedIds.at(-1),'m79');
});
