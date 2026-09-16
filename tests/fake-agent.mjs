import {Readable,Writable} from 'node:stream';import {agent,ndJsonStream} from '@agentclientprotocol/sdk';
let serial=0;
const app=agent({name:'fixture'})
 .onRequest('initialize',()=>({protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[]}))
 .onRequest('session/new',()=>({sessionId:`fake-${++serial}`}))
 .onRequest('session/set_mode',()=>({}))
 .onRequest('session/load',async({params,client})=>{await client.notify('session/update',{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'OLD ANSWER MUST NOT REPLAY'}}});return {};})
 .onRequest('session/prompt',async({params,client})=>{for(let i=0;i<1100;i++)await client.notify('session/update',{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:String(i%10)}}});await client.notify('session/update',{sessionId:params.sessionId,update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'NOT PUBLIC'}}});return {stopReason:'end_turn'};})
 .onNotification('session/cancel',()=>{});
app.connect(ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)));
