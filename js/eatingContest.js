(function (root) {
  "use strict";
  const M = root.MiiModel;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const FOOD = [{name:"Pizza",icon:"🍕"},{name:"Burgers",icon:"🍔"},{name:"Cake",icon:"🍰"},{name:"Sushi",icon:"🍣"},{name:"Tacos",icon:"🌮"}];
  let active = null;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function open(opts) {
    if (active) active.close();
    const candidates = (opts.walkers || []).filter(w => w && w.inst && !w.held);
    if (candidates.length < 2) {
      const back=el("div","choice-modal"), card=el("div","choice-card");
      card.append(el("h3","","Not enough Miis"),el("p","","Add at least two visible Miis to start the contest."));
      const ok=el("button","choice-btn","Got it"); ok.onclick=()=>back.remove(); card.appendChild(ok); back.appendChild(card); opts.stage.appendChild(back); return;
    }
    const players=candidates.slice().sort(()=>Math.random()-.5).slice(0,4).map(w=>({walker:w,name:w.look.name,score:0,fullness:0,oldState:w.state,oldArms:w.arms}));
    const first=FOOD[Math.floor(Math.random()*FOOD.length)], backdrop=el("div","game-modal"), card=el("div","game-card eating-contest-card");
    const head=el("div","gm-head"), trophy=el("div","ec-food","🏆"), titles=el("div","gm-titles");
    titles.append(el("div","gm-title","🍽️ Eating Contest"),el("div","gm-sub","Mii Hub: PJ's Version · 3 rounds"));
    const closeBtn=el("button","gm-close","✕"); closeBtn.setAttribute("aria-label","Close contest"); head.append(trophy,titles,closeBtn);
    const intro=el("p","ec-intro","A silly, simulated minigame. Scores are fictional; no real eating is involved.");
    const dish=el("div","ec-food",first.icon+" "+first.name), list=el("div","ec-players"), status=el("div","ec-status","Ready? Start the first round!");
    const controls=el("div","ec-controls"), action=el("button","gm-btn primary","Start round 1"), cancel=el("button","gm-btn","Back to hub");
    controls.append(action,cancel); card.append(head,intro,dish,list,status,controls); backdrop.appendChild(card); opts.stage.appendChild(backdrop);
    let round=0,closed=false,busy=false,raf=0;
    const setFull=(p,v)=>{p.fullness=clamp(v,0,1);M.setEatingFullness(p.walker.inst,p.fullness);};
    const animate=(p,target,duration)=>new Promise(resolve=>{
      const from=p.fullness,start=performance.now();
      const tick=now=>{if(closed){resolve();return;}const t=clamp((now-start)/duration,0,1),e=t*t*(3-2*t);setFull(p,from+(target-from)*e);if(t<1)raf=requestAnimationFrame(tick);else resolve();};
      raf=requestAnimationFrame(tick);
    });
    function render(){list.innerHTML="";for(const p of players){const box=el("div","ec-player"),img=el("img","ec-avatar"),details=el("div","");
      try{img.src=M.portrait(p.walker.template,p.walker.look,64);}catch(_){img.src="";}img.alt="";
      details.appendChild(el("div","ec-player-name",p.name));const meter=el("div","ec-meter"),fill=el("span","");fill.style.width=(p.fullness*100)+"%";meter.appendChild(fill);details.appendChild(meter);
      box.append(img,details,el("div","ec-player-score",String(p.score)));list.appendChild(box);}}
    const restore=()=>players.forEach(p=>{setFull(p,0);p.walker.arms=p.oldArms||"down";if(p.walker.state==="playing")p.walker.state=p.oldState==="playing"?"idle":p.oldState;});
    const onKey=e=>{if(e.key==="Escape"&&!closed)close();};
    function close(){if(closed)return;closed=true;if(raf)cancelAnimationFrame(raf);restore();backdrop.remove();document.removeEventListener("keydown",onKey);if(active&&active.close===close)active=null;}
    closeBtn.onclick=cancel.onclick=close;backdrop.addEventListener("pointerdown",e=>{if(e.target===backdrop)close();});document.addEventListener("keydown",onKey);
    players.forEach(p=>{p.walker.state="playing";p.walker.arms="eat";});active={close};render();
    action.addEventListener("click",async()=>{
      if(closed||busy)return;
      if(round>=3){round=0;players.forEach(p=>{p.score=0;setFull(p,0);});render();dish.textContent=first.icon+" "+first.name;status.textContent="Ready? Start the first round!";action.textContent="Start round 1";return;}
      busy=true;action.disabled=true;round++;const food=FOOD[(FOOD.indexOf(first)+round-1)%FOOD.length];dish.textContent=food.icon+" Round "+round+": "+food.name;status.textContent="The Miis are eating…";
      await Promise.all(players.map(async p=>{const energy=p.walker.trait?p.walker.trait("energy"):50;p.score+=Math.round(5+Math.random()*7+energy/25);await animate(p,Math.min(1,round*.27+Math.random()*.08),650);}));
      if(closed)return;render();
      if(round<3){status.textContent="Round "+round+" complete! Ready for the next dish?";action.textContent="Start round "+(round+1);}
      else{const best=Math.max(...players.map(p=>p.score)),winners=players.filter(p=>p.score===best);const result=winners.length>1?"🤝 It's a tie! "+winners.map(p=>p.name).join(" & ")+" share the trophy!":"🏆 "+winners[0].name+" wins the contest!";status.textContent=result;if(opts.hub&&opts.hub.addFeed)opts.hub.addFeed(result);action.textContent="Play again";await new Promise(r=>setTimeout(r,1300));if(!closed)await Promise.all(players.map(p=>animate(p,0,700)));if(!closed)render();}
      if(!closed){busy=false;action.disabled=false;}
    });
  }
  root.MiiEatingContest={open};
})(typeof window!=="undefined"?window:this);
