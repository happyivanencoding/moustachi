import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {Engine} from './engine.mjs';
import {dispatch} from './api.mjs';
import {createMcp} from './mcp.mjs';
import {homePath,readJson,writeJson} from './util.mjs';
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export async function startServer(home=homePath(),config=readJson(path.join(home,'config.json')),options={}){
  const engine=new Engine(home,config,options);
  const clients=config.clients.map(c=>({...c,token:fs.readFileSync(c.tokenFile,'utf8').trim()}));
  if(clients.some(c=>c.token.length<32))throw new Error('Client tokens must be at least 32 characters.');
  const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try{
      const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'');const client=clients.find(c=>same(c.token,bearer));if(!client)return json(res,401,{error:'Authentication required.'});
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/health')return json(res,200,await dispatch(engine,client,{op:'status'}));
      if(req.method!=='POST')return json(res,405,{error:'POST required.'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>250000)throw Object.assign(new Error('Request exceeds 250000 bytes.'),{status:413});}
      let body;try{body=JSON.parse(raw);}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
      if(url.pathname==='/v1')return json(res,200,await dispatch(engine,client,body));
      if(url.pathname==='/mcp'){
        const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
        const mcp=createMcp(data=>dispatch(engine,client,data),{allowedOperations:client.operations,fixedProfile:client.profiles.length===1?client.profiles[0]:undefined});
        res.on('close',()=>{void transport.close();void mcp.close();});await mcp.connect(transport);await transport.handleRequest(req,res,body);return;
      }
      return json(res,404,{error:'Not found.'});
    }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port??39178,'127.0.0.1',resolve);});
  // Bind first. A second instance must never change queued/in-flight state.
  engine.start();writeJson(path.join(home,'service.json'),{pid:process.pid,port:server.address().port,startedAt:new Date().toISOString()});
  const close=async()=>{server.close();await engine.close();};
  return {server,engine,close};
}
if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
  const app=await startServer();console.log(JSON.stringify({event:'moustachi_started',...app.engine.status()}));
  let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await app.close();process.exit(0);});
}
