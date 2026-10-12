(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const levelValue = document.getElementById("levelValue");
  const timeValue = document.getElementById("timeValue");
  const killValue = document.getElementById("killValue");
  const scoreValue = document.getElementById("scoreValue");
  const hpBar = document.getElementById("hpBar");
  const xpBar = document.getElementById("xpBar");
  const hpValue = document.getElementById("hpValue");
  const xpValue = document.getElementById("xpValue");
  const bossHud = document.getElementById("bossHud");
  const bossBar = document.getElementById("bossBar");
  const bossValue = document.getElementById("bossValue");
  const bossLabelTitle = document.getElementById("bossLabelTitle");
  const startOverlay = document.getElementById("startOverlay");
  const levelOverlay = document.getElementById("levelOverlay");
  const resultOverlay = document.getElementById("resultOverlay");
  const resultBadge = document.getElementById("resultBadge");
  const resultTitle = document.getElementById("resultTitle");
  const resultText = document.getElementById("resultText");
  const upgradeList = document.getElementById("upgradeList");
  const startButton = document.getElementById("startButton");
  const retryButton = document.getElementById("retryButton");
  const audioButton = document.getElementById("audioButton");

  const W = canvas.width, H = canvas.height;
  const BOSS_INTERVAL = 5 * 60;

  let state = "menu";
  let lastTime = 0, elapsed = 0, spawnTimer = 0, shootTimer = 0;
  let killCount = 0, level = 1, xp = 0, xpNeed = 8, score = 0;
  let bossStarted = false, boss = null, bossShotTimer = 0, bossChargeTimer = 0;
  let bossCount = 0, bossClears = 0, nextBossTime = BOSS_INTERVAL;
  let rarePity = 0, epicPity = 0;

  // Web Audio API only: no external audio files are required.
  let audioCtx = null, masterGain = null, bgmGain = null, sfxGain = null;
  let audioEnabled = true, bgmTimer = null, bgmStep = 0;
  let lastShotSoundAt = 0, lastKillSoundAt = 0;

  function initAudio(){
    if(audioCtx) {
      if(audioCtx.state === "suspended") audioCtx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    bgmGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    masterGain.gain.value = audioEnabled ? .7 : 0;
    bgmGain.gain.value = .22;
    sfxGain.gain.value = .55;
    bgmGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);
    startBgm();
  }

  function tone(freq, duration=.08, type="square", volume=.08, delay=0, target="sfx"){
    if(!audioCtx || !audioEnabled) return;
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    const now=audioCtx.currentTime+delay;
    osc.type=type; osc.frequency.setValueAtTime(freq,now);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain); gain.connect(target==="bgm"?bgmGain:sfxGain);
    osc.start(now); osc.stop(now+duration+.03);
  }

  function noiseBurst(duration=.05, volume=.03){
    if(!audioCtx || !audioEnabled) return;
    const len=Math.max(1,Math.floor(audioCtx.sampleRate*duration));
    const buffer=audioCtx.createBuffer(1,len,audioCtx.sampleRate), data=buffer.getChannelData(0);
    for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
    const src=audioCtx.createBufferSource(), gain=audioCtx.createGain();
    src.buffer=buffer; gain.gain.value=volume; src.connect(gain); gain.connect(sfxGain); src.start();
  }

  function playSfx(name, tier="normal"){
    if(!audioCtx || !audioEnabled) return;
    const now=audioCtx.currentTime;
    if(name==="shoot"){
      if(now-lastShotSoundAt<.09) return; lastShotSoundAt=now;
      tone(390,.045,"square",.025); tone(610,.025,"triangle",.018,.01);
    } else if(name==="kill"){
      if(now-lastKillSoundAt<.055) return; lastKillSoundAt=now;
      tone(125,.055,"sawtooth",.028); noiseBurst(.035,.018);
    } else if(name==="xp"){
      const f=tier==="epic"?1047:(tier==="rare"?784:588);
      tone(f,.07,"sine",tier==="normal"?.028:.045); if(tier!=="normal") tone(f*1.25,.09,"sine",.03,.045);
    } else if(name==="level"){
      [523,659,784,1047].forEach((f,i)=>tone(f,.13,"triangle",.055,i*.07));
    } else if(name==="boss"){
      [110,98,82].forEach((f,i)=>tone(f,.34,"sawtooth",.09,i*.14)); noiseBurst(.18,.035);
    } else if(name==="bossDown"){
      [392,523,659,784,1047].forEach((f,i)=>tone(f,.18,"triangle",.065,i*.08));
    } else if(name==="shield"){
      tone(880,.1,"sine",.045); tone(1175,.13,"sine",.035,.06);
    }
  }

  function startBgm(){
    if(bgmTimer || !audioCtx) return;
    const lead=[220,0,262,294,330,0,294,262,220,0,262,330,392,330,294,262];
    const bass=[110,110,131,147];
    bgmTimer=setInterval(()=>{
      if(!audioCtx || !audioEnabled || state!=="playing") return;
      const f=lead[bgmStep%lead.length]; if(f) tone(f,.16,"triangle",.034,0,"bgm");
      if(bgmStep%4===0) tone(bass[(bgmStep/4)%bass.length|0],.28,"sine",.05,0,"bgm");
      bgmStep++;
    },220);
  }

  function toggleAudio(){
    initAudio(); audioEnabled=!audioEnabled;
    if(masterGain) masterGain.gain.setTargetAtTime(audioEnabled?.7:0,audioCtx.currentTime,.02);
    if(audioButton) audioButton.textContent=audioEnabled?"♫ ON":"♫ OFF";
  }

  const player = {
    x: W/2, y: H/2, r: 13, speed: 210, hp: 100, maxHp: 100,
    damage: 16, attackSpeed: .45, bulletSpeed: 420, bulletCount: 1,
    spread: .16, magnet: 95, armor: 0, regen: 0, crit: .08, critMult: 2,
    pierce: 0, knockback: 0, explosion: 0, explosionRadius: 62, bulletSize: 1,
    shield: 0, shieldMax: 0, shieldRecharge: 0, shieldRechargeTime: 24
  };

  let enemies = [], bullets = [], enemyBullets = [], gems = [], particles = [], floatingTexts = [];
  let keys = {}, pointerActive = false, pointerTarget = {x:W/2,y:H/2};

  const upgrades = [
    {title:"火力強化", desc:"攻撃力 +25%", apply(){player.damage*=1.25;}},
    {title:"連射強化", desc:"攻撃間隔を 12% 短縮", apply(){player.attackSpeed=Math.max(.14,player.attackSpeed*.88);}},
    {title:"マルチショット", desc:"同時発射数 +1", canPick(){return player.bulletCount<7;}, apply(){player.bulletCount=Math.min(7,player.bulletCount+1);}},
    {title:"移動速度", desc:"移動速度 +12%", apply(){player.speed*=1.12;}},
    {title:"最大HP", desc:"最大HP +20、HPも20回復", apply(){player.maxHp+=20;player.hp=Math.min(player.maxHp,player.hp+20);}},
    {title:"吸収範囲", desc:"経験値吸収範囲 +35", apply(){player.magnet+=35;}},
    {title:"防御力", desc:"被ダメージ -2", canPick(){return player.armor<18;}, apply(){player.armor=Math.min(18,player.armor+2);}},
    {title:"自動回復", desc:"毎秒 HP +1.0", apply(){player.regen+=1.0;}},
    {title:"会心率", desc:"クリティカル率 +7%", canPick(){return player.crit<.7;}, apply(){player.crit=Math.min(.7,player.crit+.07);}},
    {title:"弾速強化", desc:"弾速 +18%", apply(){player.bulletSpeed*=1.18;}},

    {title:"貫通弾", desc:"弾が敵をさらに1体貫通", canPick(){return player.pierce<4;}, apply(){player.pierce=Math.min(4,player.pierce+1);}},
    {title:"ノックバック", desc:"命中した敵を押し戻す力 +10", canPick(){return player.knockback<50;}, apply(){player.knockback=Math.min(50,player.knockback+10);}},
    {title:"爆発弾", desc:"命中時の爆発率 +12%（周囲にもダメージ）", canPick(){return player.explosion<.48;}, apply(){player.explosion=Math.min(.48,player.explosion+.12);player.explosionRadius+=4;}},
    {title:"エナジーシールド", desc:"シールド +1、さらに再生時間を12%短縮", canPick(){return player.shieldMax<6;}, apply(){player.shieldMax=Math.min(6,player.shieldMax+1);player.shield=player.shieldMax;player.shieldRecharge=0;player.shieldRechargeTime=Math.max(8,player.shieldRechargeTime*.88);}},
    {title:"会心威力", desc:"クリティカルダメージ +35%", canPick(){return player.critMult<4.1;}, apply(){player.critMult=Math.min(4.1,player.critMult+.35);}},
    {title:"巨大弾", desc:"弾サイズ +18%、爆発範囲も少し拡大", canPick(){return player.bulletSize<2.1;}, apply(){player.bulletSize=Math.min(2.1,player.bulletSize*1.18);player.explosionRadius+=3;}}
  ];

  const enemyDefs = {
    grunt:   {r:12, speed:64, hp:17, damage:10, xp:2, color:"#d95668", eye:"#21151a"},
    runner:  {r:10, speed:112,hp:12, damage:8,  xp:2, color:"#ff9e57", eye:"#351d12"},
    swarm:   {r:7,  speed:88, hp:7,  damage:5,  xp:1, color:"#a77cff", eye:"#21162f"},
    tank:    {r:20, speed:38, hp:70, damage:20, xp:7, color:"#7d6d86", eye:"#18131b"},
    shooter: {r:14, speed:45, hp:32, damage:9,  xp:5, color:"#45a9c7", eye:"#0b2730"},
    elite:   {r:19, speed:55, hp:95, damage:22, xp:10,color:"#ff625e", eye:"#2f1112"}
  };

  function resetGame(){
    state="playing"; elapsed=0; spawnTimer=0; shootTimer=0; killCount=0; level=1; xp=0; xpNeed=8; score=0;
    bossStarted=false; boss=null; bossShotTimer=0; bossChargeTimer=0; bossCount=0; bossClears=0; nextBossTime=BOSS_INTERVAL;
    rarePity=0; epicPity=0;
    enemies=[]; bullets=[]; enemyBullets=[]; gems=[]; particles=[]; floatingTexts=[];
    Object.assign(player,{x:W/2,y:H/2,r:13,speed:210,hp:100,maxHp:100,damage:16,attackSpeed:.45,bulletSpeed:420,bulletCount:1,spread:.16,magnet:95,armor:0,regen:0,crit:.08,critMult:2,pierce:0,knockback:0,explosion:0,explosionRadius:62,bulletSize:1,shield:0,shieldMax:0,shieldRecharge:0,shieldRechargeTime:24});
    bossHud.classList.remove("visible");
    startOverlay.classList.remove("visible"); resultOverlay.classList.remove("visible"); levelOverlay.classList.remove("visible");
    updateUI();
  }

  function edgeSpawn(){
    const m=45, side=Math.floor(Math.random()*4); let x,y;
    if(side===0){x=Math.random()*W;y=-m;} if(side===1){x=W+m;y=Math.random()*H;}
    if(side===2){x=Math.random()*W;y=H+m;} if(side===3){x=-m;y=Math.random()*H;}
    return {x,y};
  }

  function availableEnemyTypes(){
    const t=elapsed;
    const pool=["grunt","grunt","grunt"];
    if(t>=60) pool.push("runner","runner");
    if(t>=150) pool.push("swarm","swarm","swarm");
    if(t>=240) pool.push("tank");
    if(t>=360) pool.push("shooter","shooter");
    if(t>=540) pool.push("elite");
    if(t>=720) pool.push("tank","shooter","elite","runner");
    return pool;
  }

  function spawnEnemy(type=null){
    const pos=edgeSpawn();
    type = type || availableEnemyTypes()[Math.floor(Math.random()*availableEnemyTypes().length)];
    const d=enemyDefs[type];
    const scale=1+elapsed/520;
    const e={type,x:pos.x,y:pos.y,r:d.r,speed:d.speed+Math.random()*10,hp:d.hp*scale,maxHp:d.hp*scale,damage:d.damage,xp:d.xp,color:d.color,eye:d.eye,hitFlash:0,contactCooldown:0,shotTimer:.8+Math.random()*1.4};
    enemies.push(e);
    if(type==="swarm"){
      for(let i=0;i<2;i++){
        const q={...e,x:e.x+(Math.random()-.5)*24,y:e.y+(Math.random()-.5)*24,hp:e.hp,maxHp:e.maxHp,shotTimer:99};
        enemies.push(q);
      }
    }
  }

  function startBossBattle(){
    bossStarted=true;
    playSfx("boss");
    bossCount++;
    enemies=[]; enemyBullets=[]; gems=[];
    const cycleScale = 1 + (bossCount-1)*0.48;
    const bossHp = Math.max(1800, (1100 + level*95 + player.damage*48) * cycleScale);
    boss={x:W/2,y:105,r:54,hp:bossHp,maxHp:bossHp,damage:24+bossCount*3,speed:34+Math.min(18,bossCount*2),hitFlash:0,contactCooldown:0,phase:1,angle:0};
    bossShotTimer=.8; bossChargeTimer=4;
    bossLabelTitle.textContent=`BOSS ${bossCount}`;
    bossHud.classList.add("visible");
    floatingTexts.push({x:W/2,y:H/2-80,text:`BOSS ${bossCount} APPEARS!`,life:2,crit:true});
    burst(W/2,110,"#ff4f78",60);
  }

  function nearestEnemy(){
    let best=boss && boss.hp>0 ? boss : null, bestD=best ? (boss.x-player.x)**2+(boss.y-player.y)**2 : Infinity;
    for(const e of enemies){const dx=e.x-player.x,dy=e.y-player.y,d=dx*dx+dy*dy;if(d<bestD){bestD=d;best=e;}}
    return best;
  }

  function shoot(){
    const target=nearestEnemy(); if(!target)return;
    playSfx("shoot");
    const base=Math.atan2(target.y-player.y,target.x-player.x), count=player.bulletCount, total=player.spread*(count-1);
    for(let i=0;i<count;i++){
      const a=base-total/2+player.spread*i, crit=Math.random()<player.crit;
      bullets.push({x:player.x,y:player.y,vx:Math.cos(a)*player.bulletSpeed,vy:Math.sin(a)*player.bulletSpeed,r:(crit?5:4)*player.bulletSize,damage:player.damage*(crit?player.critMult:1),crit,life:1.8,pierce:player.pierce,hitTargets:new Set()});
    }
  }

  function enemyShoot(e){
    const a=Math.atan2(player.y-e.y,player.x-e.x);
    enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*165,vy:Math.sin(a)*165,r:5,damage:e.damage,life:4,color:"#63d8ff"});
  }

  function bossAttack(){
    if(!boss)return;
    const count=(boss.phase===1?10:15)+Math.min(8,bossCount);
    const speed=(boss.phase===1?130:168)+Math.min(40,bossCount*4);
    for(let i=0;i<count;i++){
      const a=boss.angle+(Math.PI*2*i/count);
      enemyBullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,damage:16,life:5,color:"#ff698e"});
    }
    boss.angle+=.28;
  }

  function gainXP(value, tier="normal"){
    playSfx("xp",tier);
    xp+=value;
    if(xp>=xpNeed){xp-=xpNeed;level++;xpNeed=Math.floor(8+level*3.3+Math.pow(level,1.48));playSfx("level");showLevelUp();}
    updateUI();
  }

  function showLevelUp(){
    if(bossStarted) return;
    state="levelup"; upgradeList.innerHTML="";
    const selectable=upgrades.filter(up=>!up.canPick||up.canPick());
    const pool=[...selectable].sort(()=>Math.random()-.5).slice(0,3);
    for(const up of pool){const btn=document.createElement("button");btn.className="upgrade-card";btn.innerHTML=`<strong>${up.title}</strong><span>${up.desc}</span>`;btn.onclick=()=>{up.apply();state="playing";levelOverlay.classList.remove("visible");updateUI();};upgradeList.appendChild(btn);}
    levelOverlay.classList.add("visible");
  }

  function createXpGem(x,y,baseValue,enemyType="grunt"){
    // 上位XPは出現率を抑える代わりに、取得時の経験値を大きくする。
    // rare: 基本15%、epic: 基本3%。さらにrareは12個、epicは36個の連続非出現で保証。
    rarePity++; epicPity++;
    let rareChance=.15, epicChance=.03;
    if(enemyType==="tank" || enemyType==="shooter"){rareChance+=.05;epicChance+=.015;}
    if(enemyType==="elite"){rareChance=.32;epicChance=.08;}

    const forceEpic=epicPity>=36;
    const forceRare=rarePity>=12;
    const roll=Math.random();
    let tier="normal", multiplier=1, r=6, color="#54ef98", glow="#65ffae", label="XP";

    if(forceEpic || roll<epicChance){
      tier="epic"; multiplier=12; r=11; color="#c06cff"; glow="#ffd76a"; label="XP++"; epicPity=0; rarePity=0;
    } else if(forceRare || roll<epicChance+rareChance){
      tier="rare"; multiplier=5; r=9; color="#58b8ff"; glow="#80d8ff"; label="XP+"; rarePity=0;
    }
    return {x,y,r,tier,color,glow,label,value:Math.max(1,Math.round(baseValue*multiplier)),vx:(Math.random()-.5)*50,vy:(Math.random()-.5)*50};
  }

  function damageEnemy(e,amount,crit){
    e.hp-=amount;e.hitFlash=.08;floatingTexts.push({x:e.x,y:e.y-e.r-4,text:`${Math.round(amount)}`,life:.55,crit});burst(e.x,e.y,crit?"#ffd76a":"#8be8ff",crit?8:4);
    if(e.hp<=0){killCount++;score+=Math.max(10, Math.round(e.maxHp*.45));gems.push(createXpGem(e.x,e.y,e.xp,e.type));playSfx("kill");burst(e.x,e.y,e.type==="elite"?"#ff7f6a":"#91f2c5",e.type==="elite"?24:10);return true;}return false;
  }

  function damageBoss(amount,crit){
    if(!boss)return false;
    boss.hp-=amount;boss.hitFlash=.08;floatingTexts.push({x:boss.x,y:boss.y-boss.r-8,text:`${Math.round(amount)}`,life:.55,crit});
    if(boss.hp<=boss.maxHp*.5) boss.phase=2;
    if(boss.hp<=0){boss.hp=0;burst(boss.x,boss.y,"#ffd36a",100);playSfx("bossDown");completeBossBattle();return true;}return false;
  }

  function completeBossBattle(){
    if(!bossStarted || !boss) return;
    const bonus = 1000 * bossCount;
    score += bonus;
    bossClears++;
    killCount++;
    floatingTexts.push({x:W/2,y:H/2-55,text:`BOSS DOWN! +${bonus}`,life:2.2,crit:true});
    player.hp = Math.min(player.maxHp, player.hp + Math.max(20, player.maxHp*.2));
    // ボス撃破時はシールドを全回復。再生待ち時間もリセットする。
    if(player.shieldMax>0){
      player.shield=player.shieldMax;
      player.shieldRecharge=0;
      floatingTexts.push({x:player.x,y:player.y-36,text:"SHIELD FULL!",life:1.5,crit:true});playSfx("shield");
      burst(player.x,player.y,"#66f6ff",24);
    }
    enemyBullets=[]; bullets=[];
    boss=null; bossStarted=false;
    bossHud.classList.remove("visible");
    nextBossTime = (bossCount + 1) * BOSS_INTERVAL;
    spawnTimer=.4;
    updateUI();
  }

  function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=40+Math.random()*150;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:1.5+Math.random()*2.5,color,life:.25+Math.random()*.55,maxLife:.8});}}

  function triggerExplosion(x,y,baseDamage,source=null){
    const radius=player.explosionRadius;
    burst(x,y,"#ffcf66",20);
    particles.push({x,y,vx:0,vy:0,r:radius*.15,color:"#ff9f57",life:.22,maxLife:.22,ring:true,maxR:radius});
    for(const e of enemies){
      if(e.hp<=0||e===source)continue;
      const d=Math.hypot(e.x-x,e.y-y);
      if(d<=radius){
        const dmg=baseDamage*.45*(1-d/radius*.35);
        if(damageEnemy(e,dmg,false)) e.hp=0;
      }
    }
    if(boss&&boss.hp>0&&boss!==source){
      const d=Math.hypot(boss.x-x,boss.y-y);
      if(d<=radius+boss.r) damageBoss(baseDamage*.32,false);
    }
  }

  function endGame(clear=false){
    state="result";
    resultBadge.textContent="RESULT";
    resultTitle.textContent="GAME OVER";
    resultText.innerHTML=`生存時間：<strong>${formatTime(elapsed)}</strong><br>スコア：<strong>${score}</strong><br>撃破数：<strong>${killCount}</strong><br>到達レベル：<strong>${level}</strong><br>撃破ボス：<strong>${bossClears}</strong>`;
    resultOverlay.classList.add("visible");
  }

  function hurtPlayer(dmg){
    if(player.shield>0){
      player.shield--;player.shieldRecharge=0;
      floatingTexts.push({x:player.x,y:player.y-24,text:"BLOCK!",life:.7,crit:true});
      burst(player.x,player.y,"#66f6ff",18);
      return;
    }
    dmg=Math.max(1,dmg-player.armor);player.hp-=dmg;floatingTexts.push({x:player.x,y:player.y-22,text:`-${Math.round(dmg)}`,life:.6,hurt:true});burst(player.x,player.y,"#ff5f70",10);
    if(player.hp<=0){player.hp=0;endGame(false);}
  }

  function update(dt){
    if(state!=="playing")return;
    elapsed+=dt;player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);
    if(player.shieldMax>0&&player.shield<player.shieldMax){
      player.shieldRecharge+=dt;
      if(player.shieldRecharge>=player.shieldRechargeTime){player.shield++;player.shieldRecharge=0;floatingTexts.push({x:player.x,y:player.y-30,text:"SHIELD +1",life:.9,crit:true});playSfx("shield");burst(player.x,player.y,"#66f6ff",12);}
    }

    if(!bossStarted && elapsed>=nextBossTime) startBossBattle();

    let mx=0,my=0;if(keys.ArrowLeft||keys.a||keys.A)mx--;if(keys.ArrowRight||keys.d||keys.D)mx++;if(keys.ArrowUp||keys.w||keys.W)my--;if(keys.ArrowDown||keys.s||keys.S)my++;
    if(pointerActive){const dx=pointerTarget.x-player.x,dy=pointerTarget.y-player.y,len=Math.hypot(dx,dy);if(len>8){mx=dx/len;my=dy/len;}}
    const ml=Math.hypot(mx,my)||1;if(mx||my){player.x+=mx/ml*player.speed*dt;player.y+=my/ml*player.speed*dt;}player.x=Math.max(18,Math.min(W-18,player.x));player.y=Math.max(18,Math.min(H-18,player.y));

    if(!bossStarted){
      spawnTimer-=dt;const interval=Math.max(.13,.66-elapsed*.00055);
      if(spawnTimer<=0){spawnTimer=interval;spawnEnemy();if(elapsed>180&&Math.random()<.20)spawnEnemy();if(elapsed>480&&Math.random()<.32)spawnEnemy();if(elapsed>720&&Math.random()<.38)spawnEnemy();}
    }

    shootTimer-=dt;if(shootTimer<=0){shootTimer=player.attackSpeed;shoot();}
    for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;}
    for(const b of enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;}

    for(const e of enemies){
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
      if(e.type==="shooter"){
        if(d>190){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}else if(d<135){e.x-=dx/d*e.speed*.7*dt;e.y-=dy/d*e.speed*.7*dt;}
        e.shotTimer-=dt;if(e.shotTimer<=0&&d<360){enemyShoot(e);e.shotTimer=1.5+Math.random()*.7;}
      }else{e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}
      e.hitFlash=Math.max(0,e.hitFlash-dt);e.contactCooldown=Math.max(0,e.contactCooldown-dt);
      if(d<player.r+e.r&&e.contactCooldown<=0){hurtPlayer(e.damage);e.contactCooldown=.7;if(state!=="playing")break;}
    }

    if(boss){
      const dx=player.x-boss.x,dy=player.y-boss.y,d=Math.hypot(dx,dy)||1;
      boss.x+=dx/d*boss.speed*dt;boss.y+=dy/d*boss.speed*dt;boss.hitFlash=Math.max(0,boss.hitFlash-dt);boss.contactCooldown=Math.max(0,boss.contactCooldown-dt);
      bossShotTimer-=dt;if(bossShotTimer<=0){bossAttack();bossShotTimer=boss.phase===1?1.55:1.05;}
      if(d<player.r+boss.r&&boss.contactCooldown<=0){hurtPlayer(boss.damage);boss.contactCooldown=.8;}
    }

    for(const b of bullets){
      if(b.life<=0)continue;
      if(boss&&boss.hp>0&&!b.hitTargets.has("boss")){
        const dx=b.x-boss.x,dy=b.y-boss.y,rr=b.r+boss.r;
        if(dx*dx+dy*dy<rr*rr){
          b.hitTargets.add("boss");damageBoss(b.damage,b.crit);
          if(Math.random()<player.explosion)triggerExplosion(b.x,b.y,b.damage,boss);
          if(b.pierce>0)b.pierce--;else b.life=0;
          if(b.life<=0)continue;
        }
      }
      for(const e of enemies){
        if(e.hp<=0||b.hitTargets.has(e))continue;
        const dx=b.x-e.x,dy=b.y-e.y,rr=b.r+e.r;
        if(dx*dx+dy*dy<rr*rr){
          b.hitTargets.add(e);
          if(damageEnemy(e,b.damage,b.crit))e.hp=0;
          if(player.knockback>0&&e.hp>0){const kdx=e.x-player.x,kdy=e.y-player.y,kd=Math.hypot(kdx,kdy)||1;e.x+=kdx/kd*player.knockback;e.y+=kdy/kd*player.knockback;}
          if(Math.random()<player.explosion)triggerExplosion(b.x,b.y,b.damage,e);
          if(b.pierce>0)b.pierce--;else b.life=0;
          break;
        }
      }
    }

    for(const b of enemyBullets){if(b.life<=0)continue;const dx=b.x-player.x,dy=b.y-player.y,rr=b.r+player.r;if(dx*dx+dy*dy<rr*rr){b.life=0;hurtPlayer(b.damage);}}

    enemies=enemies.filter(e=>e.hp>0&&e.x>-100&&e.x<W+100&&e.y>-100&&e.y<H+100);
    bullets=bullets.filter(b=>b.life>0&&b.x>-50&&b.x<W+50&&b.y>-50&&b.y<H+50);
    enemyBullets=enemyBullets.filter(b=>b.life>0&&b.x>-70&&b.x<W+70&&b.y>-70&&b.y<H+70);

    for(const g of gems){g.x+=g.vx*dt;g.y+=g.vy*dt;g.vx*=.92;g.vy*=.92;const dx=player.x-g.x,dy=player.y-g.y,d=Math.hypot(dx,dy)||1;if(d<player.magnet){const pull=170+(player.magnet-d)*5;g.x+=dx/d*pull*dt;g.y+=dy/d*pull*dt;}if(d<player.r+g.r+5){g.collected=true;gainXP(g.value,g.tier);}}
    gems=gems.filter(g=>!g.collected);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;}particles=particles.filter(p=>p.life>0);
    for(const f of floatingTexts){f.y-=35*dt;f.life-=dt;}floatingTexts=floatingTexts.filter(f=>f.life>0);
    updateUI();
  }

  function updateUI(){
    levelValue.textContent=level;timeValue.textContent=formatTime(elapsed);scoreValue.textContent=score;killValue.textContent=killCount;hpValue.textContent=`${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}`;xpValue.textContent=`${xp}/${xpNeed}`;hpBar.style.width=`${Math.max(0,player.hp/player.maxHp*100)}%`;xpBar.style.width=`${Math.min(100,xp/xpNeed*100)}%`;
    if(boss){bossBar.style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;bossValue.textContent=`${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;}
  }
  function formatTime(sec){const m=Math.floor(sec/60).toString().padStart(2,"0"),s=Math.floor(sec%60).toString().padStart(2,"0");return `${m}:${s}`;}

  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,bossStarted?"#27131c":"#131924");g.addColorStop(1,"#0c1118");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="rgba(255,255,255,.035)";ctx.lineWidth=1;for(let x=0;x<W;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  }
  function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);ctx.fillStyle="rgba(77,227,199,.13)";ctx.beginPath();ctx.arc(0,0,player.r+10,0,Math.PI*2);ctx.fill();if(player.shield>0){for(let i=0;i<player.shield;i++){ctx.strokeStyle=`rgba(102,246,255,${.78-i*.11})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,player.r+8+i*4,0,Math.PI*2);ctx.stroke();}}ctx.fillStyle="#54e1c1";ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();ctx.fillStyle="#effffb";ctx.beginPath();ctx.arc(-4,-4,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#d7fff5";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(16,0);ctx.stroke();ctx.restore();}

  function drawEnemy(e){
    ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.hitFlash>0?"#fff":e.color;
    if(e.type==="runner"){ctx.rotate(Math.PI/4);ctx.fillRect(-e.r,-e.r,e.r*2,e.r*2);ctx.rotate(-Math.PI/4);}else if(e.type==="tank"){ctx.beginPath();for(let i=0;i<8;i++){const a=Math.PI*2*i/8-Math.PI/8,r=e.r+(i%2?0:3),x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();}else{ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=e.eye;ctx.beginPath();ctx.arc(-e.r*.3,-3,2.3,0,Math.PI*2);ctx.arc(e.r*.3,-3,2.3,0,Math.PI*2);ctx.fill();
    if(e.type==="shooter"){ctx.strokeStyle="#9df0ff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.r+4,0,Math.PI*2);ctx.stroke();}
    if(e.type==="elite"){ctx.strokeStyle="#ffc16c";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r+4,0,Math.PI*2);ctx.stroke();}
    if(e.hp<e.maxHp){ctx.fillStyle="rgba(0,0,0,.4)";ctx.fillRect(-e.r,-e.r-10,e.r*2,3);ctx.fillStyle="#ff6d7b";ctx.fillRect(-e.r,-e.r-10,e.r*2*(e.hp/e.maxHp),3);}ctx.restore();
  }

  function drawBoss(){if(!boss)return;ctx.save();ctx.translate(boss.x,boss.y);ctx.rotate(elapsed*.25);ctx.strokeStyle=boss.phase===2?"#ffd05c":"#ff5e83";ctx.lineWidth=7;ctx.beginPath();for(let i=0;i<12;i++){const a=Math.PI*2*i/12,r=boss.r+(i%2?8:0),x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();ctx.rotate(-elapsed*.25);ctx.fillStyle=boss.hitFlash>0?"#fff":"#8f2446";ctx.beginPath();ctx.arc(0,0,boss.r-8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffd7df";ctx.beginPath();ctx.arc(-16,-7,6,0,Math.PI*2);ctx.arc(16,-7,6,0,Math.PI*2);ctx.fill();ctx.fillStyle="#260813";ctx.beginPath();ctx.arc(-16,-7,3,0,Math.PI*2);ctx.arc(16,-7,3,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawBullet(b){ctx.save();ctx.fillStyle=b.crit?"#ffd66d":"#7fdcff";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=b.crit?12:7;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawEnemyBullet(b){
    ctx.save();
    const speed=Math.hypot(b.vx,b.vy)||1, tx=-b.vx/speed, ty=-b.vy/speed;
    ctx.strokeStyle=b.color;ctx.globalAlpha=.42;ctx.lineWidth=Math.max(2,b.r*.9);ctx.beginPath();ctx.moveTo(b.x+tx*5,b.y+ty*5);ctx.lineTo(b.x+tx*17,b.y+ty*17);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=7;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle="#2b1020";ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,b.r+1,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#fff2f6";ctx.beginPath();ctx.arc(b.x-b.r*.28,b.y-b.r*.28,Math.max(1.2,b.r*.24),0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawGem(g){
    ctx.save();ctx.translate(g.x,g.y);
    const pulse=1+Math.sin(elapsed*(g.tier==="epic"?8:6)+g.x*.02)*(g.tier==="epic"?.17:.11);ctx.scale(pulse,pulse);
    const glow=g.glow||"#55ff9c", color=g.color||"#54ef98";
    // XPランクごとに発光の強さを明確に分ける。緑は控えめ、青は広く強い青発光。
    ctx.shadowColor=glow;ctx.shadowBlur=g.tier==="epic"?24:(g.tier==="rare"?30:7);
    if(g.tier==="rare"){
      // 青XPは二重の青リングで、緑XPや敵弾と形状でも判別できるようにする。
      ctx.strokeStyle="rgba(96,196,255,.95)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,g.r+8,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle="rgba(64,156,255,.72)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,g.r+15,0,Math.PI*2);ctx.stroke();
    }else{
      ctx.strokeStyle=g.tier==="epic"?"rgba(255,215,106,.75)":"rgba(111,255,176,.26)";
      ctx.lineWidth=g.tier==="epic"?3:1.5;ctx.beginPath();ctx.arc(0,0,g.r+7+(g.tier==="epic"?3:0),0,Math.PI*2);ctx.stroke();
      if(g.tier==="epic"){ctx.beginPath();ctx.arc(0,0,g.r+16,0,Math.PI*2);ctx.globalAlpha=.35;ctx.stroke();ctx.globalAlpha=1;}
    }
    ctx.rotate(Math.PI/4);ctx.fillStyle=color;ctx.strokeStyle="#f7fbff";ctx.lineWidth=2;ctx.beginPath();ctx.rect(-g.r,-g.r,g.r*2,g.r*2);ctx.fill();ctx.stroke();ctx.rotate(-Math.PI/4);
    ctx.shadowBlur=0;ctx.fillStyle=g.tier==="epic"?"#34134c":(g.tier==="rare"?"#092b4b":"#08351f");ctx.font=`900 ${g.tier==="epic"?8:Math.max(7,g.r-1)}px system-ui`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(g.label||"XP",0,.5);ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);drawBackground();for(const g of gems)drawGem(g);for(const b of bullets)drawBullet(b);for(const b of enemyBullets)drawEnemyBullet(b);for(const e of enemies)drawEnemy(e);drawBoss();drawPlayer();
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);if(p.ring){const t=1-p.life/p.maxLife;ctx.strokeStyle=p.color;ctx.lineWidth=4*(1-t)+1;ctx.beginPath();ctx.arc(p.x,p.y,p.maxR*t,0,Math.PI*2);ctx.stroke();}else{ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}}ctx.globalAlpha=1;
    for(const f of floatingTexts){ctx.globalAlpha=Math.max(0,Math.min(1,f.life*2));ctx.textAlign="center";ctx.font=f.crit?"900 19px system-ui":"800 14px system-ui";ctx.fillStyle=f.hurt?"#ff7180":(f.crit?"#ffd86f":"#dff6ff");ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
    if(!bossStarted&&state==="playing"){const remain=Math.max(0,nextBossTime-elapsed);if(remain<=30){ctx.fillStyle="rgba(255,77,103,.88)";ctx.font="900 15px system-ui";ctx.textAlign="center";ctx.fillText(`BOSS ${bossCount+1} IN ${Math.ceil(remain)}s`,W/2,31);}}
  }

  function loop(ts){const dt=Math.min(.033,(ts-lastTime)/1000||0);lastTime=ts;update(dt);draw();requestAnimationFrame(loop);}
  function canvasPoint(clientX,clientY){const r=canvas.getBoundingClientRect();return{x:(clientX-r.left)*(W/r.width),y:(clientY-r.top)*(H/r.height)};}
  canvas.addEventListener("pointerdown",e=>{if(state!=="playing")return;pointerActive=true;pointerTarget=canvasPoint(e.clientX,e.clientY);canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{if(!pointerActive||state!=="playing")return;pointerTarget=canvasPoint(e.clientX,e.clientY);});
  canvas.addEventListener("pointerup",e=>{pointerActive=false;canvas.releasePointerCapture?.(e.pointerId);});canvas.addEventListener("pointercancel",()=>pointerActive=false);
  window.addEventListener("keydown",e=>keys[e.key]=true);window.addEventListener("keyup",e=>keys[e.key]=false);
  startButton.addEventListener("click",()=>{initAudio();resetGame();});retryButton.addEventListener("click",()=>{initAudio();resetGame();});
  if(audioButton) audioButton.addEventListener("click",toggleAudio);
  updateUI();requestAnimationFrame(loop);
})();
