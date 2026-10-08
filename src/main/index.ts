import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import path from 'node:path';
import { CodexObserver } from './observer';
import { HookObserver, type HookSessionEvent } from './hooks';
import { OfficeStore } from './store';
import { demoSessions } from './demo';
import { sessionTarget } from './navigation';
import { SessionRouting } from './session-routing';
import type { OfficeSnapshot, WorkerSession } from '../shared/types';

app.setName('Cyber Co-workers');
let window: BrowserWindow | null = null;
let observer: CodexObserver | undefined;
let hooks: HookObserver | undefined;
let expiryTimer: ReturnType<typeof setInterval> | undefined;
let demo = process.argv.includes('--demo');
const store = new OfficeStore();
const routing = new SessionRouting();
const hookEvents = new Map<string, HookSessionEvent>();
const demos = demoSessions();
const snapshot = (): OfficeSnapshot => demo ? {sessions:demos,connected:false,message:'Demo office — simulated sessions',demo:true} : store.snapshot();
function publish() { if (window && !window.isDestroyed()) window.webContents.send('office:changed',snapshot()); }
function mergeHook(session: WorkerSession): WorkerSession {
 const event = hookEvents.get(session.id);
 if (!event) return session;
 return {...session, source:event.source==='cli' ? 'cli' : session.source, focusUrl:event.focusUrl ?? session.focusUrl,
 ...(session.status === 'disconnected' && event.updatedAt > Date.now()-60_000 ? {status:event.status, detail:event.detail,updatedAt:event.updatedAt} : {})};
}
function createWindow() {
 window = new BrowserWindow({width:1320,height:900,minWidth:960,minHeight:700,title:'Cyber Co-workers',backgroundColor:'#f6f1e7',titleBarStyle:'hiddenInset',trafficLightPosition:{x:20,y:22},webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event)=>event.preventDefault());
 const development = process.env.OFFICE_DEV_URL;
 if (development === 'http://127.0.0.1:5173') void window.loadURL(development);
 else void window.loadFile(path.join(__dirname,'../renderer/index.html'));
 window.on('closed',()=>{window=null});
}
app.whenReady().then(()=>{
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Cyber Co-workers',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}]},
  {label:'Edit',submenu:[{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'View',submenu:[{role:'reload'},{role:'toggleDevTools'},{role:'togglefullscreen'}]},
  {label:'Window',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]},
 ]));
 ipcMain.handle('office:snapshot',()=>snapshot());
 ipcMain.handle('office:demo',(_e,enabled:unknown)=>{demo=enabled===true;publish()});
 ipcMain.handle('office:dismiss',(_e,id:unknown)=>{if(typeof id!=='string')return;if(demo)return;store.dismiss(id);observer?.dismiss(id);publish()});
 ipcMain.handle('office:focus',async(_e,id:unknown)=>{
  if(typeof id!=='string') return {ok:false,message:'Invalid session'};
  if(demo) return {ok:false,message:'This is a demo character. Switch to Live to open real sessions.'};
  const session=store.get(id);
  if(!session)return {ok:false,message:'This session is no longer available.'};
  const target=sessionTarget(routing.apply(session));
  if(!target)return {ok:false,message:session.source==='cli' ? 'No Warp pane link has been captured yet. Send a new prompt in that Warp session so its trusted hook can capture the link.' : 'The original app could not be identified for this session.'};
  try {await shell.openExternal(target);return {ok:true}} catch {return {ok:false,message:'Could not open the original session. Check that its app is installed.'}}
 });
 createWindow();
 observer=new CodexObserver((sessions,connected,message)=>{
  const combined=sessions.map(session=>routing.apply(mergeHook(session)));
  const ids=new Set(combined.map(s=>s.id));
  for(const [id,event] of hookEvents) {
   const current=store.get(id);
   if(current && !ids.has(id) && !event.ended && event.updatedAt>Date.now()-60_000) combined.push({...current,status:event.status,detail:event.detail,updatedAt:event.updatedAt});
  }
  store.update(combined,connected,message);publish();
 });
 observer.start();
 hooks=new HookObserver(event=>{
  hookEvents.set(event.id,event);
  if(event.ended){store.dismiss(event.id);observer?.dismiss(event.id);publish();return}
  const previous=store.get(event.id);
  store.upsert({id:event.id,title:event.title ?? previous?.title ?? 'Codex session',project:event.project ?? previous?.project ?? '',source:event.source==='unknown' ? previous?.source ?? 'unknown' : event.source,status:event.status,detail:event.detail,updatedAt:event.updatedAt,desk:previous?.desk ?? -1,focusUrl:event.focusUrl ?? previous?.focusUrl});
  publish();
 }, undefined, event=>{
  routing.remember(event);
  const current=store.get(event.id);
  if(current){store.upsert(routing.apply(current));publish()}
 });
 hooks.start();
 expiryTimer=setInterval(()=>{if(store.expireDisconnected())publish()},1000);
 app.on('activate',()=>{if(!window)createWindow()});
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{observer?.stop();hooks?.stop();clearInterval(expiryTimer)});
