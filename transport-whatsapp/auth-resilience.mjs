import fs from 'node:fs';
import path from 'node:path';

function readJson(file){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}
function isPairedCreds(value){
 return Boolean(
  value&&typeof value==='object'&&
  (value.registered===true||value.me?.id)&&
  value.noiseKey&&value.signedIdentityKey&&value.signedPreKey&&
  Number.isInteger(value.registrationId)
 );
}
function writeTextAtomic(file,text){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;
 fs.writeFileSync(tmp,text,'utf8');
 fs.renameSync(tmp,file);
}
export function restorePairedCredsBackup(authDir){
 const primary=path.join(authDir,'creds.json');
 const backup=path.join(authDir,'creds.backup.json');
 if(isPairedCreds(readJson(primary)))return {restored:false,source:'primary'};
 const backupValue=readJson(backup);
 if(!isPairedCreds(backupValue))return {restored:false,source:'none'};
 writeTextAtomic(primary,fs.readFileSync(backup,'utf8'));
 return {restored:true,source:'backup'};
}
export function snapshotPairedCredsBackup(authDir){
 const primary=path.join(authDir,'creds.json');
 const backup=path.join(authDir,'creds.backup.json');
 const raw=fs.readFileSync(primary,'utf8');
 if(!isPairedCreds(JSON.parse(raw)))return false;
 writeTextAtomic(backup,raw);
 return true;
}
