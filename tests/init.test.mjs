import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('standalone personal bootstrap needs no business checkout and refuses to overwrite live configuration',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'moustachi-personal-init-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const script=fileURLToPath(new URL('../scripts/init-personal.mjs',import.meta.url));
 const first=spawnSync(process.execPath,[script,'--home',home],{cwd:home,encoding:'utf8',windowsHide:true});assert.equal(first.status,0,first.stderr);
 const original=fs.readFileSync(path.join(home,'config.json'),'utf8'),config=JSON.parse(original);
 assert.deepEqual(Object.keys(config.profiles),['personal']);assert(fs.existsSync(config.profiles.personal.definitionFile));assert.deepEqual(config.profiles.personal.mcpServers,[]);assert.equal(config.clients.length,2);assert(!original.includes('OnwardOps'));
 const repeated=spawnSync(process.execPath,[script,'--home',home],{cwd:home,encoding:'utf8',windowsHide:true});assert.notEqual(repeated.status,0);assert.match(repeated.stderr,/already exists/);assert.equal(fs.readFileSync(path.join(home,'config.json'),'utf8'),original);
});
