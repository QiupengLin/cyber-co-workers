import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { createServer } from 'vite';
import electron from 'electron';
await build({entryPoints:['src/app/index.ts','src/app/preload.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outdir:'dist/main'});
const server=await createServer(); await server.listen();
const child=spawn(electron,['.'],{stdio:'inherit',env:{...process.env,OFFICE_DEV_URL:'http://127.0.0.1:5173'}});
child.on('exit',async code=>{await server.close();process.exit(code??0)});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
