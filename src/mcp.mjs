import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const str={type:'string'},num={type:'number'},bool={type:'boolean'};
const tools=[
 ['moustachi_status','status','Service and profile state; no computer operations.',{},[]],
 ['moustachi_submit','submit','Start a new task, or explicitly continue taskId. Returns runId immediately; use moustachi_task for completion. Quoted replies may select an existing task.',{message:str,taskId:str,parentTaskId:str,externalId:str,channel:str},['message']],
 ['moustachi_task','get','Read a run result, failure or pending permission. Do not assume submitted means completed.',{runId:str},['runId']],
 ['moustachi_cancel','cancel','Cancel a specific queued/running task turn.',{runId:str},['runId']],
 ['moustachi_history_search','history.search','Search this profile complete conversation history; bounded snippets and source IDs, no cross-profile search.',{query:str,limit:num},['query']],
 ['moustachi_history_read','history.read','Read a historical message by source ID with paging.',{messageId:num,offset:num,limit:num},['messageId']],
 ['moustachi_memory','memory.read','Read bounded core memory and user memory.',{},[]],
 ['moustachi_memory_write','memory.write','Explicitly add, replace or remove a durable fact. Capacity errors never silently evict facts. Include source provenance.',{target:{enum:['memory','user'],type:'string'},action:{enum:['add','replace','remove'],type:'string'},content:str,oldText:str,source:str},['action','source']],
 ['moustachi_skills','skills.list','List skill metadata only; load a relevant skill separately.',{},[]],
 ['moustachi_skill_read','skills.read','Load one skill. Reading is not successful reuse.',{id:str},['id']],
 ['moustachi_propose','propose','Propose durable memory or a reusable skill with sourceRun evidence. Proposals do not automatically become permanent facts.',{kind:{type:'string',enum:['memory','skill']},content:str,sourceRun:str},['kind','content','sourceRun']],
 ['moustachi_skill_report','skills.report','Record an explicitly evidenced successful reuse on a COMPLETED prior run. Two distinct completed-task reports promote a candidate; mere reads do not.',{id:str,runId:str,evidence:str},['id','runId','evidence']],
 ['moustachi_context','context','Inspect selected context budgets and working-session lineage; does not expose reasoning.',{runId:str},['runId']],
 ['moustachi_permissions','permissions.list','List actual outstanding ACP permission requests.',{},[]],
 ['moustachi_permission_resolve','permissions.resolve','Respond to an actual pending permission using one of its advertised option IDs.',{permissionId:str,optionId:str},['permissionId','optionId']],
];
export function createMcp(invoke,{allowedOperations=['*'],fixedProfile}={}){
  const offered=tools.filter(t=>allowedOperations.includes('*')||allowedOperations.includes(t[1]));
  const server=new Server({name:'moustachi',version:'0.1.0'},{capabilities:{tools:{}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:offered.map(([name,op,description,properties,required])=>({name,description,inputSchema:{type:'object',properties:{...(fixedProfile?{}:{profileId:str}),...properties},required,additionalProperties:false},annotations:{readOnlyHint:['status','get','history.search','history.read','memory.read','skills.list','skills.read','context','permissions.list'].includes(op)}}))}));
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    const item=offered.find(t=>t[0]===request.params.name);if(!item)return {isError:true,content:[{type:'text',text:'Unknown or unauthorized tool.'}]};
    try{const value=await invoke({...request.params.arguments,op:item[1],...(fixedProfile?{profileId:fixedProfile}:{})});return {content:[{type:'text',text:JSON.stringify(value)}]};}
    catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
  });return server;
}
