(function(){
 'use strict';
 const $=id=>document.getElementById(id),canvas=$('sea'),ctx=canvas.getContext('2d');
 const {Battle,C,HULL,polar}=Naval,colors=['#6dd2e6','#f18572'];
 let battle=new Battle(),keys=new Set(),drag=false,view={scale:1,x:0,y:0,w:1,h:1},camera={x:900,y:550},last=0,accumulator=0,lastHud=-1,shownEvents=-1;
 const initialOverlay=$('overlay').innerHTML;
 function resize(){
   const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
   canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
   const scale=Math.min(r.width/C.width,r.height/C.height);
   view={scale,x:(r.width-C.width*scale)/2,y:(r.height-C.height*scale)/2,w:r.width,h:r.height,dpr};
   draw();
 }
 function toWorld(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-view.x)/view.scale+camera.x-C.width/2,y:(e.clientY-r.top-view.y)/view.scale+camera.y-C.height/2};}
 function fresh(){battle=new Battle($('mode')?.value||battle.mode);battle.setPace(Number($('pace').value));camera={x:900,y:550};keys.clear();drag=false;shownEvents=-1;lastHud=-1;accumulator=0;$('overlay').innerHTML=initialOverlay;$('overlay').hidden=false;$('mode').value=battle.mode;bindStart();hud();draw();}
 function start(){battle.mode=$('mode').value;battle.start();$('overlay').hidden=true;$('duel-help').hidden=battle.mode!=='duel';$('enemy-name').textContent=battle.mode==='duel'?'Player 2':'Enemy fleet';canvas.focus({preventScroll:true});hud();}
 function bindStart(){$('start').addEventListener('click',start);}
 function pause(){
   if(battle.state==='playing'){battle.state='paused';keys.clear();battle.fleets.forEach(f=>f.manual=0);drag=false;battle.fleets[0].target=null;}
   else if(battle.state==='paused')battle.state='playing';
   hud();
 }
 bindStart();$('restart').addEventListener('click',fresh);$('pause').addEventListener('click',pause);
 $('resign').addEventListener('click',()=>{battle.resign(0);hud();});$('resign-red').addEventListener('click',()=>{battle.resign(1);hud();});$('ranges').addEventListener('change',draw);
 $('pace').addEventListener('change',()=>{battle.setPace(Number($('pace').value));hud();});
 canvas.addEventListener('pointerdown',e=>{if(battle.state!=='playing')return;drag=true;canvas.setPointerCapture(e.pointerId);battle.steer(0,toWorld(e));canvas.focus({preventScroll:true});});
 canvas.addEventListener('pointermove',e=>{if(drag)battle.steer(0,toWorld(e));});
 const release=()=>{drag=false;battle.fleets[0].target=null;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
 window.addEventListener('keydown',e=>{
   if(['SELECT','INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
   const k=e.key.toLowerCase();if(['arrowleft','arrowright',' ','a','d','j','l','r'].includes(k))e.preventDefault();
   if(e.repeat)return;
   if(k===' '){pause();return;}if(k==='r'){fresh();return;}
   keys.add(k);

 });
 window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
 window.addEventListener('blur',()=>{keys.clear();if(battle.state==='playing')pause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&battle.state==='playing')pause();last=0;accumulator=0;});
 function controls(){battle.fleets[0].manual=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);if(battle.mode==='duel')battle.fleets[1].manual=(keys.has('l')?1:0)-(keys.has('j')?1:0);}
 function hud(){
   const active=battle.state==='playing',blue=battle.fleets[0],red=battle.fleets[1];
   $('blue-count').textContent=blue.ships.length+' ships';$('red-count').textContent=red.ships.length+' ships';
   $('clock').textContent=String(Math.floor(battle.time/60)).padStart(2,'0')+':'+String(Math.floor(battle.time%60)).padStart(2,'0');
   $('pace-note').textContent='Space to pause · R for a new battle · '+battle.pace+'× time';
   $('pause').disabled=!['playing','paused'].includes(battle.state);$('pause').textContent=battle.state==='paused'?'Resume':'Pause';
   $('resign').disabled=!['playing','paused'].includes(battle.state);$('resign-red').disabled=$('resign').disabled;$('resign-red').hidden=battle.mode!=='duel';
   for(const [side,name] of [[0,'port'],[1,'starboard']]){
     const ready=blue.ships.filter(s=>s.cool[side]<=0).length;
     $(name+'-status').textContent=ready+' / '+blue.ships.length+' loaded';
     const progress=blue.ships.length?blue.ships.reduce((n,s)=>n+(1-s.cool[side]/(C.reload/(.35+.65*s.crew/100))),0)/blue.ships.length:0;
     $(name+'-fill').style.width=(100*Math.max(0,progress))+'%';
   }
   const head=blue.ships[0];$('speed-status').textContent=head?(head.speed*1.94384).toFixed(1)+' kn':'—';
   $('helm-note').textContent=head?.backing>0?'Backing topsails to clear the collision.':head?.fouled>0?'Rigging fouled: steer clear of the other hull.':head&&polar(head.a)<.15?'Into the wind: turn away to regain way.':'Keep your line clear and your broadside facing the enemy.';
   $('status').textContent=battle.state==='ready'?'Awaiting your command.':battle.state==='paused'?'Battle paused.':battle.state==='finished'?'Battle concluded.':'Steer your line · batteries fire automatically';
   const notices=battle.retreat.map((r,id)=>r.outside?(id?'RED':'BLUE')+': automatic retreat in '+Math.ceil(r.remaining)+'s. Return toward the battle.':r.warned?(id?'RED':'BLUE')+': nearing retreat distance. Turn back toward the battle.':'').filter(Boolean),warning=$('retreat-warning');
   warning.hidden=!notices.length||!['playing','paused'].includes(battle.state);warning.classList.toggle('danger',battle.retreat.some(r=>r.outside));const notice=notices.join(' · ');if(warning.textContent!==notice)warning.textContent=notice;
   if(shownEvents!==battle.events.length||shownEvents===40){
     shownEvents=battle.events.length;
     if(battle.events.length){$('log').replaceChildren(...battle.events.slice(-4).reverse().map(e=>{const d=document.createElement('div');d.textContent=String(Math.floor(e.time/60)).padStart(2,'0')+':'+String(Math.floor(e.time%60)).padStart(2,'0')+'  '+e.text;return d;}));}
     else $('log').textContent='The sea is clear. Guns are loaded.';
   }
   if(battle.state==='finished'&&$('overlay').hidden){
     const title=battle.reason==='retreat'?(battle.winner==='draw'?'Both fleets withdraw.':battle.winner===1?'Blue retreats.':'Red retreats.'):battle.reason==='resignation'?(battle.winner===1?'Blue strikes its colours.':'Red strikes its colours.'):battle.winner==='draw'?'Both fleets defeated.':battle.winner===0?'Victory, Admiral.':battle.mode==='duel'?'Red fleet victorious.':'Your fleet is defeated.';
     const text=battle.reason==='retreat'?'The fleet remained beyond the retreat limit after its warning.':battle.winner==='draw'?'Both lines have lost their fighting strength.':battle.winner===0?'You have command of the sea.':'The opposing line holds the sea.';
     $('overlay').innerHTML='<div class="start-panel"><span class="eyebrow">BATTLE CONCLUDED</span><h2>'+title+'</h2><p>'+text+'</p><p>'+Math.floor(battle.time/60)+'m '+Math.floor(battle.time%60)+'s · '+battle.shots+' shot markers fired · '+battle.hits+' hits</p><button id="again" class="primary">Sail again</button></div>';
     $('overlay').hidden=false;$('again').addEventListener('click',fresh);
   }
 }
 function pathLine(points,color,width,dash=[]){if(points.length<2)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
 function arc(ship,side,color){
   const a=ship.a+(side===0?-Math.PI/2:Math.PI/2),cool=ship.cool[side],alpha=cool>0?.018:.055;
   ctx.beginPath();ctx.moveTo(ship.x,ship.y);ctx.arc(ship.x,ship.y,C.range,a-C.gunArc,a+C.gunArc);ctx.closePath();ctx.fillStyle=color;ctx.globalAlpha=alpha;ctx.fill();ctx.globalAlpha=.13;ctx.lineWidth=1;ctx.strokeStyle=color;ctx.stroke();ctx.globalAlpha=1;
 }
 function drawShip(ship,isHead){
   const color=ship.struck?'#829499':colors[ship.fleet];
   ctx.save();ctx.translate(ship.x,ship.y);ctx.rotate(ship.a);
   // Tactical hull symbol, with a sharp bow and a square stern.
   ctx.beginPath();ctx.moveTo(...HULL[0]);for(const p of HULL.slice(1))ctx.lineTo(...p);ctx.closePath();
   ctx.fillStyle=ship.hp<30?'#45565a':'#10212b';ctx.strokeStyle=color;ctx.lineWidth=isHead?2.7:1.7;ctx.fill();ctx.stroke();
   ctx.fillStyle=color;ctx.globalAlpha=.65;ctx.fillRect(-15,-3,23,6);ctx.globalAlpha=1;
   ctx.strokeStyle='#d6d8bd';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-9,-7);ctx.lineTo(-9,7);ctx.moveTo(4,-7);ctx.lineTo(4,7);ctx.stroke();
   if(isHead){ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(16,-17);ctx.lineTo(4,-16);ctx.closePath();ctx.fillStyle=color;ctx.fill();}
   for(let side=0;side<2;side++)if(ship.flash[side]>0){const y=side===0?-15:15;ctx.fillStyle='#ffd48e';ctx.globalAlpha=ship.flash[side]/4;for(const x of [-13,0,13]){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
   if(ship.struck){ctx.fillStyle='#f0eee4';ctx.fillRect(0,-18,12,7);ctx.strokeStyle='#f0eee4';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-18);ctx.stroke();}ctx.restore();
   if(!ship.struck){ctx.fillStyle='#091820';ctx.fillRect(ship.x-23,ship.y+18,46,7);ctx.fillStyle=color;ctx.fillRect(ship.x-23,ship.y+18,46*Math.max(0,ship.hp)/100,2.5);ctx.fillStyle='#e4be76';ctx.fillRect(ship.x-23,ship.y+23,46*Math.max(0,ship.crew)/100,2.5);}
 }
 function draw(){
   const d=view.dpr||1;ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#0b222e';ctx.fillRect(0,0,view.w,view.h);
   ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
   const left=camera.x-C.width/2,top=camera.y-C.height/2;
   ctx.save();ctx.beginPath();ctx.rect(0,0,C.width,C.height);ctx.clip();ctx.translate(-left,-top);
   const grad=ctx.createLinearGradient(left,top,left+C.width,top+C.height);grad.addColorStop(0,'#123543');grad.addColorStop(1,'#0b2533');ctx.fillStyle=grad;ctx.fillRect(left,top,C.width,C.height);
   ctx.strokeStyle='#6b96a216';ctx.lineWidth=1;ctx.beginPath();for(let x=Math.floor(left/100)*100;x<=left+C.width;x+=100){ctx.moveTo(x,top);ctx.lineTo(x,top+C.height);}for(let y=Math.floor(top/100)*100;y<=top+C.height;y+=100){ctx.moveTo(left,y);ctx.lineTo(left+C.width,y);}ctx.stroke();
   for(const [radius,color] of [[C.retreatWarning,'#e4be7640'],[C.retreatRadius,'#f1857270']]){ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash([15,12]);ctx.beginPath();ctx.arc(battle.centre.x,battle.centre.y,radius,0,Math.PI*2);ctx.stroke();}ctx.setLineDash([]);
   // Compass and scale belong to the chart rather than the battle simulation.
   ctx.save();ctx.translate(left+C.width-100,top+105);ctx.strokeStyle='#a9b9ad55';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.moveTo(-45,0);ctx.lineTo(45,0);ctx.moveTo(0,-45);ctx.lineTo(0,45);ctx.stroke();ctx.fillStyle='#bcc8bc88';ctx.font='17px Georgia';ctx.textAlign='center';ctx.fillText('N',0,-53);ctx.strokeStyle='#6dd2e6';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(0,20);ctx.lineTo(-6,11);ctx.moveTo(0,20);ctx.lineTo(6,11);ctx.stroke();ctx.font='13px sans-serif';ctx.fillStyle='#6dd2e6';ctx.fillText('WIND',0,62);ctx.restore();
   ctx.strokeStyle='#a9b9ad55';ctx.beginPath();ctx.moveTo(left+C.width-220,top+C.height-65);ctx.lineTo(left+C.width-120,top+C.height-65);ctx.stroke();ctx.fillStyle='#adc2c366';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('100 m',left+C.width-170,top+C.height-43);
   for(const f of battle.fleets){
     if(!f.ships.length)continue;
     const tail=f.ships[f.ships.length-1],wake=f.path.filter(p=>p.s>tail.s-70);
     pathLine(wake,colors[f.id]+'25',3);pathLine(wake.filter(p=>p.s>=tail.s),colors[f.id]+'66',1.2,[5,8]);
     if($('ranges').checked)for(const s of f.ships)for(let side=0;side<2;side++)arc(s,side,colors[f.id]);
     for(let i=f.ships.length-1;i>=0;i--)drawShip(f.ships[i],i===0);
   }
   for(const w of battle.wrecks)if(!w.sunk)drawShip(w,false);
   if(drag&&battle.fleets[0].target){const t=battle.fleets[0].target;ctx.strokeStyle=colors[0];ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(t.x,t.y,12,0,Math.PI*2);ctx.moveTo(t.x-20,t.y);ctx.lineTo(t.x+20,t.y);ctx.moveTo(t.x,t.y-20);ctx.lineTo(t.x,t.y+20);ctx.stroke();}
   for(const b of battle.balls){ctx.strokeStyle='#f7d7a1';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(b.x-b.vx*.016,b.y-b.vy*.016);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle='#fff0c9';ctx.beginPath();ctx.arc(b.x,b.y,2.5,0,Math.PI*2);ctx.fill();}
   for(const e of battle.effects){
     const age=1-e.life/e.max;ctx.globalAlpha=1-age;ctx.lineWidth=e.kind==='sink'?3:2;ctx.strokeStyle=e.kind==='hit'?(e.friendly?'#f29bba':'#ffcf8d'):'#a5d3df';
     ctx.beginPath();ctx.ellipse(e.x,e.y,4+age*(e.kind==='sink'?40:18),3+age*(e.kind==='sink'?25:15),0,0,Math.PI*2);ctx.stroke();
     if(e.kind==='hit'){ctx.fillStyle='#fff1c7';ctx.beginPath();ctx.arc(e.x,e.y,5*(1-age),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
   }
   if(battle.state==='paused'){ctx.fillStyle='#071a2699';ctx.fillRect(left,top,C.width,C.height);ctx.fillStyle='#ecede4';ctx.font='52px Georgia';ctx.textAlign='center';ctx.fillText('Battle paused',camera.x,camera.y);ctx.font='22px sans-serif';ctx.fillStyle='#b7c8cf';ctx.fillText('Space or Resume to continue',camera.x,camera.y+48);}
   ctx.restore();
   drawIndicators(left,top);
 }
 function drawIndicators(left,top){
   const groups=new Map();for(const s of battle.getShips()){
    const x=s.x-left,y=s.y-top;if(x>=35&&x<=C.width-35&&y>=35&&y<=C.height-35)continue;
    const a=Math.atan2(s.y-camera.y,s.x-camera.x),key=s.fleet+':'+Math.round(a/(Math.PI/12)),g=groups.get(key)||{x:0,y:0,count:0,fleet:s.fleet};g.x+=s.x;g.y+=s.y;g.count++;groups.set(key,g);
   }
   const arrows=[...groups.values()].map(g=>({x:g.x/g.count,y:g.y/g.count,color:colors[g.fleet],label:(g.fleet?'Enemy':'Your line')+' ×'+g.count}));
   if(battle.retreat.some(r=>r.warned)&&(battle.centre.x<left+35||battle.centre.x>left+C.width-35||battle.centre.y<top+35||battle.centre.y>top+C.height-35))arrows.push({...battle.centre,color:'#e4be76',label:'Return to battle'});
   for(const p of arrows){const dx=p.x-camera.x,dy=p.y-camera.y,a=Math.atan2(dy,dx),t=Math.min((C.width/2-Math.max(65,24/view.scale))/Math.max(Math.abs(dx),1),(C.height/2-Math.max(75,50/view.scale))/Math.max(Math.abs(dy),1)),x=C.width/2+dx*t,y=C.height/2+dy*t,size=Math.max(16,8/view.scale);
    ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.6,-size*.65);ctx.lineTo(-size*.6,size*.65);ctx.closePath();ctx.fill();ctx.restore();
    const label=p.label+' · '+(Math.hypot(dx,dy)/1000).toFixed(1)+' km',font=Math.max(18,12/view.scale);ctx.font=font+'px sans-serif';ctx.textAlign='center';ctx.fillStyle='#081c29e8';const width=ctx.measureText(label).width,tx=Math.max(width/2+18,Math.min(C.width-width/2-18,x-Math.cos(a)*Math.max(110,70/view.scale))),ty=Math.max(font+20,Math.min(C.height-font-35,y-Math.sin(a)*Math.max(40,25/view.scale)));ctx.fillRect(tx-width/2-9,ty-font*.75-6,width+18,font+12);ctx.fillStyle=p.color;ctx.fillText(label,tx,ty+font*.25);
   }
 }
 function followCamera(dt){
   if(battle.state!=='playing')return;const ships=battle.mode==='duel'?battle.getShips():battle.fleets[0].ships;if(!ships.length)return;
   const xs=ships.map(s=>s.x),ys=ships.map(s=>s.y),head=battle.fleets[0].ships[0],lead=battle.mode==='ai'&&head?180:0,target={x:(Math.min(...xs)+Math.max(...xs))/2+Math.cos(head?.a||0)*lead,y:(Math.min(...ys)+Math.max(...ys))/2+Math.sin(head?.a||0)*lead},t=1-Math.exp(-6*dt);camera.x+=(target.x-camera.x)*t;camera.y+=(target.y-camera.y)*t;
 }
 function frame(now){
   const elapsed=last?Math.min((now-last)/1000,.1):0;if(last)accumulator+=elapsed;last=now;
   while(accumulator>=1/60){controls();battle.step(1/60);accumulator-=1/60;}
   followCamera(elapsed);
   draw();if(now-lastHud>100){hud();lastHud=now;}requestAnimationFrame(frame);
 }
 const tools=[
   {name:'read_battle',title:'Read battle',description:'Read fleet positions, health, reloads and battle status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>battle.snapshot()},
   {name:'start_battle',title:'Start battle',description:'Start a ready battle, or reset the current battle and start a new one with the selected opponent.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['ai','duel']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false},execute:i=>{if(!['ai','duel'].includes(i.mode))throw new Error('Choose ai or duel.');fresh();$('mode').value=i.mode;start();return battle.snapshot();}},
   {name:'resign_battle',title:'Resign battle',description:'Resign the selected fleet in an active or paused battle, awarding victory to the opponent.',inputSchema:{type:'object',properties:{fleet:{type:'integer',enum:[0,1]}},required:['fleet'],additionalProperties:false},annotations:{readOnlyHint:false},execute:i=>{if(![0,1].includes(i.fleet)||(i.fleet===1&&battle.mode!=='duel'))throw new Error('Choose an available human fleet.');if(!battle.resign(i.fleet))throw new Error('Battle must be active or paused.');hud();return battle.snapshot();}}
 ];
 if(document.modelContext?.registerTool){const lifecycle=new AbortController();for(const t of tools){try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
 // The read-only snapshot is useful for checking the prototype without altering play.
 window.navalSnapshot=()=>battle.snapshot();
 new ResizeObserver(resize).observe(canvas);hud();resize();requestAnimationFrame(frame);
})();
