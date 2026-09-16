import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export const homePath=()=>path.resolve(process.env.MOUSTACHI_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(),'Moustachi'));
export const readJson=(file)=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
export function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n','utf8');fs.renameSync(tmp,file);}
export const bounded=(text,max)=>{text=String(text||'');if(text.length<=max)return text;const tail=Math.min(1000,Math.floor(max/4));return text.slice(0,max-tail-60)+'\n...[omitted; full record retained in history]...\n'+text.slice(-tail);};
export function requiredString(value,name,max=12000){if(typeof value!=='string'||!value.trim()||value.length>max)throw Object.assign(new Error(`${name} must contain 1..${max} characters.`),{status:400});return value.trim();}
export function profileId(value){if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value||''))throw Object.assign(new Error('Invalid profile id.'),{status:400});return value;}
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
