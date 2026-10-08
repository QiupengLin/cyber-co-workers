import './style.css';
import type { OfficeSnapshot, WorkerSession } from '../shared/types';
const $ = <T extends HTMLElement>(s:string) => document.querySelector<T>(s)!;
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const colors = ['#82d9c6','#b6a3dd','#e5b180','#8abfdf','#d18a9e','#b6ca88','#e1ca87','#88bdb7'];
const statuses = {working:'Working',idle:'On a break',waiting:'Waiting for you',disconnected:'Disconnected'};
let snapshot:OfficeSnapshot={sessions:[],connected:false,message:'Connecting to your local sessions…',demo:false};
let selectedIds:string[]=[];
let weather='clear';
let hovered:WorkerSession|undefined;
let hitboxes:{session:WorkerSession;x:number;y:number;w:number;h:number}[]=[];
let toastTimer:ReturnType<typeof setTimeout>;
$('#app').innerHTML=`<header><div class="brand"><div class="brand-mark">⌘</div><div><h1>cyber co-workers</h1><div class="eyebrow">A little world for your work</div></div></div><div class="header-tools"><div><div class="time" id="clock"></div><div class="date" id="date"></div></div><div class="divider"></div><button class="subtle-button" id="demo">Explore demo</button></div></header><div class="intro"><div><div class="eyebrow">Welcome to Kevin’s studio</div><h2>Good work. Warm company.</h2><p>Your own office, eight little desks, and room to take a breather.</p></div><div class="live-badge" id="mode"><i class="dot"></i> LOCAL OFFICE</div></div><main class="scene-shell"><div class="scene-toolbar"><div class="floor-label">◈ &nbsp; STUDIO 08 <span>/</span> <span id="occupancy">0 OF 8 DESKS</span></div><div class="scene-actions"><span id="daypart">EVENING SHIFT</span><label>SKY <select id="weather" aria-label="Simulated weather"><option value="clear">Clear</option><option value="clouds">Cloudy</option><option value="rain">Rain</option></select></label></div></div><div class="canvas-wrap"><canvas id="office-canvas" aria-label="Cozy office with Kevin seated in his private office, eight session desks, a coffee nook, and a ping-pong table. Use session buttons below to open a session."></canvas><div id="tooltip"></div><div class="empty-scene" id="empty"><h3>A desk is waiting for you.</h3><p>Start a Codex or connected Claude Code session and your co-worker will move in. Until then, take a look around.</p><button class="subtle-button" id="empty-demo">Explore the demo office ↗</button></div></div><div class="scene-bottom"><div class="legend"><span><i class="status-dot working"></i>Working</span><span><i class="status-dot idle"></i>Idle</span><span><i class="status-dot waiting"></i>Waiting</span><span><i class="status-dot disconnected"></i>Disconnected</span></div><span>HOVER TO MEET · CLICK TO OPEN</span></div></main><div class="roster-top"><div class="eyebrow">Around the office</div><span class="hint">Kevin’s in his office · One co-worker per session.</span></div><div id="roster"></div><div id="overflow"></div><footer class="footer"><span id="connection"></span><span>MAC LOCAL · OFFICE 01</span></footer><div id="toast" role="status"></div>`;
const canvas=$<HTMLCanvasElement>('#office-canvas');
const ctx=canvas.getContext('2d')!;
const W=1120,H=650;
canvas.width=W;canvas.height=H;
// Keep the displayed canvas bounds aligned with pointer coordinates at every window size.
new ResizeObserver(([entry])=>{
 const scale=Math.min(entry.contentRect.width/W,entry.contentRect.height/H);
 canvas.style.width=`${W*scale}px`;canvas.style.height=`${H*scale}px`;
}).observe(canvas.parentElement!);
const names=['Build the workspace','Refine navigation','Review changes','Explore rendering','Write session adapter','Update the docs','Polish the office','Run integration checks'];
function mock():OfficeSnapshot{return {demo:true,connected:true,message:'Demo office · Simulated characters and sessions. Return to live to see your own activity.',sessions:names.map((title,i)=>({id:`demo-${i}`,title,project:i%2?'cyber-co-workers':'~/projects/studio',source:i%3?'cli':'desktop',status:(['working','working','idle','waiting','working','idle','disconnected','working'] as const)[i],detail:i===3?'Which approach should we use for the session adapter?':i===6?'No recent connection to this session.':i===2?'Taking a little break between turns.':'Implementing the next piece of the project.',desk:i,updatedAt:Date.now()}))};}
function notify(message:string){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',5000);}
function workers(){const sessions=snapshot.sessions;const picked=selectedIds.map(id=>sessions.find(s=>s.id===id)).filter((s):s is WorkerSession=>!!s);return [...picked,...sessions.filter(s=>!selectedIds.includes(s.id)).sort((a,b)=>a.desk-b.desk)].slice(0,8);}
const assignedDesks=new Map<string,number>();
function officeSlots():(WorkerSession|undefined)[]{const active=workers();const slots:(WorkerSession|undefined)[]=Array(8).fill(undefined);for(const [id] of assignedDesks)if(!active.some(s=>s.id===id))assignedDesks.delete(id);for(const s of active){const slot=assignedDesks.get(s.id);if(slot!==undefined&&!slots[slot])slots[slot]=s;}for(const s of active){if(slots.some(w=>w?.id===s.id))continue;const preferred=s.desk>=0&&s.desk<8?s.desk:0;const slot=!slots[preferred]?preferred:slots.findIndex(w=>!w);slots[slot]=s;assignedDesks.set(s.id,slot);}return slots;}
let rosterSignature='';
function renderState(){const list=officeSlots();$('#occupancy').textContent=`${list.filter(Boolean).length} OF 8 DESKS`;$('#mode').innerHTML=`<i class="dot"></i> ${snapshot.demo?'DEMO OFFICE':snapshot.connected?'LOCAL OFFICE':'CONNECTING'}`;$('#demo').textContent=snapshot.demo?'Return to live':'Explore demo';$('#demo').classList.toggle('active',snapshot.demo);$('#connection').textContent=snapshot.message;$('#empty').style.display=list.some(Boolean)?'none':'block';const nextRosterSignature=JSON.stringify({demo:snapshot.demo,slots:list.map(s=>s?{id:s.id,title:s.title,harness:s.harness,source:s.source,status:s.status,desk:s.desk}:null),overflow:snapshot.sessions.filter(s=>!list.some(w=>w?.id===s.id)).map(s=>({id:s.id,title:s.title}))});if(nextRosterSignature===rosterSignature)return;rosterSignature=nextRosterSignature;const activeElement=document.activeElement as HTMLElement|null;const focusId=activeElement?.dataset.id;const dismissId=activeElement?.dataset.dismiss;$('#roster').innerHTML=Array.from({length:8},(_,i)=>{const s=list[i];return s?`<div class="worker-card"><button class="worker-open" data-id="${escape(s.id)}" aria-label="Open ${escape(s.title)}: ${statuses[s.status]}"><span class="avatar" style="--color:${colors[Math.abs(s.desk)%8]}">${String(i+1).padStart(2,'0')}</span><span class="card-copy"><span class="card-title">${escape(s.title)}</span><span class="card-subtitle"><i class="status-dot ${s.status}"></i>${statuses[s.status]} · ${s.harness==='claude'?'Claude Code':s.source==='cli'?'Codex / CLI':'Codex'}</span></span><span class="card-number">↗</span></button><button class="dismiss" data-dismiss="${escape(s.id)}" aria-label="Dismiss ${escape(s.title)} from the office" title="Dismiss from office">×</button></div>`:`<div class="empty-card">Available desk <span>${String(i+1).padStart(2,'0')}</span></div>`}).join('');$('#roster').querySelectorAll<HTMLButtonElement>('[data-id]').forEach(el=>{el.onclick=()=>void focus(el.dataset.id!);});$('#roster').querySelectorAll<HTMLButtonElement>('[data-dismiss]').forEach(el=>el.onclick=()=>void dismiss(el.dataset.dismiss!));const overflow=snapshot.sessions.filter(s=>!list.some(w=>w?.id===s.id));$('#overflow').innerHTML=overflow.length?`<span>Beyond the room · Select a session to bring it in</span>${overflow.map(s=>`<button class="overflow-worker" data-id="${escape(s.id)}">${escape(s.title)} ↔</button>`).join('')}`:'';$('#overflow').querySelectorAll<HTMLButtonElement>('[data-id]').forEach(el=>el.onclick=()=>{selectedIds=[el.dataset.id!,...selectedIds.filter(id=>id!==el.dataset.id)].slice(0,8);renderState();});if(focusId||dismissId){const selector=focusId?'[data-id]':'[data-dismiss]';document.querySelectorAll<HTMLButtonElement>(selector).forEach(button=>{if((focusId&&button.dataset.id===focusId)||(dismissId&&button.dataset.dismiss===dismissId))button.focus({preventScroll:true});});}}
async function dismiss(id:string){try{if(snapshot.demo){notify('Demo characters stay in the demo office.');return;}await window.office.dismissSession(id);snapshot=await window.office.getSnapshot();renderState();}catch(e){notify(`Could not dismiss session: ${String(e)}`);}}
async function focus(id:string){if(snapshot.demo){notify('This is a demo character. Switch to live to open your sessions.');return;}try{const result=await window.office.focusSession(id);if(!result.ok)notify(result.message||'Unable to open this session.');}catch(e){notify(`Could not open session: ${String(e)}`);}}
async function toggleDemo(){try{if(typeof window.office?.getSnapshot==='function'){await window.office.setDemo(!snapshot.demo);snapshot=await window.office.getSnapshot();}else snapshot=snapshot.demo?{sessions:[],demo:false,connected:false,message:'Browser preview · Open the desktop app to connect your Codex and Claude Code sessions.'}:mock();renderState();}catch(e){notify(`Could not change mode: ${String(e)}`);}}
$('#demo').onclick=()=>void toggleDemo();$('#empty-demo').onclick=()=>void toggleDemo();$<HTMLSelectElement>('#weather').onchange=e=>weather=(e.target as HTMLSelectElement).value;
function rect(x:number,y:number,w:number,h:number,c:string){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function line(x:number,y:number,x2:number,y2:number,c:string,width=1){ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
function text(s:string,x:number,y:number,color:string,size=10,align:CanvasTextAlign='left'){ctx.font=`${size}px monospace`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(s,x,y);}
function plant(x:number,y:number){rect(x-9,y,18,18,'#846d58');rect(x-11,y,22,4,'#ac8c65');rect(x-2,y-33,4,34,'#597f73');rect(x-16,y-30,15,7,'#618d78');rect(x+1,y-22,17,8,'#73a183');rect(x-11,y-13,11,7,'#4e7467');rect(x+1,y-40,11,8,'#88a58c');}
function drawDesk(x:number,y:number,index:number,s?:WorkerSession){
 rect(x-49,y+21,104,27,'#785c3920');
 rect(x-44,y+12,5,34,'#8b6445');rect(x+40,y+12,5,34,'#8b6445');
 rect(x-51,y-3,102,19,'#b88456');rect(x-51,y-7,102,19,'#d8ad78');
 rect(x-49,y-7,98,3,'#efcf9d');line(x-44,y+7,x+44,y+7,'#c79864');
 rect(x-4,y-24,4,19,'#8e8270');rect(x-25,y-44,47,29,'#57594d');
 rect(x-22,y-41,41,23,s?'#354e43':'#868d78');
 if(s)for(let k=0;k<3;k++)rect(x-17,y-36+k*6,12+((index*7+k*9)%18),2,k===0?'#e9c888':'#91b394');
 rect(x-12,y-11,21,3,'#777767');rect(x-18,y+1,34,6,'#f0ddba');
 rect(x+32,y-10,9,11,'#f8edda');rect(x+40,y-8,4,6,'#eee0c3');
 text(String(index+1).padStart(2,'0'),x-43,y+7,'#725239',7);
 rect(x-17,y+35,34,9,'#785c46');rect(x-20,y+18,40,23,'#92977a');rect(x-17,y+18,34,4,'#b7bd97');
}
function character(x:number,y:number,s:WorkerSession,time:number,index:number,boss=false){const color=colors[Math.abs(s.desk)%8];const walking=s.status==='idle';const bounce=walking?Math.sin(time*7+index)*1.8:Math.sin(time*2+index)*.4; y+=bounce;rect(x-13,y+22,28,5,'#10232b66');rect(x-7,y+10,6,13,'#192833');rect(x+3,y+10,6,13,'#192833');rect(x-9,y+22+(walking?Math.sin(time*7)*2:0),9,4,'#84919a');rect(x+3,y+22-(walking?Math.sin(time*7)*2:0),9,4,'#84919a');rect(x-12,y-7,25,21,color);rect(x-15,y-4,4,15,color);rect(x+13,y-4,4,15,color);rect(x-8,y-25,18,18,'#d4ac89');rect(x-10,y-27,22,7,index%2?'#4c363a':'#28333c');rect(x-10,y-24,5,11,index%2?'#4c363a':'#28333c');rect(x-5,y-17,3,3,'#293844');rect(x+5,y-17,3,3,'#293844');rect(x-2,y-10,6,2,'#a77d6b');rect(x-4,y-5,9,4,'#d3e0d3');if(s.status==='working'){rect(x-15,y+7,6,4,'#d4ac89');rect(x+11,y+6+Math.round(Math.sin(time*9)*2),6,4,'#d4ac89');}if(s.status==='idle'){rect(x+14,y+2,8,9,'#d9c9a9');}if(boss)return;const indicator=s.status==='waiting'?'?':s.status==='disconnected'?'×':s.status==='idle'?'·':'⌁';const tint={working:'#82d9c6',idle:'#b6b4e8',waiting:'#edc68f',disconnected:'#94a2ad'}[s.status];rect(x-10,y-48,21,17,'#122832');rect(x-10,y-48,21,2,tint);text(indicator,x+.5,y-35,tint,13,'center');hitboxes.push({session:s,x:x-32,y:y-50,w:64,h:83});}
// Kevin is a permanent resident, independent of live and demo session slots.
const kevin:WorkerSession={id:'office-kevin',title:'Kevin',project:'',source:'unknown',status:'working',desk:2,updatedAt:0};
const deskPosition=(index:number)=>({x:365+(index%4)*195,y:340+Math.floor(index/4)*165});
function rug(x:number,y:number,w:number,h:number){
 rect(x,y,w,h,'#b7795f');rect(x+5,y+5,w-10,h-10,'#d1a183');
 for(let i=12;i<w-8;i+=10){rect(x+i,y-3,2,3,'#b7795f');rect(x+i,y+h,2,3,'#b7795f');}
}
function draw(time:number){
 const hour=new Date().getHours(),day=hour>=7&&hour<18;
 const list=officeSlots();hitboxes=[];ctx.imageSmoothingEnabled=false;
 rect(0,0,W,H,'#eadbc1');rect(0,146,W,H-146,'#d5b78f');
 for(let y=150;y<H;y+=29){line(0,y,W,y,'#c3a078');for(let x=(Math.floor(y/29)%2)*60;x<W;x+=120)line(x,y,x,y+29,'#c6a57f');}
 // Tall windows keep the city view, with warm interior lighting at every hour.
 for(let i=0;i<4;i++){
  const x=33+i*278;rect(x-5,17,254,117,'#bba584');
  const sky=ctx.createLinearGradient(0,22,0,126);sky.addColorStop(0,day?'#a9b9ad':'#696b87');sky.addColorStop(1,day?'#f1dbb2':'#c4a397');
  ctx.fillStyle=sky;ctx.fillRect(x,22,244,104);
  for(let j=0;j<8;j++){const h=20+(j*17+i*13)%43;rect(x+j*31,126-h,26,h,day?'#9fa899':'#6d737b');for(let k=0;k<3;k++)rect(x+j*31+7,132-h+k*12,4,5,'#f2d6a0');}
  if(weather!=='clear'){rect(x+20,38,95,9,'#ebdfce77');rect(x+38,32,50,8,'#ebdfce77');}
  if(weather==='rain'){ctx.save();ctx.beginPath();ctx.rect(x,22,244,104);ctx.clip();for(let j=0;j<24;j++){const rx=x+(j*47+time*32)%244,ry=22+(j*29+time*100)%104;line(rx,ry,rx-3,ry+9,'#faf3df88');}ctx.restore();}
  rect(x+119,22,5,104,'#c8b492');rect(x-8,126,260,10,'#f6e7cc');
  rect(x-8,17,16,107,'#c39171');rect(x+236,17,16,107,'#c39171');
 }
 rect(0,143,W,7,'#ab8962');
 // Kevin's room has a glazed partition and an open doorway onto the studio.
 rect(25,170,232,294,'#f0e3c9');rug(43,250,194,168);
 rect(25,166,232,9,'#a28664');rect(25,175,7,285,'#a28664');
 rect(251,175,6,179,'#a28664');rect(251,180,6,166,'#c6d2bc');
 rect(251,180,2,166,'#9d8c6d');rect(251,253,6,4,'#a28664');
 rect(25,457,168,7,'#a28664');rect(251,410,6,54,'#a28664');
 text('KEVIN’S OFFICE',141,199,'#775c44',11,'center');text('THE BOSS · ALWAYS IN',141,217,'#99816a',8,'center');
 // Small bookshelf, desk lamp, and a resident boss seated at his desk.
 rect(46,230,65,9,'#aa7d54');for(let i=0;i<7;i++)rect(50+i*8,218-(i%3)*3,6,12+(i%3)*3,['#8b9a77','#b87861','#c9ac70'][i%3]);
 drawDesk(142,315,0,kevin);character(142,341,kevin,time,2,true);
 rect(167,304,17,3,'#8b7353');rect(174,284,3,21,'#8b7353');rect(163,280,24,9,'#f1cc83');
 text('Kevin',142,389,'#6f513b',12,'center');text('A little space to think.',141,438,'#99816a',8,'center');plant(221,251);
 // Coffee nook: espresso machine, stacked cups, and rising steam.
 text('BUT FIRST, COFFEE',142,501,'#82644b',10,'center');
 rect(48,537,190,57,'#b58d63');rect(44,532,198,9,'#f1dfbe');
 for(let i=0;i<3;i++){rect(53+i*60,547,53,40,'#cba67b');rect(76+i*60,554,12,3,'#96724f');}
 rect(64,502,55,30,'#626858');rect(69,505,45,10,'#858b70');rect(75,507,12,4,'#d9cb90');
 rect(73,520,35,3,'#383f34');rect(84,523,12,9,'#fff0d5');
 for(let i=0;i<3;i++){rect(147+i*20,523,12,9,'#f9edd7');rect(157+i*20,525,4,5,'#e7d5b5');}
 for(let i=0;i<3;i++)rect(87+Math.sin(time*2+i)*3,510-i*7-(time*8%7),2,5,'#fff7e599');
 plant(224,532);text('Take a moment. Stay a while.',141,618,'#8a6b50',8,'center');
 // Shared recreation area, well clear of the workstation aisles.
 rug(320,170,275,86);rect(346,186,211,45,'#8a9471');
 rect(341,193,14,49,'#78825f');rect(550,193,14,49,'#78825f');
 for(let i=0;i<3;i++)rect(360+i*61,190,54,35,'#a5ad89');
 rect(371,194,29,23,'#e1bd84');rect(513,194,29,23,'#bc8066');
 rect(395,242,118,9,'#b88859');rect(405,251,5,12,'#8a6949');rect(500,251,5,12,'#8a6949');
 rect(442,235,24,7,'#e7d5ae');plant(607,241);
 text('THE COMMON ROOM',455,164,'#876a50',8,'center');
 // Ping-pong table with a net, paddles, and a ball.
 rect(781,222,6,33,'#8e795c');rect(982,222,6,33,'#8e795c');
 rect(768,181,232,60,'#526e57');rect(768,177,232,59,'#789681');
 ctx.strokeStyle='#e9e5c8';ctx.lineWidth=2;ctx.strokeRect(774,183,220,47);
 line(774,207,994,207,'#e9e5c8',2);rect(882,175,3,61,'#f2e4c6');
 for(let y=177;y<226;y+=5)line(877,y,890,y,'#e1ddc7');
 rect(875,172,3,63,'#6d745d');rect(890,172,3,63,'#6d745d');
 rect(790,192,12,11,'#b97055');rect(795,203,3,9,'#e7cea4');rect(960,213,12,11,'#dbc086');rect(964,224,3,8,'#e7cea4');rect(946,191,5,5,'#fff5dc');
 text('A LITTLE FRIENDLY COMPETITION',884,271,'#876a50',8,'center');plant(1060,235);
 // Smaller desks have generous space on every side.
 for(let i=0;i<8;i++){const {x,y}=deskPosition(i);drawDesk(x,y,i,list[i]);}
 for(let i=0;i<8;i++){
  const s=list[i];const {x,y}=deskPosition(i);
  if(!s){text('OPEN DESK',x,y+85,'#9b7d5b',8,'center');continue;}
  let cx=x,cy=y+24;if(s.status==='idle'){cx+=Math.sin(time*.16+i*2)*28;cy=y+48+Math.cos(time*.16+i*2)*5;}
  character(cx,cy,s,time,i);
  text(s.title.length>23?s.title.slice(0,22)+'…':s.title,x,y+87,'#654e3c',9,'center');
  text(statuses[s.status].toUpperCase(),x,y+102,'#927458',7,'center');
 }
 rect(0,H-12,W,12,'#aa8561');rect(0,H-12,W,3,'#efdab7');
 if(hovered){const h=hitboxes.find(h=>h.session.id===hovered?.id);if(h){ctx.strokeStyle='#7c8660';ctx.lineWidth=1;ctx.strokeRect(h.x-3,h.y-4,h.w+6,h.h+8);}}
}
canvas.addEventListener('mousemove',e=>{const box=canvas.getBoundingClientRect();const x=(e.clientX-box.left)/box.width*W,y=(e.clientY-box.top)/box.height*H;hovered=hitboxes.find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h)?.session;canvas.style.cursor=hovered?'pointer':'default';const tip=$('#tooltip');if(!hovered){tip.style.display='none';return;}tip.innerHTML=`<div class="tooltip-title">${escape(hovered.title)}</div><div class="tooltip-meta">${statuses[hovered.status]} · ${hovered.harness==='claude'?'Claude Code':hovered.source==='cli'?'Codex CLI / Warp':hovered.source==='desktop'?'Codex desktop':'Codex session'}</div><div class="tooltip-meta">${escape(hovered.project)}</div><div class="tooltip-detail">${escape(hovered.detail||'No additional activity detail available.')}</div><div class="tooltip-action">Click to open session ↗</div>`;tip.style.display='block';tip.style.left=`${canvas.offsetLeft+Math.max(8,Math.min(e.clientX-box.left+15,box.width-255))}px`;tip.style.top=`${canvas.offsetTop+Math.max(8,Math.min(e.clientY-box.top-120,box.height-tip.offsetHeight-8))}px`;});canvas.addEventListener('mouseleave',()=>{hovered=undefined;$('#tooltip').style.display='none';});canvas.addEventListener('click',()=>{if(hovered)void focus(hovered.id);});
function tickClock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('#date').textContent=now.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});$('#daypart').textContent=now.getHours()<7?'AFTER HOURS':now.getHours()<12?'MORNING LIGHT':now.getHours()<18?'AFTERNOON SHIFT':'CITY LIGHTS';}tickClock();setInterval(tickClock,10000);
let frame=0;let lastFrame=0;function animate(t:number){if(t-lastFrame>32){draw(t/1000);lastFrame=t;}frame=requestAnimationFrame(animate);}document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);if(!document.hidden)frame=requestAnimationFrame(animate);});frame=requestAnimationFrame(animate);
async function init(){if(typeof window.office?.getSnapshot==='function'){try{snapshot=await window.office.getSnapshot();window.office.onSnapshot(s=>{snapshot=s;renderState();});}catch(e){snapshot.message=`Could not connect to local tracking: ${String(e)}`;}}else{snapshot=mock();snapshot.message='Browser preview · Demo characters only. Open the desktop app to connect live sessions.';}renderState();}void init();
