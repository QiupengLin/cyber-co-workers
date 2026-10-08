#!/usr/bin/env node
import { readFile, mkdir, copyFile, writeFile, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const home=process.env.CODEX_HOME || join(homedir(),'.codex');
const target=join(home,'hooks.json');
const generated=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./print-hook-config.mjs',import.meta.url))],{encoding:'utf8'}));
let current={};let exists=false;
try {const stat=await lstat(target); if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Refusing non-regular hooks configuration');current=JSON.parse(await readFile(target,'utf8'));exists=true;} catch(error){if(error.code!=='ENOENT')throw error;}
if(!current || typeof current!=='object'||Array.isArray(current))throw new Error('Invalid hooks configuration');
current.hooks ??= {};
if(typeof current.hooks!=='object'||Array.isArray(current.hooks))throw new Error('Invalid hooks map');
let changed=false;
for(const [event,groups] of Object.entries(generated.hooks)) {
 const existing=current.hooks[event] ?? [];
 if(!Array.isArray(existing))throw new Error('Unsupported existing hook entry: '+event);
 const command=groups[0].hooks[0].command;
 if(!existing.some(group=>group.hooks?.some(hook=>hook.command===command))) {current.hooks[event]=[...existing,...groups];changed=true;}
}
if(!changed){console.log('Cyber Co-workers hooks are already configured. Review them with /hooks in Codex.');process.exit(0);}
await mkdir(home,{recursive:true});
if(exists){const backup=target+'.cyber-backup-'+Date.now();await copyFile(target,backup);console.log('Saved existing hook configuration backup: '+backup);}
const temp=target+'.cyber-'+process.pid;await writeFile(temp,JSON.stringify(current,null,2)+'\n',{mode:0o600});await rename(temp,target);
console.log('Added Cyber Co-workers event hooks to '+target+'\nNext: open /hooks in Codex and review/trust these definitions. Hook trust has not been changed.');
