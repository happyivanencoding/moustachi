import path from 'node:path';
import {MoustachiClient} from '../src/client.mjs';
import {homePath,readJson} from '../src/util.mjs';
const config=readJson(path.join(homePath(),'config.json'));
const client=new MoustachiClient({url:`http://127.0.0.1:${config.port||39178}`,tokenFile:config.clients.find(c=>c.id==='owner').tokenFile});
const request=JSON.parse(process.argv[2]||'{"op":"status"}');console.log(JSON.stringify(await client.call(request.op,request),null,2));
