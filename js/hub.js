/*
 * hub.js
 * The main game: moves the Miis around, makes them talk, and handles clicks.
 */
(function () {
  "use strict";

  const { drawMii, roundRect } = window.MiiRenderer;
  const D = window.Dialogue;
  const STORAGE_KEY = "mii-hub-v1";

  // ------------------------------------------------------------------
  // Saving (localStorage can fail in private windows, so always try/catch)
  // ------------------------------------------------------------------
  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function writeSave(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function bytesToBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function base64ToBytes(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------
  // A Mii walking around the hub
  // ------------------------------------------------------------------
  let nextId = 1;

  class Walker {
    constructor(record, look, hub) {
      this.id = record.id;
      this.record = record;
      this.look = look;
      this.hub = hub;
      this.x = 0;
      this.y = 0;
      this.lift = 0;       // how high off the ground (jumping / floating)
      this.liftVel = 0;
      this.facing = 0;     // -1 left, 0 front, 1 right
      this.phase = 0;      // walk cycle
      this.state = "idle";
      this.timer = rnd(0.5, 2);
      this.target = null;
      this.spot = null;
      this.speed = rnd(55, 75);
      this.bubble = null;  // { text, time, dur }
      this.emote = null;   // { icon, time, dur }
      this.expression = "smile";
      this.arms = "down";
      this.dance = false;
      this.blinkIn = rnd(1, 4);
      this.blink = 0;
      this.talkIn = rnd(4, 12);
      this.cooldown = rnd(2, 6); // seconds before they can start an interaction
      this.partner = null;
      this.held = false;
      this.fadeIn = 0;
    }

    get busy() {
      return this.state === "interact" || this.state === "approach" || this.state === "waiting" || this.held;
    }

    say(text, dur) {
      const name = this.look.name;
      const partner = this.partner ? this.partner.look.name : "";
      text = text.replace(/\{A\}/g, name).replace(/\{B\}/g, partner);
      this.bubble = { text, time: 0, dur: dur || Math.max(2, text.length * 0.07) };
    }

    showEmote(icon, dur) {
      this.emote = { icon, time: 0, dur: dur || 2 };
    }

    hop(power) {
      if (this.lift <= 0.5) this.liftVel = power || 140;
    }

    goTo(x, y) {
      this.target = { x, y };
      this.state = "walk";
    }
  }

  // ------------------------------------------------------------------
  // The hub itself
  // ------------------------------------------------------------------
  class Hub {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.walkers = [];
      this.scene = window.Scenes.park;
      this.time = 0;
      this.directorIn = 2;
      this.chattiness = 1;
      this.friendships = {}; // "idA|idB" -> points
      this.records = [];
      this.feed = [];
      this.dragging = null;
      this.hover = null;
      this.bgCache = null;
      this.onChange = () => {};

      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.bindPointer();
    }

    // ---------- setup ----------
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const oldW = this.W, oldH = this.H;
      this.W = Math.max(320, rect.width);
      this.H = Math.max(320, rect.height);
      // keep everyone in the same relative spot when the window changes size
      if (oldW && oldH) {
        const sx = this.W / oldW, sy = this.H / oldH;
        for (const w of this.walkers) {
          w.x *= sx; w.y *= sy;
          if (w.target) { w.target.x *= sx; w.target.y *= sy; }
        }
      }
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      this.dpr = dpr;
      this.bgCache = null;
      // keep everyone inside the new bounds
      for (const w of this.walkers) {
        w.x = clamp(w.x, 20, this.W - 20);
        w.y = clamp(w.y, this.floorTop(), this.H - 10);
      }
    }

    floorTop() {
      return this.H * this.scene.floorTop + 20;
    }

    // Things further back look smaller.
    depthScale(y) {
      const top = this.H * this.scene.floorTop;
      const p = clamp((y - top) / (this.H - top), 0, 1);
      return this.unit() * (0.7 + p * 0.55);
    }

    unit() {
      return clamp(Math.min(this.W / 900, this.H / 560), 0.6, 1.6);
    }

    randomFloorPoint() {
      for (let i = 0; i < 30; i++) {
        const x = rnd(this.W * 0.05, this.W * 0.95);
        const y = rnd(this.floorTop(), this.H - 12);
        if (!this.blocked(x, y, 14)) return { x, y };
      }
      return { x: this.W / 2, y: (this.floorTop() + this.H) / 2 };
    }

    // Is (x, y) inside a prop like a tree or desk?
    blocked(x, y, pad) {
      for (const p of this.scene.props) {
        const px = p.x * this.W, py = p.y * this.H;
        const k = this.depthScale(py);
        const rx = (p.ry ? p.r : p.r * k) + (pad || 0);
        const ry = p.ry ? p.r * p.ry : rx * 0.45;
        const dx = (x - px) / rx, dy = (y - py) / ry;
        if (dx * dx + dy * dy < 1) return p;
      }
      return null;
    }

    setScene(id) {
      const scene = window.Scenes[id];
      if (!scene || scene === this.scene) return;
      this.scene = scene;
      this.bgCache = null;
      for (const w of this.walkers) {
        this.endInteraction(w);
        const p = this.randomFloorPoint();
        w.x = p.x; w.y = p.y;
        w.state = "idle"; w.timer = rnd(0.3, 1.5); w.spot = null;
        w.fadeIn = 0;
        w.lift = scene.floaty ? 20 : 0;
      }
      this.addFeed("Everyone went to the " + scene.name + "! " + scene.icon);
      const first = this.walkers[Math.floor(Math.random() * this.walkers.length)];
      if (first) {
        first.say(D.pick({
          park: ["Let's go to the park!", "Fresh air!"],
          office: ["Back to work...", "Good morning, office!"],
          space: ["We're in SPACE!", "Blast off!"],
        }[id]), 2.5);
      }
    }

    // ---------- Miis ----------
    addRecord(record, silent) {
      let look;
      try {
        look = record.demo
          ? Object.assign(window.MiiParser.baseLook(), record.look)
          : window.MiiParser.parse(base64ToBytes(record.bytes));
      } catch (e) {
        console.warn("Could not read Mii", e);
        return null;
      }
      look = Object.assign({}, look, record.overrides || {});
      const fav = window.MiiParser.FAVORITE_COLORS[look.favoriteColor] || window.MiiParser.FAVORITE_COLORS[0];
      look.shirt = (record.overrides && record.overrides.shirt) || fav.hex;
      look.favoriteColorName = fav.name;
      if (record.overrides && record.overrides.shirt) {
        const match = window.MiiParser.FAVORITE_COLORS.find((c) => c.hex === record.overrides.shirt);
        if (match) look.favoriteColorName = match.name;
      }

      const w = new Walker(record, look, this);
      // Miis walk in from the side of the screen
      const fromLeft = Math.random() < 0.5;
      const p = this.randomFloorPoint();
      w.x = fromLeft ? -20 : this.W + 20;
      w.y = p.y;
      w.goTo(fromLeft ? rnd(this.W * 0.1, this.W * 0.4) : rnd(this.W * 0.6, this.W * 0.9), p.y);
      w.lift = this.scene.floaty ? 20 : 0;
      this.walkers.push(w);
      if (!this.records.includes(record)) this.records.push(record);
      if (!silent) {
        setTimeout(() => w.say(D.pick(["Hi everyone!", "Hello! I'm {A}!", "I'm here!", "What's this place?"]), 2.5), 900);
        this.addFeed(look.name + " arrived! 👋");
      }
      this.save();
      this.onChange();
      return w;
    }

    addFromBytes(bytes, fileName) {
      const look = window.MiiParser.parse(bytes); // throws if it isn't a Mii
      const record = { id: "mii-" + Date.now() + "-" + nextId++, bytes: bytesToBase64(bytes), fileName, overrides: {} };
      this.addRecord(record);
      return look;
    }

    removeWalker(id) {
      const w = this.walkers.find((x) => x.id === id);
      if (!w) return;
      this.endInteraction(w);
      this.walkers = this.walkers.filter((x) => x !== w);
      this.records = this.records.filter((r) => r.id !== id);
      for (const key of Object.keys(this.friendships)) {
        if (key.split("|").includes(id)) delete this.friendships[key];
      }
      this.addFeed(w.look.name + " went home. 🏠");
      this.save();
      this.onChange();
    }

    updateOverrides(id, overrides) {
      const record = this.records.find((r) => r.id === id);
      const w = this.walkers.find((x) => x.id === id);
      if (!record || !w) return;
      record.overrides = Object.assign({}, record.overrides, overrides);
      Object.assign(w.look, overrides);
      if (overrides.shirt) {
        const match = window.MiiParser.FAVORITE_COLORS.find((c) => c.hex === overrides.shirt);
        if (match) w.look.favoriteColorName = match.name;
      }
      this.save();
      this.onChange();
    }

    clearAll() {
      this.walkers = [];
      this.records = [];
      this.friendships = {};
      this.feed = [];
      this.save();
      this.onChange();
    }

    save() {
      writeSave({ records: this.records, friendships: this.friendships, scene: this.scene.id });
    }

    restore() {
      const data = loadSave();
      if (!data || !Array.isArray(data.records) || data.records.length === 0) return false;
      if (data.scene && window.Scenes[data.scene]) this.scene = window.Scenes[data.scene];
      this.friendships = data.friendships || {};
      for (const r of data.records) this.addRecord(r, true);
      return this.walkers.length > 0;
    }

    // ---------- friendships ----------
    pairKey(a, b) {
      return a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
    }

    points(a, b) {
      return this.friendships[this.pairKey(a, b)] || 0;
    }

    bestFriendOf(w) {
      let best = null, bestPts = 3;
      for (const o of this.walkers) {
        if (o === w) continue;
        const p = this.points(w, o);
        if (p > bestPts) { best = o; bestPts = p; }
      }
      return best;
    }

    addFeed(text) {
      this.feed.unshift({ text, at: Date.now() });
      this.feed = this.feed.slice(0, 30);
      this.onChange();
    }

    // ---------- the "director" decides who should hang out ----------
    runDirector(dt) {
      this.directorIn -= dt * this.chattiness;
      if (this.directorIn > 0) return;
      this.directorIn = rnd(2.5, 6);
      const free = this.walkers.filter((w) => !w.busy && w.cooldown <= 0 && w.fadeIn >= 1);
      if (free.length < 2) return;
      const A = free[Math.floor(Math.random() * free.length)];
      // Prefer someone nearby, but sometimes go across the map to meet a friend.
      const others = free.filter((w) => w !== A);
      others.sort((p, q) => Math.hypot(p.x - A.x, p.y - A.y) - Math.hypot(q.x - A.x, q.y - A.y));
      const B = Math.random() < 0.6 ? others[0] : others[Math.floor(Math.random() * others.length)];
      this.startInteraction(A, B);
    }

    startInteraction(A, B) {
      const plan = D.buildInteraction(A, B, this.scene, this.points(A, B));
      A.partner = B; B.partner = A;
      A.plan = plan; A.role = "A"; B.role = "B";
      A.state = "approach";
      A.spot = null;
      B.state = "waiting";
      B.spot = null;
      B.target = null;
      B.facing = A.x < B.x ? -1 : 1;
      B.showEmote("❗", 1.2);
    }

    endInteraction(w) {
      const p = w.partner;
      for (const m of [w, p]) {
        if (!m) continue;
        m.partner = null;
        m.plan = null;
        m.role = null;
        m.dance = false;
        m.arms = "down";
        m.expression = "smile";
        m.sleep = false;
        if (m.state === "interact" || m.state === "approach" || m.state === "waiting") {
          m.state = "idle";
          m.timer = rnd(1, 3);
        }
        m.cooldown = rnd(5, 12);
      }
    }

    finishInteraction(A) {
      const B = A.partner;
      if (!B) return;
      const key = this.pairKey(A, B);
      const before = this.friendships[key] || 0;
      const after = before + (D.FRIENDSHIP_GAIN[A.plan.type] || 1);
      this.friendships[key] = after;
      this.addFeed(D.FEED_TEXT[A.plan.type].replace("{A}", A.look.name).replace("{B}", B.look.name));
      const oldLevel = D.levelFor(before), newLevel = D.levelFor(after);
      if (newLevel !== oldLevel) {
        this.addFeed(A.look.name + " and " + B.look.name + " are now " + newLevel.name + "! " + newLevel.emoji);
        A.showEmote(newLevel.emoji === "👋" ? "❤️" : newLevel.emoji, 2.5);
        B.showEmote(newLevel.emoji === "👋" ? "❤️" : newLevel.emoji, 2.5);
        this.spawnHearts(A, B);
      }
      this.endInteraction(A);
      // walk away from each other a little so they don't get stuck together
      for (const m of [A, B]) {
        const dir = m.x < (A.x + B.x) / 2 ? -1 : 1;
        m.goTo(clamp(m.x + dir * rnd(60, 160), 30, this.W - 30), clamp(m.y + rnd(-50, 50), this.floorTop(), this.H - 12));
      }
      this.save();
    }

    spawnHearts(A, B) {
      this.particles = this.particles || [];
      const x = (A.x + B.x) / 2, y = Math.min(A.y, B.y) - 90 * this.depthScale(A.y);
      for (let i = 0; i < 8; i++) {
        this.particles.push({ x, y, vx: rnd(-40, 40), vy: rnd(-70, -30), life: 0, max: rnd(1.2, 2), icon: "❤️" });
      }
    }

    // ---------- per-frame update ----------
    update(dt) {
      this.time += dt;
      this.runDirector(dt);
      const floaty = this.scene.floaty;

      for (const w of this.walkers) {
        w.fadeIn = Math.min(1, w.fadeIn + dt * 2);
        w.cooldown -= dt;

        // blinking
        w.blinkIn -= dt;
        if (w.blinkIn <= 0) { w.blink = 0.13; w.blinkIn = rnd(2, 5); }
        w.blink = Math.max(0, w.blink - dt);

        // speech bubbles and emotes fade out
        if (w.bubble) { w.bubble.time += dt; if (w.bubble.time > w.bubble.dur) w.bubble = null; }
        if (w.emote) { w.emote.time += dt; if (w.emote.time > w.emote.dur) w.emote = null; }

        // jumping / floating physics
        const gravity = floaty ? 120 : 700;
        if (!w.held) {
          if (floaty) {
            // gently bob up and down
            const base = 18 + Math.sin(this.time * 1.3 + w.x * 0.05) * 8;
            if (w.liftVel === 0 && w.lift <= base + 1) w.lift += (base - w.lift) * Math.min(1, dt * 2);
            else {
              w.liftVel -= gravity * dt;
              w.lift += w.liftVel * dt;
              if (w.lift <= base && w.liftVel < 0) { w.liftVel = 0; }
            }
          } else {
            if (w.lift > 0 || w.liftVel > 0) {
              w.liftVel -= gravity * dt;
              w.lift += w.liftVel * dt;
              if (w.lift <= 0) {
                w.lift = 0;
                // a little bounce after being dropped from high up
                w.liftVel = w.liftVel < -250 ? -w.liftVel * 0.3 : 0;
              }
            }
          }
        }

        // talking to themselves now and then
        if (!w.busy) {
          w.talkIn -= dt * this.chattiness;
          if (w.talkIn <= 0 && !w.bubble) {
            const bf = this.bestFriendOf(w);
            if (w.spot && Math.random() < 0.6) w.say(D.pick(w.spot.lines));
            else w.say(D.soloLine(w, this.scene, bf && bf.look.name));
            w.talkIn = rnd(9, 20);
          }
        }

        if (w.held) continue;
        this.updateState(w, dt);
      }

      // keep Miis from overlapping too much
      for (let i = 0; i < this.walkers.length; i++) {
        for (let j = i + 1; j < this.walkers.length; j++) {
          const a = this.walkers[i], b = this.walkers[j];
          if (a.held || b.held || a.partner === b) continue;
          const dx = b.x - a.x, dy = (b.y - a.y) * 2;
          const d = Math.hypot(dx, dy);
          const min = 28 * this.depthScale((a.y + b.y) / 2);
          if (d > 0.01 && d < min) {
            const push = ((min - d) / d) * 0.5;
            if (a.state !== "interact" && a.state !== "activity") { a.x -= dx * push * 0.5; }
            if (b.state !== "interact" && b.state !== "activity") { b.x += dx * push * 0.5; }
          }
        }
      }

      // particles (hearts)
      if (this.particles) {
        for (const p of this.particles) {
          p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 20 * dt;
        }
        this.particles = this.particles.filter((p) => p.life < p.max);
      }
    }

    updateState(w, dt) {
      switch (w.state) {
        case "idle": {
          w.timer -= dt;
          if (w.timer > 0) {
            if (Math.random() < dt * 0.3) w.facing = D.pick([-1, 0, 0, 1]);
            break;
          }
          const roll = Math.random();
          if (roll < 0.3 && this.scene.spots.length) {
            // go do an activity
            const spot = D.pick(this.scene.spots);
            const taken = this.walkers.some((o) => o !== w && o.spot === spot);
            if (!taken) {
              w.spot = spot;
              w.goTo(spot.x * this.W + rnd(-6, 6), spot.y * this.H);
              break;
            }
          }
          if (roll < 0.85) {
            const p = this.randomFloorPoint();
            w.goTo(p.x, p.y);
          } else {
            w.timer = rnd(1, 3);
            if (this.scene.floaty && Math.random() < 0.5) { w.hop(110); w.say(D.pick(["Boing!", "Moon jump!", "Wheee!"]), 1.6); }
          }
          break;
        }

        case "walk": {
          if (this.moveToward(w, w.target.x, w.target.y, dt)) {
            if (w.spot) {
              w.state = "activity";
              w.timer = rnd(5, 10);
              w.facing = w.spot.faceUp ? 0 : D.pick([-1, 0, 1]);
              w.showEmote(w.spot.emoji, w.timer);
              if (Math.random() < 0.6) w.say(D.pick(w.spot.lines));
            } else {
              w.state = "idle";
              w.timer = rnd(1, 4);
              w.facing = 0;
            }
          }
          break;
        }

        case "activity": {
          w.timer -= dt;
          w.arms = w.spot && w.spot.faceUp ? (Math.sin(this.time * 14) > 0 ? "out" : "down") : "down";
          if (w.timer <= 0) {
            w.spot = null;
            w.emote = null;
            w.arms = "down";
            w.state = "idle";
            w.timer = rnd(0.5, 2);
          }
          break;
        }

        case "approach": {
          const B = w.partner;
          if (!B) { w.state = "idle"; break; }
          const side = w.x < B.x ? -1 : 1;
          const gap = 44 * this.depthScale(B.y);
          const tx = clamp(B.x + side * gap, 20, this.W - 20);
          if (this.moveToward(w, tx, B.y, dt) || this.stuckTimer(w, dt) > 8) {
            w.stuck = 0;
            w.state = "interact";
            B.state = "interact";
            w.facing = B.x > w.x ? 1 : -1;
            B.facing = -w.facing;
            w.step = -1;
            w.stepTimer = 0;
          }
          break;
        }

        case "waiting":
          if (w.partner) w.facing = w.partner.x < w.x ? -1 : 1;
          break;

        case "interact":
          if (w.role === "A") this.runScript(w, dt);
          if (w.dance) {
            w.facing = Math.sin(this.time * 6 + (w.role === "A" ? 0 : 1)) > 0 ? 1 : -1;
            if (w.lift <= 0.5 && !this.scene.floaty) w.hop(160);
          }
          break;
      }
    }

    stuckTimer(w, dt) {
      w.stuck = (w.stuck || 0) + dt;
      return w.stuck;
    }

    // Runs the conversation script one step at a time (only the "A" Mii runs it).
    runScript(A, dt) {
      const B = A.partner;
      if (!B || !A.plan) { this.endInteraction(A); return; }
      A.stepTimer -= dt;
      if (A.stepTimer > 0) return;
      // tidy up the last step
      for (const m of [A, B]) { m.arms = "down"; m.dance = false; m.sleep = false; m.expression = "smile"; }
      A.step++;
      const step = A.plan.steps[A.step];
      if (!step) { this.finishInteraction(A); return; }
      const actors = step.who === "both" ? [A, B] : step.who === "A" ? [A] : [B];
      for (const m of actors) {
        if (step.say) m.say(step.say, Math.max(step.dur + 0.4, 1.4));
        if (step.emote) m.showEmote(step.emote, Math.max(step.dur, 1.5));
        if (step.expr) m.expression = step.expr;
        if (step.arms) m.arms = step.arms;
        if (step.hop) m.hop(this.scene.floaty ? 90 : 180);
        if (step.dance) m.dance = true;
        if (step.sleep) m.sleep = true;
        if (step.moonJump) m.hop(this.scene.floaty ? 150 : 260);
      }
      A.stepTimer = step.dur;
    }

    // Moves a Mii toward a point. Returns true once it has arrived.
    moveToward(w, tx, ty, dt) {
      const dx = tx - w.x, dy = ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) { w.phase = 0; return true; }
      const speed = w.speed * this.depthScale(w.y) * (this.scene.floaty ? 0.6 : 1);
      const step = Math.min(d, speed * dt);
      let nx = w.x + (dx / d) * step;
      let ny = w.y + (dy / d) * step;
      // walk around props instead of through them
      const prop = this.blocked(nx, ny, 8);
      if (prop) {
        const px = prop.x * this.W;
        const around = w.x < px ? -1 : 1;
        nx = w.x + around * step * 0.7;
        ny = w.y + (dy > 0 ? 1 : -1) * step * 0.7;
        if (this.blocked(nx, ny, 4)) { ny = w.y + step; }
      }
      w.x = nx;
      w.y = clamp(ny, this.floorTop() - 10, this.H - 8);
      if (Math.abs(dx) > 2) w.facing = dx > 0 ? 1 : -1;
      w.phase += dt * (this.scene.floaty ? 6 : 11);
      return false;
    }

    // ---------- drawing ----------
    draw() {
      const ctx = this.ctx;
      const W = this.W, H = this.H;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Cached background (drawn once per size/scene)
      if (!this.bgCache) {
        const c = document.createElement("canvas");
        c.width = Math.round(W * this.dpr);
        c.height = Math.round(H * this.dpr);
        const bctx = c.getContext("2d");
        bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.scene.drawStatic(bctx, W, H);
        this.bgCache = c;
      }
      ctx.drawImage(this.bgCache, 0, 0, W, H);
      this.scene.drawAnimated(ctx, W, H, this.time);

      // Draw props and Miis together, back-to-front, so things overlap correctly.
      const items = [];
      for (const p of this.scene.props) {
        if (p.draw) items.push({ y: p.y * H, prop: p });
      }
      for (const w of this.walkers) items.push({ y: w.y + (w.held ? 1000 : 0), walker: w });
      items.sort((a, b) => a.y - b.y);

      const heads = [];
      for (const it of items) {
        if (it.prop) {
          const px = it.prop.x * W, py = it.prop.y * H;
          it.prop.draw(ctx, px, py, this.depthScale(py), this.time);
        } else {
          const w = it.walker;
          ctx.globalAlpha = w.fadeIn;
          const scale = this.depthScale(w.y) * (w.held ? 1.08 : 1);
          const walking = w.state === "walk" || w.state === "approach";
          const sitting = w.spot && w.spot.sit && w.state === "activity";
          const info = drawMii(ctx, w.look, w.x, w.y - (sitting ? 10 * scale : 0), {
            t: this.time,
            scale,
            walking,
            phase: w.phase,
            facing: w.facing,
            lift: w.lift,
            talking: !!(w.bubble && w.bubble.time < w.bubble.dur - 0.4),
            expression: w.held ? "surprised" : w.expression,
            arms: w.arms,
            blink: w.blink > 0,
            sleep: w.sleep,
            helmet: this.scene.helmet,
            held: w.held,
          });
          ctx.globalAlpha = 1;
          heads.push({ w, info, scale });
        }
      }

      // Speech bubbles, emotes and name tags go on top of everything.
      // Front Miis go first so their bubbles stay put and the ones behind move up.
      heads.sort((a, b) => b.w.y - a.w.y);
      const placed = [];
      for (const { w, info, scale } of heads) {
        const topY = info.headTopY - (this.scene.helmet ? 10 * scale : 0);
        if (this.hover === w || this.dragging === w) this.drawNameTag(w, info.headX, w.y + 14);
        if (w.emote) this.drawEmote(w, info.headX + 26 * scale, topY + 6 * scale, scale);
        if (w.bubble) this.drawBubble(w.bubble, info.headX, topY - 6, placed);
      }

      if (this.particles) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const p of this.particles) {
          ctx.globalAlpha = 1 - p.life / p.max;
          ctx.font = "20px sans-serif";
          ctx.fillText(p.icon, p.x, p.y);
        }
        ctx.globalAlpha = 1;
      }
    }

    drawBubble(b, x, y, placed) {
      const ctx = this.ctx;
      const fontSize = clamp(14 * this.unit(), 12, 17);
      ctx.font = "600 " + fontSize + "px 'Nunito', 'Segoe UI', sans-serif";
      // wrap the text so long lines don't run off-screen
      const maxW = 180;
      const words = b.text.split(" ");
      const lines = [];
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      lines.push(line);
      const lineH = fontSize * 1.25;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
      const h = lines.length * lineH + 12;
      const bx = clamp(x - w / 2, 6, this.W - w - 6);
      let by = Math.max(6, y - h - 10);
      // Don't cover another bubble: slide up above it instead.
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find((r) => bx < r.x + r.w && bx + w > r.x && by < r.y + r.h + 10 && by + h + 10 > r.y);
        if (!hit) break;
        by = hit.y - h - 12;
      }
      placed.push({ x: bx, y: by, w, h });

      // pop-in animation
      const pop = Math.min(1, b.time * 6);
      const fade = Math.min(1, (b.dur - b.time) * 3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(x, by + h);
      ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
      ctx.translate(-x, -(by + h));

      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      roundRect(ctx, bx, by, w, h, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.shadowColor = "transparent";
      // little tail pointing at the Mii
      const tailX = clamp(x, bx + 14, bx + w - 14);
      ctx.beginPath();
      ctx.moveTo(tailX - 7, by + h - 1);
      ctx.lineTo(tailX, by + h + 9);
      ctx.lineTo(tailX + 7, by + h - 1);
      ctx.fill();

      ctx.fillStyle = "#2b2b3a";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 6 + i * lineH));
      ctx.restore();
    }

    drawEmote(w, x, y, scale) {
      const ctx = this.ctx;
      const e = w.emote;
      const pop = Math.min(1, e.time * 5);
      const bounce = Math.sin(e.time * 6) * 2;
      ctx.save();
      ctx.font = Math.round(20 * scale * (0.5 + pop * 0.5)) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = Math.min(1, (e.dur - e.time) * 3);
      ctx.fillText(e.icon, x, y + bounce);
      ctx.restore();
    }

    drawNameTag(w, x, y) {
      const ctx = this.ctx;
      ctx.font = "700 13px 'Nunito', 'Segoe UI', sans-serif";
      const text = w.look.name;
      const tw = ctx.measureText(text).width + 16;
      roundRect(ctx, x - tw / 2, y, tw, 20, 10);
      ctx.fillStyle = "rgba(30,30,50,0.8)";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y + 10);
    }

    // ---------- mouse / touch ----------
    walkerAt(x, y) {
      // check front-most Miis first
      const sorted = this.walkers.slice().sort((a, b) => b.y - a.y);
      for (const w of sorted) {
        const s = this.depthScale(w.y);
        const top = w.y - w.lift - 95 * s;
        if (x > w.x - 24 * s && x < w.x + 24 * s && y > top && y < w.y + 4) return w;
      }
      return null;
    }

    bindPointer() {
      const c = this.canvas;
      const pos = (e) => {
        const r = c.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      let downAt = null;

      c.addEventListener("pointerdown", (e) => {
        const p = pos(e);
        const w = this.walkerAt(p.x, p.y);
        downAt = { ...p, w, time: performance.now() };
        if (w) c.setPointerCapture(e.pointerId);
      });

      c.addEventListener("pointermove", (e) => {
        const p = pos(e);
        if (downAt && downAt.w && !this.dragging && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6) {
          // start dragging a Mii
          const w = downAt.w;
          this.endInteraction(w);
          w.spot = null; w.emote = null;
          this.dragging = w;
          w.held = true;
          w.state = "idle";
          w.say(D.pick(D.PICKUP_LINES), 1.5);
        }
        if (this.dragging) {
          const w = this.dragging;
          w.x = clamp(p.x, 10, this.W - 10);
          // We hold the Mii by the head, so its feet hang below the pointer.
          // Moving up lifts the Mii into the air (up to a limit); moving further up
          // carries it towards the back. Moving down brings it towards the front.
          const s = this.depthScale(w.y);
          const feetY = p.y + 75 * s;
          const maxLift = 110 * s;
          if (feetY > w.y) {
            w.y = clamp(feetY, this.floorTop(), this.H - 8);
            w.lift = 0;
          } else if (w.y - feetY > maxLift) {
            w.y = clamp(feetY + maxLift, this.floorTop(), this.H - 8);
            w.lift = w.y - feetY;
          } else {
            w.lift = w.y - feetY;
          }
        } else {
          this.hover = this.walkerAt(p.x, p.y);
          c.style.cursor = this.hover ? "grab" : "default";
        }
      });

      const release = () => {
        if (this.dragging) {
          const w = this.dragging;
          w.held = false;
          w.liftVel = 0;
          w.timer = rnd(1, 2);
          setTimeout(() => w.say(D.pick(D.DROP_LINES), 1.6), 350);
          this.dragging = null;
        } else if (downAt && downAt.w) {
          // a simple click: the Mii says hi
          const w = downAt.w;
          w.hop(this.scene.floaty ? 80 : 160);
          w.facing = 0;
          if (!w.busy) {
            w.say(D.pick(D.CLICK_LINES), 1.8);
            w.arms = "wave";
            setTimeout(() => { if (w.arms === "wave" && !w.partner) w.arms = "down"; }, 1500);
          }
          this.onSelect && this.onSelect(w);
        }
        downAt = null;
      };
      c.addEventListener("pointerup", release);
      c.addEventListener("pointercancel", release);
      c.addEventListener("pointerleave", () => { this.hover = null; });
    }

    // ---------- main loop ----------
    start() {
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.update(dt);
        this.draw();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }

  window.MiiHub = { Hub, base64ToBytes, bytesToBase64 };
})();
