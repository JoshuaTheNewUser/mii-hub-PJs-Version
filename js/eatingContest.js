/* PJ's Version: 3D eating contest, built as a separate Three.js game scene like Paintball. */
(function (root) {
  "use strict";
  const THREE = root.THREE, M = root.MiiModel;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const pick = a => a[Math.floor(Math.random()*a.length)];
  const foods = [
    {name:"Burger", color:0xc77b32, top:0xe8c54a, icon:"🍔"},
    {name:"Pizza", color:0xd95a38, top:0xf3d16b, icon:"🍕"},
    {name:"Cake", color:0xf1a6c7, top:0xffe9f0, icon:"🍰"},
    {name:"Taco", color:0xbfa34e, top:0x68b85d, icon:"🌮"},
    {name:"Sushi", color:0xeeeeea, top:0xe96b54, icon:"🍣"}
  ];
  let active = null;
  const mat = (color, roughness=0.72) => new THREE.MeshStandardMaterial({color, roughness});
  function mesh(geo, material, parent, x=0,y=0,z=0) {
    const o=new THREE.Mesh(geo,material); o.position.set(x,y,z); o.castShadow=true; o.receiveShadow=true; parent.add(o); return o;
  }
  function roundedBox(w,h,d,r,color,parent,x=0,y=0,z=0) {
    const g = root.RoundedBoxGeometry ? new root.RoundedBoxGeometry(w,h,d,3,r) : new THREE.BoxGeometry(w,h,d);
    return mesh(g,mat(color),parent,x,y,z);
  }
  function makeFood(kind, parent, scale=1) {
    const group=new THREE.Group(); parent.add(group); group.scale.setScalar(scale);
    const base=mat(kind.color), topping=mat(kind.top), dark=mat(0x75462b), green=mat(0x4caa52), white=mat(0xfff4db);
    if(kind.name==="Burger"){
      mesh(new THREE.CylinderGeometry(.22,.22,.10,20),base,group,0,0,0);
      mesh(new THREE.CylinderGeometry(.23,.23,.06,20),green,group,0,.075,0);
      mesh(new THREE.CylinderGeometry(.22,.22,.10,20),topping,group,0,.13,0);
      mesh(new THREE.SphereGeometry(.22,20,12,0,Math.PI*2,0,Math.PI/2),topping,group,0,.18,0);
      for(let i=0;i<5;i++) mesh(new THREE.SphereGeometry(.012,6,5),white,group,(Math.random()-.5)*.28,.28, (Math.random()-.5)*.28);
    } else if(kind.name==="Pizza"){
      mesh(new THREE.CylinderGeometry(.25,.25,.055,24),topping,group,0,0,0);
      mesh(new THREE.CylinderGeometry(.215,.215,.06,24),base,group,0,.012,0);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(new THREE.SphereGeometry(.045,10,8),dark,group,Math.cos(a)*.13,.05,Math.sin(a)*.13);}
      for(let i=0;i<4;i++){const a=i*1.7;mesh(new THREE.SphereGeometry(.035,8,6),green,group,Math.cos(a)*.1,.05,Math.sin(a)*.1);}
    } else if(kind.name==="Cake"){
      mesh(new THREE.CylinderGeometry(.22,.22,.16,20),base,group,0,0,0);
      mesh(new THREE.CylinderGeometry(.225,.225,.045,20),topping,group,0,.095,0);
      mesh(new THREE.SphereGeometry(.055,12,8),mat(0xd94c67),group,0,.16,0);
    } else if(kind.name==="Taco"){
      mesh(new THREE.SphereGeometry(.23,18,10,0,Math.PI,0,Math.PI),topping,group,0,0,0).rotation.z=Math.PI;
      for(let i=0;i<5;i++) mesh(new THREE.SphereGeometry(.045,8,6),green,group,(i-2)*.07,.07,0);
      mesh(new THREE.SphereGeometry(.04,8,6),base,group,0,.085,.04);
    } else {
      mesh(new THREE.BoxGeometry(.34,.1,.19),white,group,0,0,0);
      mesh(new THREE.BoxGeometry(.18,.06,.18),topping,group,0,.07,0);
      mesh(new THREE.BoxGeometry(.04,.075,.19),dark,group,0,.08,0);
    }
    return group;
  }
  function makePlate(parent,x,z) {
    const p=mesh(new THREE.CylinderGeometry(.34,.36,.045,32),mat(0xf8f5e9),parent,x,.99,z);
    p.receiveShadow=true;
    mesh(new THREE.CylinderGeometry(.27,.28,.012,32),mat(0xd9e7ef),parent,x,1.02,z);
  }
  function open(opts) {
    if(active) active.close();
    const candidates=(opts.walkers||[]).filter(w=>w&&w.template&&w.look&&!w.held&&!w.ghost);
    if(candidates.length<2){alert("Add at least two visible Miis to play the 3D eating contest.");return;}
    const stage=opts.stage;
    const players=candidates.slice().sort(()=>Math.random()-.5).slice(0,4).map((w,i)=>({
      walker:w, name:w.look.name||"Mii", score:0, fullness:0, oldState:w.state, oldArms:w.arms,
      user:i===0, nextEat:1.3+Math.random()*1.7, food:null, foodT:0, cheer:0, pos:new THREE.Vector3()
    }));
    const overlay=document.createElement("div"); overlay.className="ec3d-overlay";
    const canvas=document.createElement("canvas"); canvas.className="ec3d-canvas"; canvas.setAttribute("aria-label","3D eating contest arena");
    const hud=document.createElement("div"); hud.className="ec3d-hud";
    const brand=document.createElement("div"); brand.className="ec3d-brand"; brand.textContent="🍽️ 3D EATING CONTEST";
    const hint=document.createElement("div"); hint.className="ec3d-hint"; hint.textContent="SPACE / ENTER / CLICK TO EAT";
    const scoreboard=document.createElement("div"); scoreboard.className="ec3d-scoreboard";
    const timerEl=document.createElement("div"); timerEl.className="ec3d-timer"; timerEl.textContent="20.0";
    const close=document.createElement("button"); close.className="ec3d-exit"; close.textContent="✕ EXIT";
    const status=document.createElement("div"); status.className="ec3d-status"; status.textContent=players[0].name+" is you! Mash SPACE to eat!";
    hud.append(brand,timerEl,hint,scoreboard,close); overlay.append(canvas,hud,status); stage.appendChild(overlay);
    let renderer,scene,camera,raf=0,closed=false,finished=false,started=performance.now(),last=started,elapsed=0,clock=0,roundFood=pick(foods), foodCooldown=0;
    const disposables=[];
    try{
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
      renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,1.6));
      renderer.setSize(overlay.clientWidth,overlay.clientHeight,false);
      renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.outputEncoding=THREE.sRGBEncoding;
      scene=new THREE.Scene(); scene.background=new THREE.Color(0x9eddf2); scene.fog=new THREE.Fog(0x9eddf2,18,42);
      camera=new THREE.PerspectiveCamera(42,overlay.clientWidth/overlay.clientHeight,.1,100);
      camera.position.set(0,7.5,12.8); camera.lookAt(0,.8,0);
      scene.add(new THREE.HemisphereLight(0xfff8ed,0x69858a,2.1));
      const sun=new THREE.DirectionalLight(0xfff0d7,2.5);sun.position.set(-5,11,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
      const fill=new THREE.PointLight(0x76baff,65,22);fill.position.set(5,5,-5);scene.add(fill);
      const arena=new THREE.Group();scene.add(arena);
      mesh(new THREE.PlaneGeometry(35,35),mat(0x68bd75),arena,0,-.08,0).rotation.x=-Math.PI/2;
      // checkerboard stage and colorful set dressing
      mesh(new THREE.CylinderGeometry(6.8,7.1,.22,64),mat(0xffd46a),arena,0,.02,0);
      mesh(new THREE.CylinderGeometry(6.55,6.6,.12,64),mat(0xf4f0dd),arena,0,.18,0);
      for(let i=0;i<16;i++){const a=i*Math.PI/8;const pillar=mesh(new THREE.CylinderGeometry(.12,.16,1.8,12),mat([0xff786b,0x5ac8e8,0xffd34e,0x9b82e8][i%4]),arena,Math.cos(a)*5.8,1,Math.sin(a)*5.8);pillar.position.y=.95;}
      // central table, pedestal, trim
      roundedBox(4.7,.24,3.3,.13,0x9b603c,arena,0,1.12,0);
      roundedBox(4.55,.12,3.15,.08,0xf7d49b,arena,0,1.27,0);
      roundedBox(.55,1.0,.55,.08,0x8c5839,arena,0,.55,0);
      const plateSpots=[[0,1.12],[0,-1.12],[-1.65,0],[1.65,0]];
      const seats=[new THREE.Vector3(0,0,2.65),new THREE.Vector3(0,0,-2.65),new THREE.Vector3(-3.05,0,0),new THREE.Vector3(3.05,0,0)];
      players.forEach((p,i)=>{
        p.pos.copy(seats[i]);p.yaw=i===0?Math.PI:i===1?0: i===2?-Math.PI/2:Math.PI/2;
        // stool + Mii clone, isolated from the roaming hub copy
        const sx=seats[i].x,sz=seats[i].z;
        const stool=mesh(new THREE.CylinderGeometry(.42,.48,.45,20),mat(i===0?0x4aa9d5:0xf3c75d),arena,sx,.25,sz);
        const inst=M.createInstance(p.walker.template,p.walker.look);p.inst=inst;arena.add(inst.holder);
        inst.holder.position.set(sx,.38,sz);inst.holder.rotation.y=p.yaw;inst.holder.scale.setScalar(1);
        p.walker.state="playing";p.walker.arms="eat";
        const spot=plateSpots[i];makePlate(arena,spot[0],spot[1]);
        p.plate=new THREE.Vector3(spot[0],1.42,spot[1]);
        p.foodGroup=new THREE.Group();arena.add(p.foodGroup);p.foodGroup.position.copy(p.plate);
        p.foodObj=makeFood(roundFood,p.foodGroup,.8);p.foodObj.position.y=.1;
        // 3D floating score marker, made from a canvas texture, not a game menu
        const c=document.createElement("canvas");c.width=256;c.height=80;const cx=c.getContext("2d");
        cx.fillStyle="rgba(24,38,48,.76)";cx.beginPath();cx.roundRect(5,5,246,70,18);cx.fill();
        cx.font="bold 30px sans-serif";cx.fillStyle=i===0?"#ffe46c":"#ffffff";cx.textAlign="center";cx.fillText(p.name,128,36);
        cx.font="bold 25px sans-serif";cx.fillText("0 bites",128,65);
        const tex=new THREE.CanvasTexture(c);const sm=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});p.scoreSprite=new THREE.Sprite(sm);p.scoreSprite.scale.set(1.6,.5,1);p.scoreSprite.position.set(sx,3.15,sz);arena.add(p.scoreSprite);p.scoreCanvas=c;p.scoreCtx=cx;p.scoreTex=tex;
      });
      // decorations: banner and little pennants
      for(let i=0;i<9;i++){const x=-4+i;const flag=mesh(new THREE.ConeGeometry(.22,.38,3),mat([0xf45d65,0xffd44a,0x49bfe8][i%3]),arena,x,3.7,-4.5);flag.rotation.z=Math.PI;}
    }catch(e){console.error("3D eating contest failed",e);overlay.remove();alert("Could not start the 3D contest. Check the browser console for details.");return;}
    function resize(){if(closed)return;const w=Math.max(1,overlay.clientWidth),h=Math.max(1,overlay.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
    function setFull(p,v){p.fullness=clamp(v,0,1);M.setEatingFullness(p.inst,p.fullness);}
    function updateScore(p){p.scoreCtx.clearRect(0,0,256,80);p.scoreCtx.fillStyle="rgba(24,38,48,.76)";p.scoreCtx.beginPath();p.scoreCtx.roundRect(5,5,246,70,18);p.scoreCtx.fill();p.scoreCtx.font="bold 30px sans-serif";p.scoreCtx.fillStyle=p.user?"#ffe46c":"#ffffff";p.scoreCtx.textAlign="center";p.scoreCtx.fillText(p.name,128,36);p.scoreCtx.font="bold 25px sans-serif";p.scoreCtx.fillText(p.score+" bites",128,65);p.scoreTex.needsUpdate=true;}
    function eat(p){if(closed||finished)return;p.score++;setFull(p,Math.min(.95,p.fullness+.085));p.foodT=0;p.cheer=.35;p.foodGroup.visible=true;p.foodObj.visible=true;p.foodObj.position.set(0,.1,0);p.foodObj.scale.setScalar(.8);p.foodGroup.userData.target=new THREE.Vector3(p.pos.x*.28,2.1,p.pos.z*.28);updateScore(p);status.textContent=p.user?"NOM NOM! Keep going!":p.name+" takes a bite!";if(p.score%5===0)status.textContent=p.name+" is on a roll!";}
    function key(e){if(e.code==="Space"||e.code==="Enter"){e.preventDefault();if(!e.repeat)eat(players[0]);}if(e.code==="Escape")closeGame();}
    function pointer(e){if(e.target===canvas)eat(players[0]);}
    function closeGame(){if(closed)return;closed=true;if(raf)cancelAnimationFrame(raf);root.removeEventListener("keydown",key);canvas.removeEventListener("pointerdown",pointer);root.removeEventListener("resize",resize);players.forEach(p=>{setFull(p,0);p.walker.arms=p.oldArms||"down";p.walker.state=p.oldState==="playing"?"idle":p.oldState;M.disposeObject(p.inst.holder);if(p.scoreTex)p.scoreTex.dispose();});renderer.dispose();overlay.remove();if(active&&active.close===closeGame)active=null;}
    close.addEventListener("click",closeGame);canvas.addEventListener("pointerdown",pointer);root.addEventListener("keydown",key);root.addEventListener("resize",resize);overlay.tabIndex=0;overlay.focus();
    function finish(){finished=true;const winner=players.slice().sort((a,b)=>b.score-a.score)[0];status.textContent="🏆 "+winner.name+" WINS!  •  "+winner.score+" bites";hint.textContent="PRESS SPACE / CLICK TO PLAY AGAIN";timerEl.textContent="FINISH";players.forEach(p=>{p.inst.rig.pose({t:clock,dt:.016,arms:p===winner?"cheer":"eat",dance:p===winner});});}
    function frame(now){
      if(closed)return;raf=requestAnimationFrame(frame);
      const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;
      if(!finished){elapsed=(now-started)/1000;const left=Math.max(0,20-elapsed);timerEl.textContent=left.toFixed(1);foodCooldown-=dt;
        players.forEach(p=>{
          p.nextEat-=dt;
          if(!p.user&&p.nextEat<=0){eat(p);p.nextEat=.7+Math.random()*1.1;}
          p.foodT+=dt;
          if(p.foodT<.24){const t=p.foodT/.24;p.foodGroup.position.lerpVectors(p.plate,p.foodGroup.userData.target||p.plate,t);p.foodGroup.scale.setScalar(1-t*.55);}
          else{p.foodGroup.position.copy(p.plate);p.foodGroup.scale.setScalar(1);p.foodGroup.userData.target=null;}
          p.foodObj.rotation.y+=dt*2.4;p.foodObj.rotation.x=Math.sin(clock*5+p.score)*.08;
          p.inst.rig.pose({t:clock,dt,arms:p.foodT<.25?"eat":"eat",sit:true,laugh:p.cheer>0});
          p.cheer=Math.max(0,p.cheer-dt);
          p.scoreSprite.position.y=3.15+Math.sin(clock*2+iSeed(p))*0.05;
        });
        if(left<=0)finish();
      } else {
        players.forEach(p=>{p.inst.rig.pose({t:clock,dt,arms:p.score===Math.max(...players.map(q=>q.score))?"cheer":"eat",sit:true,dance:p.score===Math.max(...players.map(q=>q.score))});});
      }
      camera.position.x=Math.sin(clock*.12)*.65;camera.position.y=7.5+Math.sin(clock*.2)*.18;camera.lookAt(0,.95,0);
      renderer.render(scene,camera);
      scoreboard.textContent=players.map(p=>(p.user?"★ ":"")+p.name+": "+p.score).join("   •   ");
    }
    function iSeed(p){return players.indexOf(p)*1.7;}
    active={close:closeGame};raf=requestAnimationFrame(frame);
  }
  root.MiiEatingContest={open};
})(typeof window!=="undefined"?window:this);
