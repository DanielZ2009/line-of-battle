/* Educational Age-of-Sail model. Metres and simulated seconds; numerical
   damage, polar, gun arcs and collision costs are stated design assumptions. */
(function(root){
 'use strict';
 const TAU=Math.PI*2,C={width:1800,height:1100,speed:4,turnRate:.026,gap:110,range:350,reload:120,ballSpeed:400,timeScale:24,gunArc:Math.PI/12,windFrom:-Math.PI/2,noGo:Math.PI/3,retreatRadius:3600,retreatWarning:2800,retreatGrace:12};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angle=a=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI,distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const HULL=[[28,0],[17,-7.5],[-24,-7.5],[-27,-4.5],[-27,4.5],[-24,7.5],[17,7.5]];
 function sample(path,s){
  if(s<=path[0].s)return {...path[0]};let lo=0,hi=path.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(path[m].s<s)lo=m+1;else hi=m;}
  const b=path[lo],a=path[Math.max(0,lo-1)],t=clamp((s-a.s)/(b.s-a.s||1),0,1);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,a:Math.atan2(b.y-a.y,b.x-a.x),s};
 }
 function hull(ship){const ca=Math.cos(ship.a),sa=Math.sin(ship.a);return HULL.map(([x,y])=>({x:ship.x+x*ca-y*sa,y:ship.y+x*sa+y*ca}));}
 function overlaps(a,b){
  if(distance(a,b)>57)return false;const p=hull(a),q=hull(b);
  for(const poly of [p,q])for(let i=0;i<poly.length;i++){
   const u=poly[i],v=poly[(i+1)%poly.length],nx=-(v.y-u.y),ny=v.x-u.x;
   const P=p.map(z=>z.x*nx+z.y*ny),Q=q.map(z=>z.x*nx+z.y*ny);
   if(Math.max(...P)<=Math.min(...Q)+1e-5||Math.max(...Q)<=Math.min(...P)+1e-5)return false;
  }return true;
 }
 // Clip a ray against the same convex hull used by movement and rendering.
 function hullRay(x,y,dx,dy,ship){
  const ca=Math.cos(ship.a),sa=Math.sin(ship.a),rx=x-ship.x,ry=y-ship.y;
  const p={x:rx*ca+ry*sa,y:-rx*sa+ry*ca},v={x:dx*ca+dy*sa,y:-dx*sa+dy*ca};
  let entry=0,exit=Infinity;
  for(let i=0;i<HULL.length;i++){
   const a=HULL[i],b=HULL[(i+1)%HULL.length],ex=b[0]-a[0],ey=b[1]-a[1];
   // Polygon is clockwise; interior is the right side of every edge.
   const base=ex*(p.y-a[1])-ey*(p.x-a[0]),rate=ex*v.y-ey*v.x;
   if(Math.abs(rate)<1e-10){if(base>1e-7)return null;continue;}
   const t=-base/rate;if(rate<0)entry=Math.max(entry,t);else exit=Math.min(exit,t);
   if(entry>exit)return null;
  }
  if(exit<0||entry>exit)return null;
  return {entry:Math.max(0,entry),exit,path:Math.max(0,exit-Math.max(0,entry))*Math.hypot(dx,dy),localX:p.x+v.x*entry,localY:p.y+v.y*entry};
 }
 function hitHull(x,y,dx,dy,ship){const h=hullRay(x,y,dx,dy,ship);return h&&h.entry<=1?h.entry:null;}
 function polar(a){const d=Math.abs(angle(a-C.windFrom));if(d<=C.noGo)return 0;if(d<Math.PI/2)return (d-C.noGo)/(Math.PI/2-C.noGo);return 1-.18*(d-Math.PI/2)/(Math.PI/2);}
 function makeFleet(id,x,y,a){
  const path=[];for(let s=-900;s<=0;s+=2)path.push({x:x+Math.cos(a)*s,y:y+Math.sin(a)*s,a,s});
  return {id,x,y,a,s:0,path,manual:0,target:null,ships:Array.from({length:6},(_,i)=>({id:id+'-'+(i+1),fleet:id,x:x-Math.cos(a)*i*C.gap,y:y-Math.sin(a)*i*C.gap,a,s:-i*C.gap,hp:100,crew:100,rigging:100,rudder:100,speed:3.5,cool:[0,0],flash:[0,0],fouled:0}))};
 }
 class Battle{
  constructor(mode='ai'){this.reset(mode);}
  reset(mode='ai'){
   this.mode=mode;this.fleets=[makeFleet(0,750,690,0),makeFleet(1,1050,410,Math.PI)];this.balls=[];this.effects=[];this.wrecks=[];this.events=[];this.time=0;this.realTime=0;this.tick=0;this.state='ready';this.winner=null;this.reason=null;this.shots=0;this.hits=0;this.contacts=new Map();this.lastRake=-100;this.lastFriendly=-100;this.pace=C.timeScale;this.centre={x:900,y:550};this.retreat=[0,1].map(()=>({outside:false,remaining:C.retreatGrace,warned:false}));
  }
  emit(text){this.events.push({time:this.time,text});if(this.events.length>40)this.events.shift();}
  start(){if(this.state==='ready'){this.state='playing';this.emit('Battle joined. Batteries fire as the enemy bears.');}}
  resign(id=0){if(!['playing','paused'].includes(this.state)||![0,1].includes(id))return false;this.state='finished';this.winner=1-id;this.reason='resignation';this.emit((id===0?'Blue':'Red')+' strikes its colours.');return true;}
  getShips(){return this.fleets.flatMap(f=>f.ships);}
  obstacles(){return [...this.getShips(),...this.wrecks.filter(w=>!w.sunk)];}
  steer(id,target){if(this.state!=='playing')return;this.fleets[id].target=target&&Number.isFinite(target.x+target.y)?{x:target.x,y:target.y}:null;}
  setPace(scale){if(![12,24,36].includes(scale))return false;this.pace=scale;return true;}
  checkRetreat(realDt){
   if(this.state!=='playing')return;const withdrawn=[];
   for(const f of this.fleets){const s=f.ships[0],r=this.retreat[f.id];if(!s)continue;const d=distance(s,this.centre);r.warned=d>C.retreatWarning;
    if(d>C.retreatRadius){if(!r.outside)this.emit((f.id?'Red':'Blue')+' is leaving the battle. Return within '+C.retreatGrace+' seconds or retreat.');r.outside=true;r.remaining=Math.max(0,r.remaining-realDt);if(r.remaining<=1e-8)withdrawn.push(f.id);}
    else{if(r.outside)this.emit((f.id?'Red':'Blue')+' returns to the battle. Retreat cancelled.');r.outside=false;r.remaining=C.retreatGrace;}
   }
   if(withdrawn.length){this.state='finished';this.reason='retreat';this.winner=withdrawn.length===2?'draw':1-withdrawn[0];this.emit(withdrawn.length===2?'Both fleets withdraw from the battle.':(withdrawn[0]?'Red':'Blue')+' retreats. The opposing fleet wins.');}
  }
  // Replace only an empty interval of the wake. Live ships keep exactly their
  // world poses; arc coordinates ahead are remapped by the extra route length.
  bypassGap(f,behind,ahead){
   const lo=behind.s,hi=ahead.s,span=hi-lo;if(span<90)return false;
   const blocked=this.wrecks.filter(w=>!w.sunk&&w.fleet===f.id&&w.s>lo&&w.s<hi&&distance(w,sample(f.path,w.s))<65);if(!blocked.length)return false;
   const start=sample(f.path,lo),end=sample(f.path,hi),dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
   const lee=ny>=0?1:-1;let route=null;
   search:for(const sign of [lee,-lee])for(const h of [Math.max(25,span*.12),Math.max(38,span*.18),Math.max(60,span*.28)]){
    const points=[],steps=Math.ceil(span/2);let arc=lo,previous=null;
    for(let k=0;k<=steps;k++){const t=k/steps,p=sample(f.path,lo+span*t),offset=sign*h*Math.sin(Math.PI*t)**2,q={x:p.x+nx*offset,y:p.y+ny*offset};if(previous)arc+=distance(previous,q);q.s=arc;q.a=previous?Math.atan2(q.y-previous.y,q.x-previous.x):behind.a;points.push(q);previous=q;}
    if(points.every(p=>this.obstacles().every(o=>o.id===behind.id||o.id===ahead.id||!overlaps(p,o)))){route=points;break search;}
   }
   if(!route)return false;const delta=route[route.length-1].s-hi;
   f.path=[...f.path.filter(p=>p.s<lo),...route,...f.path.filter(p=>p.s>hi).map(p=>({...p,s:p.s+delta}))];
   for(const s of f.ships)if(s.s>=hi)s.s+=delta;for(const w of this.wrecks)if(w.fleet===f.id&&w.s>=hi)w.s+=delta;f.s=f.ships[0].s;
   this.emit((f.id?'Red':'Blue')+' survivors pass the disabled ship and reform the line.');return true;
  }
  damageForHit(b,ship,h){
   const longitudinal=Math.abs(Math.cos(b.a-ship.a)),rake=longitudinal>.85&&h.path>25;
   const stern=rake&&h.localX<-18,bow=rake&&h.localX>18;
   const exposure=clamp(h.path/15,0.35,3.6),energy=b.energy*(1-.45*clamp(b.travel/C.range,0,1));
   // More exposed gun-deck length affects fighting strength, not a fixed HP bonus.
   const entryFactor=stern?1.15:bow?.9:1;
   return {hull:4.8*energy,crew:(3+4*exposure)*energy*entryFactor,rigging:(1.5+exposure)*energy,rudder:stern?12*energy:0,rake,stern,bow,energy};
  }
  targetFor(ship,side){
   const normal=ship.a+(side===0?-Math.PI/2:Math.PI/2),foes=this.fleets[1-ship.fleet].ships;
   const eligible=foes.filter(e=>distance(ship,e)<=C.range&&Math.abs(angle(Math.atan2(e.y-ship.y,e.x-ship.x)-normal))<=C.gunArc).sort((a,b)=>distance(ship,a)-distance(ship,b));
   for(const target of eligible){
    const dx=target.x-ship.x,dy=target.y-ship.y;
    const masked=this.obstacles().some(other=>other.id!==ship.id&&other.id!==target.id&&(other.fleet===ship.fleet||other.struck)&&hitHull(ship.x,ship.y,dx,dy,other)!==null);
    if(!masked)return target;
   }return null;
  }
  fireBattery(ship,side,target){
   if(ship.cool[side]>0||!target)return false;
   ship.cool[side]=C.reload/(.35+.65*ship.crew/100);ship.flash[side]=4;
   const normal=ship.a+(side===0?-Math.PI/2:Math.PI/2),flight=distance(ship,target)/C.ballSpeed;
   const aim=Math.atan2(target.y+Math.sin(target.a)*target.speed*flight-ship.y,target.x+Math.cos(target.a)*target.speed*flight-ship.x);
   // Gun training is constrained to its side of the hull. Three markers represent
   // gun groups, not three literal guns or a reconstruction of a particular ship.
   const base=normal+clamp(angle(aim-normal),-C.gunArc,C.gunArc);
   for(let i=-1;i<=1;i++){
    const along=i*15,a=normal+clamp(angle(base-normal)+i*.055*(side===0?1:-1),-C.gunArc,C.gunArc);
    this.balls.push({x:ship.x+Math.cos(ship.a)*along+Math.cos(normal)*8.5,y:ship.y+Math.sin(ship.a)*along+Math.sin(normal)*8.5,a,vx:Math.cos(a)*C.ballSpeed,vy:Math.sin(a)*C.ballSpeed,owner:ship.id,fleet:ship.fleet,left:C.range,travel:0,energy:1,struckIds:new Set([ship.id])});
   }this.shots+=3;return true;
  }
  autoFire(){
   // Determine all batteries before firing, giving both fleets the same opportunity.
   const orders=[];for(const s of this.getShips())for(const side of [0,1])if(s.cool[side]<=0){const t=this.targetFor(s,side);if(t)orders.push([s,side,t]);}
   const groups=new Map();for(const [s,side,t] of orders){this.fireBattery(s,side,t);const key=s.fleet+':'+side;groups.set(key,(groups.get(key)||0)+1);}
   for(const [key,n] of groups){const [id,side]=key.split(':');this.emit((id==='0'?'Blue':'Red')+' '+(side==='0'?'port':'starboard')+' batteries engage ('+n+' '+(n===1?'ship':'ships')+').');}
  }
  ai(id){
   const f=this.fleets[id],foe=this.fleets[1-id];f.aiActive=true;if(!f.ships.length||!foe.ships.length)return;
   const e=foe.ships.reduce((best,s)=>distance(f,s)<distance(f,best)?s:best,foe.ships[0]);
   const r=distance(f,e),bearing=Math.atan2(e.y-f.y,e.x-f.x),direction=angle(bearing-f.a)>=0?1:-1;
   let desired=bearing;
   if(r<350&&(this.time+id*90)%300>50)desired=bearing-direction*Math.PI/2+direction*clamp((r-190)/220,-.7,.7);
   else desired=Math.atan2(e.y+Math.sin(e.a)*150-f.y,e.x+Math.cos(e.a)*150-f.x);
   if(Math.abs(angle(desired-C.windFrom))<C.noGo+.12){const side=angle(desired-C.windFrom)>=0?1:-1;desired=C.windFrom+side*(C.noGo+.25);}
   if(distance(f,this.centre)>C.retreatWarning-200)desired=Math.atan2(this.centre.y-f.y,this.centre.x-f.x);
   if(Math.abs(angle(desired-C.windFrom))<C.noGo+.12)desired=C.windFrom+(angle(desired-C.windFrom)>=0?1:-1)*(C.noGo+.25);
   f.target={x:f.x+Math.cos(desired)*240,y:f.y+Math.sin(desired)*240};
   // Avoid physically pushing a contacted hull; turn toward a clear flank.
   const head=f.ships[0],near=this.obstacles().find(s=>s.id!==head.id&&distance(s,head)<100&&Math.abs(angle(Math.atan2(s.y-head.y,s.x-head.x)-head.a))<1.15);
   if(near&&!f.avoid){const relative=angle(Math.atan2(near.y-head.y,near.x-head.x)-head.a);const away=relative>=0?-1:1;let a=f.a+away*1.35;if(Math.abs(angle(a-C.windFrom))<C.noGo+.15)a=C.windFrom+(angle(a-C.windFrom)>=0?1:-1)*(C.noGo+.25);f.avoid={id:near.id,a};}
   if(f.avoid){const obstacle=this.obstacles().find(s=>s.id===f.avoid.id);if(!obstacle||obstacle.sunk||distance(obstacle,head)>180)f.avoid=null;else f.target={x:f.x+Math.cos(f.avoid.a)*240,y:f.y+Math.sin(f.avoid.a)*240};}
  }
  contact(a,b){
   const key=[a.id,b.id].sort().join('|'),last=this.contacts.get(key);
   if(last!==undefined&&this.time-last<60)return;
   this.contacts.set(key,this.time);const relative=Math.hypot(Math.cos(a.a)*a.speed-Math.cos(b.a)*(b.speed||0),Math.sin(a.a)*a.speed-Math.sin(b.a)*(b.speed||0));
   a.fouled=Math.max(a.fouled,12);b.fouled=Math.max(b.fouled||0,12);
   // Backing topsails is an automatic crew response to clear a fouled bow.
   // Reverse only along the ship's own wake, preserving the line's geometry.
   for(const s of [a,b])if(this.fleets[s.fleet]?.ships[0]===s&&!s.struck)s.backing=35;
   for(const s of [a,b])if(!s.struck){s.rigging=Math.max(0,s.rigging-2-relative);s.hp-=relative*.6;}
   this.emit('Hull contact: ships checked and rigging fouled. Steer clear.');this.effects.push({kind:'contact',x:(a.x+b.x)/2,y:(a.y+b.y)/2,life:12,max:12});
  }
  moveFleet(f,dt){
   if(!f.ships.length)return;const obstacles=this.obstacles();
   for(let i=0;i<f.ships.length;i++){
    const s=f.ships[i];for(const side of [0,1]){s.cool[side]=Math.max(0,s.cool[side]-dt);s.flash[side]=Math.max(0,s.flash[side]-dt);}s.fouled=Math.max(0,s.fouled-dt);
    const old={x:s.x,y:s.y,a:s.a,s:s.s,speed:s.speed};
    const desiredSpeed=C.speed*polar(s.a)*(.25+.75*s.rigging/100)*(s.fouled>0?.08:1);
    let speed=s.speed+clamp(desiredSpeed-s.speed,-.8*dt,.3*dt);
    let proposal,advance;
    if(i===0){
     let desired=s.a;if(f.manual)desired=s.a+f.manual*.6;else if(f.target&&distance(s,f.target)>20)desired=Math.atan2(f.target.y-s.y,f.target.x-s.x);
     const stranded=this.wrecks.find(w=>!w.sunk&&distance(s,w)<220&&Math.abs(angle(Math.atan2(w.y-s.y,w.x-s.x)-s.a))<.8);
     if(stranded&&!f.manual&&!f.target&&!f.recovery){const b=Math.atan2(stranded.y-s.y,stranded.x-s.x),side=Math.cos(b)>=0?1:-1;f.recovery={x:stranded.x-Math.sin(b)*side*100+Math.cos(b)*150,y:stranded.y+Math.cos(b)*side*100+Math.sin(b)*150};}
     if(f.recovery){if(f.manual||f.target||distance(s,f.recovery)<35)f.recovery=null;else desired=Math.atan2(f.recovery.y-s.y,f.recovery.x-s.x);}
     const turn=C.turnRate*(.12+.88*clamp(speed/2.8,0,1))*(.2+.8*s.rudder/100);
     let delta=angle(desired-s.a);
     if(f.aiActive&&Math.abs(angle(s.a-C.windFrom))>C.noGo){
      const toWind=angle(C.windFrom-s.a);
      // An AI admiral wears away from the wind rather than repeatedly stalling
      // while trying to cross the upwind sector without a sail-handling model.
      if(Math.sign(toWind)===Math.sign(delta)&&Math.abs(toWind)<Math.abs(delta))delta-=Math.sign(delta)*TAU;
     }
     const a=angle(s.a+clamp(delta,-turn*dt,turn*dt));
     if(s.backing>0){
      s.backing=Math.max(0,s.backing-dt);advance=-.65*dt;speed=-.65;
      proposal=sample(f.path,s.s+advance);proposal.a=a;
      if(obstacles.some(other=>other.id!==s.id&&overlaps(proposal,other)))proposal.a=s.a;
     }else{advance=speed*dt;proposal={x:s.x+Math.cos(a)*advance,y:s.y+Math.sin(a)*advance,a,s:s.s+advance};}
    }else{
     const limit=f.ships[i-1].s-C.gap;
     // When the flagship backs, the following ships back along their own wake
     // too, rather than compressing the line into the flagship's stern.
     advance=limit<s.s?Math.max(-.65*dt,limit-s.s):Math.max(0,Math.min(speed*dt,limit-s.s));
     if(advance<speed*dt*.2)speed=advance/dt;
     proposal=sample(f.path,s.s+advance);
    }
    const blocker=obstacles.find(other=>other.id!==s.id&&overlaps(proposal,other));
    if(blocker){this.contact(s,blocker);s.speed=0;}
    else{
     Object.assign(s,proposal);s.speed=speed;
     if(i===0){f.x=s.x;f.y=s.y;f.a=s.a;f.s=s.s;if(advance<0)f.path=f.path.filter(p=>p.s<s.s);if(Math.abs(advance)>1e-7)f.path.push({x:s.x,y:s.y,a:s.a,s:s.s});}
    }
    // Pose rejection prevents penetration; no positional teleport or hull sliding.
    if(!Number.isFinite(s.x+s.y+s.a))Object.assign(s,old);
   }
   const tail=f.ships[f.ships.length-1];let cut=0;while(cut<f.path.length-2&&f.path[cut+1].s<tail.s-250)cut++;if(cut)f.path.splice(0,cut);
  }
  removeSunk(){
   for(const w of this.wrecks)if(!w.sunk&&w.hp<=0){w.sunk=true;this.effects.push({kind:'sink',x:w.x,y:w.y,a:w.a,life:36,max:36});this.emit('A struck ship sinks.');}
   for(const f of this.fleets){
    const head=f.ships[0],lost=f.ships.filter(s=>s.hp<=0||s.crew<=18);
    for(const s of lost){const sunk=s.hp<=0;this.emit((f.id===0?'Blue':'Red')+' ship '+s.id.split('-')[1]+(sunk?' sinks.':' strikes its colours.'));this.wrecks.push({...s,speed:0,struck:true,sunk});this.effects.push({kind:sunk?'sink':'strike',x:s.x,y:s.y,a:s.a,life:36,max:36});}
    f.ships=f.ships.filter(s=>s.hp>0&&s.crew>18);
    if(head&&lost.includes(head)&&f.ships.length){const s=f.ships[0];f.x=s.x;f.y=s.y;f.a=s.a;f.s=s.s;f.path=f.path.filter(p=>p.s<s.s);f.path.push({x:s.x,y:s.y,a:s.a,s:s.s});f.avoid=null;f.recovery=null;s.backing=0;this.emit((f.id?'Red':'Blue')+' ship '+s.id.split('-')[1]+' takes command.');}
    if(lost.length)for(let i=1;i<f.ships.length;i++)this.bypassGap(f,f.ships[i],f.ships[i-1]);
   }
   if(this.fleets.some(f=>!f.ships.length)){this.state='finished';this.winner=this.fleets.every(f=>!f.ships.length)?'draw':(this.fleets[0].ships.length?0:1);this.reason='fleet-defeated';this.emit(this.winner==='draw'?'Both fleets are out of action.':(this.winner===0?'Blue':'Red')+' wins the battle.');}
  }
  step(realDt=1/60){
   if(this.state!=='playing')return;realDt=clamp(realDt,0,.05);this.realTime+=realDt;
   // Substeps also keep hull motion shorter than the narrowest hull dimension.
   const n=Math.max(1,Math.ceil(realDt*this.pace/.2)),dt=realDt*this.pace/n;
   for(let sub=0;sub<n&&this.state==='playing';sub++){
    this.time+=dt;this.tick++;if(this.mode==='ai')this.ai(1);
    const order=this.tick%2?[0,1]:[1,0];for(const id of order)this.moveFleet(this.fleets[id],dt);
    this.autoFire();const ships=this.obstacles(),remaining=[];
    for(const b of this.balls){
     let budget=Math.min(b.left,C.ballSpeed*dt),alive=true,iterations=0;
     while(budget>1e-6&&alive&&iterations++<4){
      const ux=Math.cos(b.a),uy=Math.sin(b.a),dx=ux*budget,dy=uy*budget;
      let first=null,at=Infinity,hit=null;
      for(const ship of ships){if(b.struckIds.has(ship.id)||ship.hp<=0)continue;const h=hullRay(b.x,b.y,dx,dy,ship);if(h&&h.entry<=1&&h.entry<at){at=h.entry;first=ship;hit=h;}}
      if(!first){b.x+=dx;b.y+=dy;b.travel+=budget;b.left-=budget;budget=0;break;}
      const travelled=budget*at;b.x+=ux*travelled;b.y+=uy*travelled;b.travel+=travelled;b.left-=travelled;budget-=travelled;
      const damage=this.damageForHit(b,first,hit);first.hp-=damage.hull;
      if(!first.struck){first.crew=Math.max(0,first.crew-damage.crew);first.rigging=Math.max(0,first.rigging-damage.rigging);first.rudder=Math.max(0,first.rudder-damage.rudder);}this.hits++;
      this.effects.push({kind:'hit',x:b.x,y:b.y,life:8,max:8,rake:damage.rake,friendly:first.fleet===b.fleet});
      if(damage.rake&&this.time-this.lastRake>24){this.emit((damage.stern?'Stern rake':damage.bow?'Bow rake':'Raking hit')+': shot sweeps the gun deck. Fighting strength reduced.');this.lastRake=this.time;}
      if(first.fleet===b.fleet&&this.time-this.lastFriendly>24){this.emit('Friendly fire: a hull crossed the path of shot.');this.lastFriendly=this.time;}
      b.struckIds.add(first.id);b.energy=damage.energy-(damage.stern?.22:.34)-hit.path*.004;
      alive=b.energy>.25&&b.struckIds.size<4;
     }
     if(alive&&b.left>1e-6)remaining.push(b);else if(alive)this.effects.push({kind:'splash',x:b.x,y:b.y,life:6,max:6});
    }
    this.balls=remaining;this.removeSunk();this.checkRetreat(realDt/n);this.effects=this.effects.filter(e=>(e.life-=dt)>0);
   }
  }
  snapshot(){return {state:this.state,time:Math.round(this.time),realTime:Math.round(this.realTime),mode:this.mode,winner:this.winner,reason:this.reason,windFrom:'N',timeScale:this.pace,retreat:this.retreat.map(r=>({...r,remaining:Math.ceil(r.remaining)})),retreatRadius:C.retreatRadius,fleets:this.fleets.map(f=>({id:f.id,ships:f.ships.map(s=>({id:s.id,x:Math.round(s.x),y:Math.round(s.y),heading:Math.round(s.a*180/Math.PI),hull:Math.round(s.hp),fightingStrength:Math.round(s.crew),rigging:Math.round(s.rigging),speedKnots:Math.round(s.speed*1.94384*10)/10,fouled:s.fouled>0,port:Math.round(s.cool[0]),starboard:Math.round(s.cool[1])}))})),struck:this.wrecks.filter(w=>!w.sunk).length};}
 }
 root.Naval={Battle,C,HULL,angle,distance,sample,hull,hullRay,hitHull,overlaps,polar};if(typeof module!=='undefined'&&module.exports)module.exports=root.Naval;
})(typeof globalThis!=='undefined'?globalThis:this);
