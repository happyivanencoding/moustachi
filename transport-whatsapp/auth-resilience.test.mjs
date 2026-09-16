import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {restorePairedCredsBackup,snapshotPairedCredsBackup} from './auth-resilience.mjs';

function pairedCreds(id='12345:1@s.whatsapp.net'){
 return {
  registered:false,
  me:{id},
  registrationId:42,
  noiseKey:{private:{type:'Buffer',data:[1]},public:{type:'Buffer',data:[2]}},
  signedIdentityKey:{private:{type:'Buffer',data:[3]},public:{type:'Buffer',data:[4]}},
  signedPreKey:{keyPair:{private:{type:'Buffer',data:[5]},public:{type:'Buffer',data:[6]}},signature:{type:'Buffer',data:[7]},keyId:1},
 };
}
function withTempDir(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onward-auth-'));
 try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('restores a paired backup when creds.json was truncated',()=>withTempDir(dir=>{
 const primary=path.join(dir,'creds.json'),backup=path.join(dir,'creds.backup.json');
 fs.writeFileSync(primary,'','utf8');
 fs.writeFileSync(backup,JSON.stringify(pairedCreds()),'utf8');
 const result=restorePairedCredsBackup(dir);
 assert.deepEqual(result,{restored:true,source:'backup'});
 assert.equal(JSON.parse(fs.readFileSync(primary,'utf8')).me.id,'12345:1@s.whatsapp.net');
}));

test('does not overwrite a valid paired primary',()=>withTempDir(dir=>{
 const primary=path.join(dir,'creds.json'),backup=path.join(dir,'creds.backup.json');
 fs.writeFileSync(primary,JSON.stringify(pairedCreds('primary@s.whatsapp.net')),'utf8');
 fs.writeFileSync(backup,JSON.stringify(pairedCreds('backup@s.whatsapp.net')),'utf8');
 const result=restorePairedCredsBackup(dir);
 assert.deepEqual(result,{restored:false,source:'primary'});
 assert.equal(JSON.parse(fs.readFileSync(primary,'utf8')).me.id,'primary@s.whatsapp.net');
}));

test('snapshots only paired credentials',()=>withTempDir(dir=>{
 const primary=path.join(dir,'creds.json'),backup=path.join(dir,'creds.backup.json');
 fs.writeFileSync(primary,JSON.stringify({registered:false,registrationId:42}),'utf8');
 assert.equal(snapshotPairedCredsBackup(dir),false);
 assert.equal(fs.existsSync(backup),false);
 fs.writeFileSync(primary,JSON.stringify(pairedCreds()),'utf8');
 assert.equal(snapshotPairedCredsBackup(dir),true);
 assert.equal(JSON.parse(fs.readFileSync(backup,'utf8')).me.id,'12345:1@s.whatsapp.net');
}));
