/*
 * hub3d.js
 * The 3D hub: moves the Miis around, makes them talk and hang out,
 * and handles the camera, clicking and dragging.
 */
(function () {
  "use strict";

  const THREE = window.THREE;
  const D = window.Dialogue;
  const M = window.MiiModel;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MII_HEIGHT = 1.8;

  // Turns smoothly from angle a towards angle b.
  function turnToward(a, b, amount) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * Math.min(1, amount);
  }

  // ------------------------------------------------------------------
  // One Mii in the hub
  // ------------------------------------------------------------------
  class Walker {
    constructor(hub, record, template, look) {
      this.hub = hub;
      this.id = record.id;
      this.record = record;
      this.template = template;
      this.look = look; // { name, favoriteColorName, ...colours }
      this.x = 0; this.z = 0;
      this.yaw = 0; this.targetYaw = 0;
      this.lift = 0; this.liftVel = 0;
      this.phase = 0; this.walkAmt = 0;
      this.state = "idle";
      this.timer = rnd(0.5, 2);
      this.target = null;
      this.spot = null;
      this.speed = rnd(1.5, 2.1);
      this.arms = "down";
      this.dance = false; this.laugh = false; this.sleep = false; this.nod = 0; this.shake = 0;
      this.cooldown = rnd(2, 6);
      this.talkIn = rnd(4, 12);
      this.partner = null;
      this.held = false;
      this.appear = 0;
      this.bubble = null; // { text, time, dur }
      this.emote = null;  // { icon, time, dur }

      // the bubble/emote/name tag that float above the Mii's head
      this.ui = document.createElement("div");
      this.ui.className = "mii-ui";
      this.ui.innerHTML = '<div class="bubble"></div><div class="emote"></div><div class="nametag"></div>';
      this.uiBubble = this.ui.children[0];
      this.uiEmote = this.ui.children[1];
      this.uiName = this.ui.children[2];
      this.uiName.textContent = look.name;
      hub.overlay.appendChild(this.ui);

      this.buildModel();
    }

    buildModel() {
      const old = this.inst;
      this.inst = M.createInstance(this.template, this.look);
      // taller Miis (by their Mii height setting) are a little bigger
      const s = (0.9 + clamp(this.template.info.height, 0, 127) / 127 * 0.2) * 1.3;
      this.sizeScale = s;
      this.inst.holder.scale.setScalar(s);
      // astronaut helmet for outer space (hidden elsewhere)
      const helmet = new THREE.Group();
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.66, 28, 20),
        new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false })
      );
      glass.position.y = 1.36;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 24), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.86;
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.22), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
      tank.position.set(0, 0.7, -0.3);
      tank.castShadow = true;
      helmet.add(glass, collar, tank);
      helmet.visible = !!(this.hub.world && this.hub.world.helmet);
      this.helmet = helmet;
      this.inst.holder.add(helmet);
      this.hub.miiGroup.add(this.inst.holder);
      if (old) {
        this.hub.miiGroup.remove(old.holder);
        M.disposeObject(old.holder);
      }
    }

    say(text, dur) {
      const partner = this.partner ? this.partner.look.name : "";
      text = text.replace(/\{A\}/g, this.look.name).replace(/\{B\}/g, partner);
      this.bubble = { text, time: 0, dur: dur || Math.max(2, text.length * 0.07) };
      this.uiBubble.textContent = text;
      this.uiBubble.classList.remove("show");
      void this.uiBubble.offsetWidth; // restart the pop-in animation
      this.uiBubble.classList.add("show");
    }

    showEmote(icon, dur) {
      this.emote = { icon, time: 0, dur: dur || 2 };
      this.uiEmote.textContent = icon;
      this.uiEmote.classList.add("show");
    }

    hop(power) {
      if (this.lift <= this.hub.baseLift(this) + 0.05) this.liftVel = power || 4;
    }

    // Plans a route to (x, z) around obstacles and starts walking.
    goTo(x, z) {
      const path = this.hub.nav.findPath(this.x, this.z, x, z);
      if (!path) { this.state = "idle"; this.timer = rnd(0.5, 1.5); this.spot = null; return false; }
      this.path = path;
      this.target = path[path.length - 1];
      this.state = "walk";
      this.resetStuck();
      return true;
    }

    resetStuck() {
      this.stuckTime = 0;
      this.repaths = 0;
      this.bestDist = Infinity;
    }

    remove() {
      this.hub.miiGroup.remove(this.inst.holder);
      M.disposeObject(this.inst.holder);
      this.ui.remove();
    }
  }

  // ------------------------------------------------------------------
  // The hub
  // ------------------------------------------------------------------
  class Hub3D {
    constructor(canvas, overlay) {
      this.canvas = canvas;
      this.overlay = overlay;
      this.walkers = [];
      this.time = 0;
      this.directorIn = 2;
      this.chattiness = 1;
      this.friendships = {};
      this.feed = [];
      this.onChange = () => {};
      this.onSelect = null;

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
      this.camera.position.set(0, 14, 22);
      this.controls = new THREE.OrbitControls(this.camera, canvas);
      this.controls.target.set(0, 1, 0);
      this.controls.enablePan = false;
      this.controls.enableDamping = true;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 45;
      this.controls.minPolarAngle = 0.3;
      this.controls.maxPolarAngle = 1.38;
      this.controls.minAzimuthAngle = -1.0;
      this.controls.maxAzimuthAngle = 1.0;

      this.miiGroup = new THREE.Group();
      this.scene.add(this.miiGroup);

      this.raycaster = new THREE.Raycaster();
      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.bindPointer();
    }

    // ---------- setup ----------
    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(200, rect.width), h = Math.max(200, rect.height);
      this.W = w; this.H = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.fitCamera();
    }

    // Move the camera back far enough that the whole area fits on screen.
    fitCamera() {
      if (!this.world) return;
      const b = this.world.bounds;
      const halfW = (b.maxX - b.minX) / 2 + 2;
      const vfov = (this.camera.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
      // the front of the area is closer than the middle, so we don't need the full width
      const dist = clamp((halfW / Math.tan(hfov / 2)) * 0.8, 17, 30);
      const dir = new THREE.Vector3(0, this.world.cameraTilt || 0.55, 1).normalize();
      this.camera.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 1, 0));
      this.controls.target.set(0, 1, 0);
      this.controls.maxDistance = Math.max(45, dist * 1.4);
      this.controls.update();
    }

    setScene(id) {
      if (this.world && this.world.id === id) return;
      if (this.world) {
        this.scene.remove(this.world.group);
        window.World3D.dispose(this.world);
      }
      this.world = window.World3D.build(id);
      this.nav = new window.MiiNav.Nav(this.world.bounds, this.world.obstacles);
      this.scene.add(this.world.group);
      this.scene.background = new THREE.Color(this.world.background);
      this.scene.fog = this.world.fog ? new THREE.Fog(...this.world.fog) : null;
      this.fitCamera();

      for (const w of this.walkers) {
        this.endInteraction(w);
        const p = this.randomFloorPoint();
        w.x = p.x; w.z = p.z;
        w.state = "idle"; w.timer = rnd(0.3, 1.5); w.spot = null; w.target = null; w.path = null; w.seat = null;
        w.lift = this.baseLift(w); w.liftVel = 0;
        w.appear = 0;
        w.helmet.visible = this.world.helmet;
      }
      if (this.walkers.length) {
        this.addFeed("Everyone went to the " + this.world.name + "! " + this.world.icon);
        const first = this.walkers[Math.floor(Math.random() * this.walkers.length)];
        first.say(D.pick({
          park: ["Let's go to the park!", "Fresh air!"],
          office: ["Back to work...", "Good morning, office!"],
          space: ["We're in SPACE!", "Blast off!"],
        }[id]), 2.5);
      }
    }

    baseLift(w) {
      if (!this.world || !this.world.floaty) return 0;
      return 0.35 + Math.sin(this.time * 1.3 + w.x * 0.7) * 0.15;
    }

    // A random open spot that no other Mii is standing on.
    randomFloorPoint() {
      for (let i = 0; i < 20; i++) {
        const p = this.nav.randomFree();
        if (!this.walkers.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 1.5)) return p;
      }
      return this.nav.randomFree();
    }

    // ---------- adding / removing Miis ----------
    addWalker(record, template, look, silent) {
      const w = new Walker(this, record, template, look);
      // pop in at an open spot, then wander off
      const p = this.randomFloorPoint();
      w.x = p.x; w.z = p.z;
      w.yaw = w.targetYaw = 0;
      w.lift = this.baseLift(w) + 1.2;
      w.timer = rnd(1, 2.5);
      this.walkers.push(w);
      if (!silent) {
        setTimeout(() => w.say(D.pick(["Hi everyone!", "Hello! I'm {A}!", "I'm here!", "What's this place?"]), 2.5), 900);
        this.addFeed(look.name + " arrived! 👋");
      }
      this.onChange();
      return w;
    }

    removeWalker(id) {
      const w = this.walkers.find((x) => x.id === id);
      if (!w) return;
      this.endInteraction(w);
      w.remove();
      this.walkers = this.walkers.filter((x) => x !== w);
      for (const key of Object.keys(this.friendships)) {
        if (key.split("|").includes(id)) delete this.friendships[key];
      }
      this.addFeed(w.look.name + " went home. 🏠");
      this.onChange();
    }

    clearAll() {
      for (const w of this.walkers) w.remove();
      this.walkers = [];
      this.friendships = {};
      this.feed = [];
      this.onChange();
    }

    // ---------- friendships ----------
    pairKey(a, b) { return a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id; }
    points(a, b) { return this.friendships[this.pairKey(a, b)] || 0; }

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
      const free = this.walkers.filter((w) => !this.isBusy(w) && w.cooldown <= 0 && w.appear >= 1);
      if (free.length < 2) return;
      const A = free[Math.floor(Math.random() * free.length)];
      const others = free.filter((w) => w !== A);
      others.sort((p, q) => Math.hypot(p.x - A.x, p.z - A.z) - Math.hypot(q.x - A.x, q.z - A.z));
      const B = Math.random() < 0.6 ? others[0] : others[Math.floor(Math.random() * others.length)];
      this.startInteraction(A, B);
    }

    isBusy(w) {
      return w.held || w.state === "interact" || w.state === "approach" || w.state === "waiting";
    }

    startInteraction(A, B) {
      const plan = D.buildInteraction(A, B, this.world, this.points(A, B));
      A.partner = B; B.partner = A;
      A.plan = plan; A.role = "A"; B.role = "B";
      A.state = "approach"; A.spot = null; A.stuck = 0;
      B.state = "waiting"; B.spot = null; B.target = null;
      B.showEmote("❗", 1.2);
    }

    endInteraction(w) {
      const p = w.partner;
      for (const m of [w, p]) {
        if (!m) continue;
        m.partner = null; m.plan = null; m.role = null;
        m.dance = false; m.laugh = false; m.sleep = false; m.nod = 0; m.shake = 0;
        m.arms = "down";
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
        A.showEmote(newLevel.emoji, 2.5);
        B.showEmote(newLevel.emoji, 2.5);
        this.spawnHearts(A, B);
      }
      this.endInteraction(A);
      // walk apart a little so they don't get stuck together
      for (const m of [A, B]) {
        const dir = m.x < (A.x + B.x) / 2 ? -1 : 1;
        const b = this.world.bounds;
        m.goTo(clamp(m.x + dir * rnd(2, 5), b.minX + 1, b.maxX - 1), clamp(m.z + rnd(-2, 2), b.minZ + 1, b.maxZ - 1));
      }
      this.onChange();
    }

    spawnHearts(A, B) {
      const pos = new THREE.Vector3((A.x + B.x) / 2, MII_HEIGHT + 0.6, (A.z + B.z) / 2).project(this.camera);
      const x = (pos.x * 0.5 + 0.5) * this.W, y = (-pos.y * 0.5 + 0.5) * this.H;
      for (let i = 0; i < 8; i++) {
        const h = document.createElement("div");
        h.className = "heart";
        h.textContent = "❤️";
        h.style.left = x + rnd(-30, 30) + "px";
        h.style.top = y + rnd(-10, 10) + "px";
        h.style.animationDelay = rnd(0, 0.4) + "s";
        this.overlay.appendChild(h);
        setTimeout(() => h.remove(), 2200);
      }
    }

    // ---------- per-frame update ----------
    update(dt) {
      this.time += dt;
      if (!this.world) return;
      this.world.update(this.time);
      this.runDirector(dt);
      const floaty = this.world.floaty;
      const gravity = floaty ? 3 : 22;

      for (const w of this.walkers) {
        w.appear = Math.min(1, w.appear + dt * 2.5);
        w.cooldown -= dt;

        if (w.bubble) { w.bubble.time += dt; if (w.bubble.time > w.bubble.dur) { w.bubble = null; w.uiBubble.classList.remove("show"); } }
        if (w.emote) { w.emote.time += dt; if (w.emote.time > w.emote.dur) { w.emote = null; w.uiEmote.classList.remove("show"); } }

        // jumping / floating
        if (!w.held) {
          const base = this.baseLift(w);
          if (w.liftVel !== 0 || w.lift > base + 0.01) {
            w.liftVel -= gravity * dt;
            w.lift += w.liftVel * dt;
            if (w.lift <= base && w.liftVel <= 0) {
              w.lift = base;
              // a small bounce when dropped from high up
              w.liftVel = w.liftVel < -6 && !floaty ? -w.liftVel * 0.25 : 0;
            }
          } else {
            w.lift = base;
          }
        }

        // talking to themselves now and then
        if (!this.isBusy(w)) {
          w.talkIn -= dt * this.chattiness;
          if (w.talkIn <= 0 && !w.bubble) {
            const bf = this.bestFriendOf(w);
            if (w.spot && w.state === "activity" && Math.random() < 0.6) w.say(D.pick(w.spot.lines));
            else w.say(D.soloLine(w, this.world, bf && bf.look.name));
            w.talkIn = rnd(9, 20);
          }
        }

        if (!w.held) this.updateState(w, dt);
      }

      // keep Miis from walking through each other
      for (let i = 0; i < this.walkers.length; i++) {
        for (let j = i + 1; j < this.walkers.length; j++) {
          const a = this.walkers[i], b = this.walkers[j];
          if (a.held || b.held || a.partner === b) continue;
          const dx = b.x - a.x, dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          const min = 1.2;
          if (d > 0.001 && d < min) {
            const push = (min - d) / d * 0.5;
            // Two Miis walking into each other: step to the side (like people
            // passing in a hallway) instead of pushing head-on forever.
            const walkingA = a.state === "walk" || a.state === "approach";
            const walkingB = b.state === "walk" || b.state === "approach";
            const nudge = (m, sx, sz) => {
              if (m.state === "activity" || m.state === "interact") return;
              // never push a Mii into a tree, a desk or the water
              if (!this.nav.isBlocked(m.x + sx, m.z + sz)) { m.x += sx; m.z += sz; }
            };
            if (walkingA && walkingB) {
              const side = 0.6 * push;
              nudge(a, dz * side, -dx * side);
              nudge(b, -dz * side, dx * side);
            }
            nudge(a, -dx * push, -dz * push);
            nudge(b, dx * push, dz * push);
          }
        }
      }

      for (const w of this.walkers) this.applyPose(w, dt);
    }

    updateState(w, dt) {
      switch (w.state) {
        case "idle": {
          w.timer -= dt;
          if (w.timer > 0) {
            if (Math.random() < dt * 0.25) w.targetYaw = rnd(-0.8, 0.8); // look around, mostly towards the camera
            break;
          }
          const roll = Math.random();
          if (roll < 0.3 && this.world.spots.length) {
            const spot = D.pick(this.world.spots);
            if (!this.walkers.some((o) => o !== w && o.spot === spot)) {
              w.spot = spot;
              if (w.goTo(spot.x, spot.z)) break;
            }
          }
          if (roll < 0.85) {
            const p = this.randomFloorPoint();
            w.goTo(p.x, p.z);
          } else {
            w.timer = rnd(1, 3);
            if (this.world.floaty && Math.random() < 0.5) { w.hop(2.4); w.say(D.pick(["Boing!", "Moon jump!", "Wheee!"]), 1.6); }
          }
          break;
        }

        case "walk": {
          const result = this.followPath(w, dt);
          if (result === "lost") {
            // couldn't get there: give up and try something else
            w.spot = null;
            w.state = "idle";
            w.timer = rnd(0.5, 1.5);
          } else if (result === "arrived") {
            if (w.spot) {
              w.state = "activity";
              w.timer = rnd(6, 11);
              // sitting spots move the Mii onto the seat
              if (w.spot.seat) w.seat = w.spot.seat;
              w.targetYaw = w.spot.yaw || 0;
              w.showEmote(w.spot.emoji, w.timer);
              if (Math.random() < 0.6) w.say(D.pick(w.spot.lines));
            } else {
              w.state = "idle";
              w.timer = rnd(1, 4);
              w.targetYaw = rnd(-0.5, 0.5);
            }
          }
          break;
        }

        case "activity":
          w.timer -= dt;
          w.arms = w.spot.arms || "down";
          if (w.timer <= 0) {
            w.arms = "down";
            w.emote = null; w.uiEmote.classList.remove("show");
            w.seat = null; // stand back up
            const back = this.randomFloorPoint();
            w.spot = null;
            w.goTo(back.x, back.z);
          }
          break;

        case "approach": {
          const B = w.partner;
          if (!B) { w.state = "idle"; break; }
          B.targetYaw = Math.atan2(w.x - B.x, w.z - B.z);
          // plan (or re-plan) a route to a free spot next to the other Mii
          w.replanIn = (w.replanIn || 0) - dt;
          if (!w.path || w.replanIn <= 0) {
            const meet = this.meetingPoint(w, B);
            w.path = this.nav.findPath(w.x, w.z, meet.x, meet.z);
            w.replanIn = 1.5;
            if (!w.path) { this.endInteraction(w); break; }
          }
          const result = this.followPath(w, dt);
          const close = Math.hypot(w.x - B.x, w.z - B.z) < 2.3;
          if (result === "arrived" || (close && result !== "lost") || result === "lost") {
            if (result === "lost" && !close) { this.endInteraction(w); break; }
            w.path = null;
            w.state = "interact";
            B.state = "interact";
            w.step = -1;
            w.stepTimer = 0;
          }
          break;
        }

        case "waiting":
          if (w.partner) w.targetYaw = Math.atan2(w.partner.x - w.x, w.partner.z - w.z);
          break;

        case "interact": {
          const p = w.partner;
          if (p) {
            // face each other, but turn a bit towards the camera so we can see their faces
            const face = Math.atan2(p.x - w.x, p.z - w.z);
            w.targetYaw = turnToward(face, 0, 0.35);
          }
          if (w.dance) w.targetYaw += Math.sin(this.time * 5) * 0.8;
          if (w.role === "A") this.runScript(w, dt);
          if (w.dance && w.lift <= this.baseLift(w) + 0.01) w.hop(this.world.floaty ? 1.5 : 3.5);
          break;
        }
      }
    }

    // Where should A stand to talk to B? Next to B, on whichever side is free.
    meetingPoint(A, B) {
      const sides = A.x < B.x ? [-1, 1] : [1, -1];
      for (const sx of sides) {
        for (const [ox, oz] of [[1.8, 0], [1.4, 0.9], [1.4, -0.9]]) {
          const x = B.x + sx * ox, z = B.z + oz;
          if (!this.nav.isBlocked(x, z)) return { x, z };
        }
      }
      return this.nav.nearestFree(B.x + sides[0] * 1.8, B.z);
    }

    // Walks a Mii along its planned route.
    // Returns "walking", "arrived", or "lost" (stuck and can't find a way).
    followPath(w, dt) {
      if (!w.path || !w.path.length) return "arrived";
      const next = w.path[0];
      const d = Math.hypot(next.x - w.x, next.z - w.z);
      if (d < 0.12) {
        w.path.shift();
        w.bestDist = Infinity;
        return w.path.length ? "walking" : "arrived";
      }
      // If another Mii nudged us off our route, the straight line to the next
      // point might now go through something: if so, plan a new route.
      w.lineCheckIn = (w.lineCheckIn || 0) - dt;
      if (w.lineCheckIn <= 0) {
        w.lineCheckIn = 0.2;
        if (!this.nav.clearLine(w.x, w.z, next.x, next.z)) {
          // re-plan once; if the new route still isn't clear, just carry on carefully
          // (the stuck check below gives up if we really can't get anywhere)
          if (!w.justReplanned) {
            w.justReplanned = true;
            const goal = w.path[w.path.length - 1];
            const path = this.nav.findPath(w.x, w.z, goal.x, goal.z);
            if (!path) return "lost";
            w.path = path;
            return "walking";
          }
        } else {
          w.justReplanned = false;
        }
      }
      // never take a step into an obstacle
      const before = { x: w.x, z: w.z };
      this.stepToward(w, next.x, next.z, dt);
      if (this.nav.isBlocked(w.x, w.z) && !this.nav.isBlocked(before.x, before.z)) { w.x = before.x; w.z = before.z; }
      // stuck check: if we haven't got any closer for a while, plan a new route
      if (d < w.bestDist - 0.05) { w.bestDist = d; w.stuckTime = 0; }
      else w.stuckTime = (w.stuckTime || 0) + dt;
      if (w.stuckTime > 0.9) {
        w.repaths = (w.repaths || 0) + 1;
        w.stuckTime = 0;
        w.bestDist = Infinity;
        if (w.repaths > 2) return "lost";
        const goal = w.path[w.path.length - 1];
        const path = this.nav.findPath(w.x, w.z, goal.x, goal.z);
        if (!path) return "lost";
        w.path = path;
      }
      return "walking";
    }

    // Runs a conversation one step at a time (the "A" Mii is in charge).
    runScript(A, dt) {
      const B = A.partner;
      if (!B || !A.plan) { this.endInteraction(A); return; }
      A.stepTimer -= dt;
      if (A.stepTimer > 0) return;
      for (const m of [A, B]) { m.arms = "down"; m.dance = false; m.laugh = false; m.sleep = false; m.nod = 0; m.shake = 0; }
      A.step++;
      const step = A.plan.steps[A.step];
      if (!step) { this.finishInteraction(A); return; }
      const actors = step.who === "both" ? [A, B] : step.who === "A" ? [A] : [B];
      const floaty = this.world.floaty;
      // {A} is always the Mii who started the chat and {B} the other one,
      // no matter who is speaking (so B says "Hi Joe! I'm Sam!", not the other way round)
      const line = step.say ? step.say.replace(/\{A\}/g, A.look.name).replace(/\{B\}/g, B.look.name) : null;
      for (const m of actors) {
        if (line) m.say(line, Math.max(step.dur + 0.4, 1.4));
        if (step.emote) m.showEmote(step.emote, Math.max(step.dur, 1.5));
        if (step.arms) m.arms = step.arms;
        if (step.hop) m.hop(floaty ? 1.8 : 4.5);
        if (step.dance) m.dance = true;
        if (step.sleep) { m.sleep = true; }
        if (step.moonJump) m.hop(floaty ? 3.2 : 6.5);
        // expressions are shown with head movements
        if (step.expr === "laugh") m.laugh = true;
        if (step.expr === "sad") m.nod = 0.35;
        if (step.expr === "angry") m.shake = 1;
        if (step.expr === "surprised") m.hop(floaty ? 1 : 2.5);
      }
      A.stepTimer = step.dur;
    }

    // Takes one step towards (tx, tz).
    stepToward(w, tx, tz, dt) {
      const dx = tx - w.x, dz = tz - w.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001) return;
      const speed = w.speed * (this.world.floaty ? 0.6 : 1);
      const step = Math.min(d, speed * dt);
      w.x += (dx / d) * step;
      w.z += (dz / d) * step;
      w.targetYaw = Math.atan2(dx, dz);
      w.phase += dt * speed * 5.5;
    }

    // Copies the Mii's position and movement onto its 3D model.
    applyPose(w, dt) {
      const holder = w.inst.holder;
      const sitting = w.state === "activity" && !!w.seat;
      const walking = (w.state === "walk" || w.state === "approach") && !w.held;
      w.walkAmt += ((walking ? 1 : 0) - w.walkAmt) * Math.min(1, dt * 8);
      w.yaw = turnToward(w.yaw, w.targetYaw, dt * 8);
      if (w.shake) w.yaw += Math.sin(this.time * 20) * 0.04;

      // sitting Mii slides onto the seat; everyone else stands where they are
      w.seatBlend = clamp((w.seatBlend || 0) + (sitting ? dt : -dt) * 4, 0, 1);
      const seat = w.seat || w.lastSeat;
      if (w.seat) w.lastSeat = w.seat;
      const k = w.seatBlend;
      const px = seat ? w.x + (seat.x - w.x) * k : w.x;
      const pz = seat ? w.z + (seat.z - w.z) * k : w.z;
      const py = seat ? (seat.y || 0) * k : 0;
      holder.position.set(px, w.lift + py, pz);
      holder.rotation.y = w.yaw;
      const pop = w.appear < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - w.appear, 3)) : 1;
      holder.scale.setScalar(w.sizeScale * pop);

      w.inst.rig.pose({
        t: this.time,
        walk: w.walkAmt,
        phase: w.phase,
        arms: w.held ? "held" : w.arms,
        held: w.held,
        dance: w.dance,
        laugh: w.laugh,
        nod: (w.sleep ? 0.45 + Math.sin(this.time * 2) * 0.05 : 0) + (w.nod || 0),
        lookYaw: w.shake ? Math.sin(this.time * 14) * 0.4 : 0,
        lookUp: w.state === "activity" && w.spot && w.spot.lookUp ? w.spot.lookUp : 0,
        sit: w.seatBlend > 0.5,
      });
    }

    // ---------- floating text over each Mii ----------
    updateOverlay() {
      const v = new THREE.Vector3();
      const placed = [];
      // front-most Miis first, so bubbles behind them move up out of the way
      const sorted = this.walkers.slice().sort((a, b) => b.z - a.z);
      for (const w of sorted) {
        const s = w.inst.holder.scale.y;
        v.set(w.x, w.lift + (MII_HEIGHT + (this.world.helmet ? 0.25 : 0.05)) * s, w.z).project(this.camera);
        const visible = v.z < 1;
        const x = (v.x * 0.5 + 0.5) * this.W;
        let y = (-v.y * 0.5 + 0.5) * this.H;
        w.ui.style.display = visible ? "" : "none";
        if (!visible) continue;
        // feet position for the name tag
        const feet = new THREE.Vector3(w.x, 0, w.z).project(this.camera);
        w.uiName.style.transform = "translate(-50%, " + ((-feet.y * 0.5 + 0.5) * this.H - y + 6) + "px)";
        w.uiName.classList.toggle("show", this.hover === w || this.dragging === w);

        if (w.bubble) {
          const bw = w.uiBubble.offsetWidth, bh = w.uiBubble.offsetHeight;
          let bx = clamp(x - bw / 2, 4, this.W - bw - 4);
          let by = y - bh - 12;
          for (let tries = 0; tries < 6; tries++) {
            const hit = placed.find((r) => bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h + 6 && by + bh + 6 > r.y);
            if (!hit) break;
            by = hit.y - bh - 8;
          }
          by = Math.max(4, by);
          placed.push({ x: bx, y: by, w: bw, h: bh });
          w.uiBubble.style.left = bx - x + "px";
          w.uiBubble.style.top = by - y + "px";
          w.uiBubble.style.setProperty("--tail", clamp(x - bx, 14, bw - 14) + "px");
        }
        w.ui.style.transform = "translate(" + x + "px," + y + "px)";
      }
    }

    // ---------- clicking & dragging ----------
    pointerRay(e) {
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      return this.raycaster.ray;
    }

    // Finds the Mii under the pointer by treating each Mii as an upright capsule.
    pickWalker(ray) {
      let best = null, bestDist = Infinity;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), onRay = new THREE.Vector3(), onSeg = new THREE.Vector3();
      for (const w of this.walkers) {
        const s = w.inst.holder.scale.y;
        a.set(w.x, w.lift + 0.1 * s, w.z);
        b.set(w.x, w.lift + MII_HEIGHT * s, w.z);
        const dist2 = ray.distanceSqToSegment(a, b, onRay, onSeg);
        const radius = (onSeg.y - w.lift > 0.9 * s ? 0.6 : 0.4) * s;
        if (dist2 < radius * radius) {
          const along = onRay.distanceTo(ray.origin);
          if (along < bestDist) { bestDist = along; best = w; }
        }
      }
      return best;
    }

    groundPoint(ray) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const p = new THREE.Vector3();
      return ray.intersectPlane(plane, p) ? p : null;
    }

    bindPointer() {
      const c = this.canvas;
      let down = null;

      c.addEventListener("pointerdown", (e) => {
        const w = this.pickWalker(this.pointerRay(e));
        down = { x: e.clientX, y: e.clientY, w };
        if (w) {
          this.controls.enabled = false; // don't spin the camera while grabbing a Mii
          c.setPointerCapture(e.pointerId);
        }
      });

      c.addEventListener("pointermove", (e) => {
        if (down && down.w && !this.dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
          const w = down.w;
          this.endInteraction(w);
          w.spot = null; w.emote = null; w.uiEmote.classList.remove("show");
          w.state = "idle";
          w.held = true;
          this.dragging = w;
          w.say(D.pick(D.PICKUP_LINES), 1.5);
        }
        if (this.dragging) {
          const w = this.dragging;
          const p = this.groundPoint(this.pointerRay(e));
          if (p) {
            const b = this.world.bounds;
            w.x = clamp(p.x, b.minX, b.maxX);
            w.z = clamp(p.z, b.minZ, b.maxZ + 1);
          }
          w.lift = 1.4 + Math.sin(this.time * 4) * 0.08;
          w.liftVel = 0;
          w.targetYaw = 0;
        } else if (!down) {
          this.hover = this.pickWalker(this.pointerRay(e));
          c.style.cursor = this.hover ? "grab" : "";
        }
      });

      const release = () => {
        if (this.dragging) {
          const w = this.dragging;
          w.held = false;
          w.liftVel = 0;
          w.timer = rnd(1, 2);
          this.dragging = null;
          if (this.nav.isBlocked(w.x, w.z)) {
            // dropped somewhere a Mii can't stand (in the pond, on a desk...): climb out
            const inWater = (this.world.water || []).some((o) => window.MiiNav.insideShape(o, w.x, w.z, 0));
            const out = this.nav.nearestFree(w.x, w.z);
            w.path = [out];
            w.target = out;
            w.state = "walk";
            w.resetStuck();
            setTimeout(() => w.say(inWater ? D.pick(["Splash! I'm soaked!", "Brr, cold water!", "I can't swim!"]) : D.pick(["Whoops!", "Oof, not here!"]), 1.8), 350);
          } else {
            setTimeout(() => w.say(D.pick(D.DROP_LINES), 1.6), 350);
          }
        } else if (down && down.w) {
          const w = down.w;
          w.hop(this.world.floaty ? 1.6 : 4);
          w.targetYaw = 0;
          if (!this.isBusy(w)) {
            w.say(D.pick(D.CLICK_LINES), 1.8);
            w.arms = "wave";
            setTimeout(() => { if (w.arms === "wave" && !w.partner) w.arms = "down"; }, 1500);
          }
          if (this.onSelect) this.onSelect(w);
        }
        down = null;
        this.controls.enabled = true;
      };
      c.addEventListener("pointerup", release);
      c.addEventListener("pointercancel", release);
      c.addEventListener("pointerleave", () => { if (!this.dragging) this.hover = null; });
    }

    // ---------- main loop ----------
    start() {
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.update(dt);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.updateOverlay();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }

  window.MiiHub3D = { Hub3D };
})();
