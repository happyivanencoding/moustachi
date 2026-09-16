import fs from 'node:fs';
import {sleep} from './util.mjs';
export class MoustachiClient {
  constructor({url='http://127.0.0.1:39178',tokenFile,profileId,origin='owner'}){this.url=url.replace(/\/$/,'');this.tokenFile=tokenFile;this.profileId=profileId;this.origin=origin;}
  async call(op,args={}){const response=await fetch(`${this.url}/v1`,{method:'POST',headers:{Authorization:`Bearer ${fs.readFileSync(this.tokenFile,'utf8').trim()}`,'Content-Type':'application/json'},body:JSON.stringify({profileId:this.profileId,origin:this.origin,...args,op}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{status:response.status});return data;}
  async wait(runId,{timeoutMs=650000,onPending}={}){const end=Date.now()+timeoutMs;while(Date.now()<end){const run=await this.call('get',{runId});if(run.status==='completed')return run;if(['failed','cancelled','interrupted'].includes(run.status))throw Object.assign(new Error(run.error||run.status),{run});if(run.status==='awaiting_permission')await onPending?.(run);await sleep(700);}throw new Error(`Wait timed out for run ${runId}; check its status before retrying.`);}
}
