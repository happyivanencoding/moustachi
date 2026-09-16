/** Durable transport inbox/pending replies. No business rules or ACP ownership. */
export class MessageSpool {
 constructor({getState,updateState,call,send,channel,log=()=>{}}){Object.assign(this,{getState,updateState,call,send,channel,log});this.running=false;this.lastError='';}
 async drain(){if(this.running)return;this.running=true;
  try{
   while((this.getState().incomingSpool||[]).length){
    const item=this.getState().incomingSpool[0];await this.call('observe',{channel:this.channel,messageId:item.id,message:item.text,timestamp:item.timestamp});
    let run=null;if(item.request)run=await this.call('submit',{channel:this.channel,externalId:item.id,replyTo:item.replyTo||undefined,message:item.request,payload:{senderRef:item.senderRef,groupLabel:item.groupLabel}});
    this.updateState(state=>({...state,incomingSpool:state.incomingSpool.filter(i=>i.id!==item.id),pendingTurns:{...(state.pendingTurns||{}),...(run?{[run.id]:{runId:run.id,taskId:run.task_id,messageId:item.id,quoted:item.quoted}}:{})}}));
   }
   for(const pending of Object.values(this.getState().pendingTurns||{})){
    const run=await this.call('get',{runId:pending.runId});
    if(run.status==='awaiting_permission'){if(!pending.permissionNotified){await this.send(`这次操作需要确认，尚未继续。任务号：${run.id}。请通过 Moustachi MCP 查看并处理具体权限请求。`,pending.quoted);this.updateState(state=>({...state,pendingTurns:{...state.pendingTurns,[run.id]:{...pending,permissionNotified:true}}}));}continue;}
    if(!['completed','failed','cancelled','interrupted'].includes(run.status))continue;
    const key=`core:${run.id}`;let receipt=this.getState().outbound?.[key];
    if(!receipt){const answer=run.status==='completed'?run.output:`本次请求没有完成（${run.status}），没有自动重试，避免重复操作。任务号：${run.id}。`;const messageIds=await this.send(answer,pending.quoted);receipt={messageIds,at:new Date().toISOString()};this.updateState(state=>({...state,outbound:{...(state.outbound||{}),[key]:receipt}}));}
    for(const messageId of receipt.messageIds||[])await this.call('bind',{channel:this.channel,messageId,taskId:pending.taskId});
    this.updateState(state=>{const next={...(state.pendingTurns||{})};delete next[run.id];return {...state,pendingTurns:next};});
   }
   this.lastError='';
  }catch(e){if(e.message!==this.lastError){this.log(e);this.lastError=e.message;}}finally{this.running=false;}
 }
}
