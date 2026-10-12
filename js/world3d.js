/*
 * world3d.js
 * The three 3D places Miis can hang out in: a park, an office and outer space.
 *
 * Each place is built from simple 3D shapes (boxes, balls, cylinders), so no
 * extra model files are needed. Every place returns:
 *   group      all the 3D objects
 *   bounds     the area Miis can walk in
 *   obstacles  circles Miis walk around ({ x, z, r })
 *   spots      places to do an activity
 *   lines      things Miis might say here
 *   update(t)  moves animated things (clouds, ducks, stars...)
 */
(function (root) {
  "use strict";

  const THREE = root.THREE;
  const TAU = Math.PI * 2;

  // ---------- little helpers for making shapes ----------
  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, opts || {}));
  }

  function mesh(geo, material, x, y, z, parent) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  function box(w, h, d, color, x, y, z, parent, opts) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts), x, y, z, parent);
  }

  function cyl(rTop, rBottom, h, color, x, y, z, parent, segments, opts) {
    return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments || 16), mat(color, opts), x, y, z, parent);
  }

  function ball(r, color, x, y, z, parent, opts, detail) {
    const geo = detail === undefined ? new THREE.SphereGeometry(r, 20, 14) : new THREE.IcosahedronGeometry(r, detail);
    return mesh(geo, mat(color, opts), x, y, z, parent);
  }

  function ground(size, color, parent) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    parent.add(g);
    return g;
  }

  function flatCircle(r, color, x, y, z, parent, sx, sz) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.scale.set(sx || 1, sz || 1, 1);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function canvasTexture(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  function addLights(group, opts) {
    const hemi = new THREE.HemisphereLight(opts.sky, opts.groundLight, opts.hemi);
    group.add(hemi);
    const sun = new THREE.DirectionalLight(opts.sunColor || 0xffffff, opts.sun);
    sun.position.set(8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    group.add(sun);
  }

  // =====================================================================
  // PARK
  // =====================================================================
  function tree(parent, x, z, size) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(size || 1);
    cyl(0.22, 0.32, 2.2, 0x8b5a2b, 0, 1.1, 0, t, 8);
    const leaf = { flatShading: true };
    ball(1.3, 0x3e9b3a, 0, 2.9, 0, t, leaf, 1);
    ball(0.95, 0x4cad45, -0.75, 2.5, 0.3, t, leaf, 1);
    ball(0.9, 0x379136, 0.8, 2.6, -0.2, t, leaf, 1);
    ball(0.75, 0x5cbf55, 0.1, 3.75, 0.1, t, leaf, 1);
    parent.add(t);
    return t;
  }

  function bench(parent, x, z, rotY) {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = rotY || 0;
    const wood = 0xa8743f, metal = 0x55524f;
    box(2.4, 0.08, 0.6, wood, 0, 0.5, 0, b);
    box(2.4, 0.5, 0.08, wood, 0, 0.85, -0.3, b);
    for (const sx of [-1.05, 1.05]) {
      box(0.08, 0.5, 0.55, metal, sx, 0.25, 0, b);
      box(0.08, 0.55, 0.08, metal, sx, 0.8, -0.3, b);
    }
    parent.add(b);
    return b;
  }

  function buildPark() {
    const group = new THREE.Group();
    const anim = [];
    addLights(group, { sky: 0xcfe9ff, groundLight: 0x6aa84f, hemi: 0.9, sun: 1.1, sunColor: 0xfff3d6 });

    ground(140, 0x6cc24a, group);
    // gentle hills far away
    for (const [x, z, r, c] of [[-30, -40, 22, 0x8fd16f], [10, -48, 26, 0x9ad97a], [40, -38, 20, 0x88cc66], [-60, -20, 25, 0x8fd16f], [60, -10, 22, 0x9ad97a]]) {
      const h = ball(r, c, x, -r * 0.78, z, group, { flatShading: false });
      h.castShadow = false;
    }

    // a winding path made of overlapping flat circles
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2, 0, -14), new THREE.Vector3(1, 0, -6), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(2, 0, 6), new THREE.Vector3(0, 0, 14),
    ]);
    const pathMat = mat(0xe8d4a6);
    const pathGeo = new THREE.CircleGeometry(1.25, 24);
    for (let i = 0; i <= 120; i++) {
      const p = path.getPoint(i / 120);
      const m = new THREE.Mesh(pathGeo, pathMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.01, p.z);
      m.receiveShadow = true;
      group.add(m);
    }

    // pond with ducks
    flatCircle(4.0, 0x5a9e3c, -8, 0.015, 4, group, 1.25, 0.8);
    flatCircle(3.6, 0x4aa8e0, -8, 0.03, 4, group, 1.25, 0.8);
    const ducks = [];
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Group();
      ball(0.32, 0xffffff, 0, 0.18, 0, d);
      ball(0.18, 0xffffff, 0, 0.45, 0.25, d);
      const beak = mesh(new THREE.ConeGeometry(0.07, 0.2, 8), mat(0xff9800), 0, 0.43, 0.45, d);
      beak.rotation.x = Math.PI / 2;
      ball(0.03, 0x111111, 0.1, 0.5, 0.36, d);
      ball(0.03, 0x111111, -0.1, 0.5, 0.36, d);
      group.add(d);
      ducks.push(d);
    }
    anim.push((t) => ducks.forEach((d, i) => {
      const a = t * 0.25 + i * (TAU / 3);
      d.position.set(-8 + Math.cos(a) * 3.0, 0.02 + Math.sin(t * 3 + i) * 0.03, 4 + Math.sin(a) * 1.7);
      d.rotation.y = -a; // swim along the circle
    }));

    // fountain
    const f = new THREE.Group();
    f.position.set(5, 0, -2);
    cyl(1.8, 1.9, 0.5, 0xb9c3cf, 0, 0.25, 0, f, 28);
    const water = cyl(1.6, 1.6, 0.05, 0x5ab8f0, 0, 0.48, 0, f, 28, { roughness: 0.2 });
    water.castShadow = false;
    cyl(0.18, 0.25, 1.6, 0xc9d2dc, 0, 1.0, 0, f, 12);
    cyl(0.7, 0.3, 0.2, 0xc9d2dc, 0, 1.8, 0, f, 20);
    const drops = [];
    const dropMat = mat(0x9fdcff, { transparent: true, opacity: 0.85, roughness: 0.1 });
    const dropGeo = new THREE.SphereGeometry(0.06, 8, 6);
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(dropGeo, dropMat);
      f.add(d);
      drops.push(d);
    }
    anim.push((t) => drops.forEach((d, i) => {
      const p = (t * 0.7 + i / drops.length) % 1;
      const a = (i / drops.length) * TAU * 3;
      const r = 0.2 + p * 1.2;
      d.position.set(Math.cos(a) * r, 1.95 + Math.sin(p * Math.PI) * 0.9 - p * 1.4, Math.sin(a) * r);
    }));
    group.add(f);

    // trees, benches, flowers
    const trees = [[-12, -7, 1.2], [-5, -9, 1], [9, -8, 1.3], [13, -2, 1], [12, 7, 1.15], [-13, 9, 1], [7.5, 9.5, 0.9], [-3.5, -12, 1.1]];
    trees.forEach(([x, z, s]) => tree(group, x, z, s));
    bench(group, -4, -3.2, 0.25);
    bench(group, 8.5, 3, -0.6);

    const rnd = seeded(5);
    const flowerGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const flowerMats = [0xff8fb1, 0xfff176, 0xffffff, 0xc39bff, 0xff7043].map((c) => mat(c));
    for (let i = 0; i < 160; i++) {
      const x = (rnd() - 0.5) * 32, z = (rnd() - 0.5) * 24;
      if (Math.abs(x - path.getPoint(Math.min(1, Math.max(0, (z + 14) / 28))).x) < 1.6) continue;
      const fl = new THREE.Mesh(flowerGeo, flowerMats[i % flowerMats.length]);
      fl.position.set(x, 0.1, z);
      group.add(fl);
    }

    // clouds and sun
    const sunBall = ball(4, 0xffe066, 30, 32, -70, group, { emissive: 0xffd23f, emissiveIntensity: 1 });
    sunBall.castShadow = false;
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const cm = { roughness: 1 };
      ball(1.6, 0xffffff, 0, 0, 0, c, cm);
      ball(1.2, 0xffffff, 1.5, -0.2, 0.2, c, cm);
      ball(1.1, 0xffffff, -1.4, -0.3, 0, c, cm);
      ball(1.0, 0xffffff, 0.4, 0.8, 0, c, cm);
      c.traverse((o) => { o.castShadow = false; });
      c.position.set(-40 + i * 16, 13 + (i % 3) * 2.5, -30 - (i % 2) * 10);
      group.add(c);
      clouds.push(c);
    }
    anim.push((t) => clouds.forEach((c, i) => {
      c.position.x = ((-45 + i * 16 + t * (0.8 + i * 0.15)) % 100 + 100) % 100 - 50;
    }));

    return {
      group,
      background: 0x9fd6ff,
      fog: [0xcfeaff, 45, 120],
      cameraTilt: 0.45,
      bounds: { minX: -14, maxX: 14, minZ: -10, maxZ: 11 },
      obstacles: trees.map(([x, z, s]) => ({ x, z, r: 0.7 * s }))
        .concat([{ x: 5, z: -2, r: 2.1 }, { x: -4, z: -3.2, r: 1.3 }, { x: 8.5, z: 3, r: 1.3 },
          { x: -10.5, z: 4, r: 2.0 }, { x: -8, z: 4, r: 2.0 }, { x: -5.5, z: 4, r: 1.9 }]),
      spots: [
        { x: -4.1, z: -2.85, yaw: 0.25, sit: true, emoji: "🪑", activity: "sitting on the bench",
          lines: ["Ahh, nice to sit down.", "What a lovely bench.", "I could stay here all day."] },
        { x: -8, z: 7.6, yaw: Math.PI, emoji: "🦆", activity: "watching the ducks",
          lines: ["Quack quack!", "Look at the ducks!", "I wish I could swim like that."] },
        { x: 5, z: 0.6, yaw: Math.PI, emoji: "⛲", activity: "looking at the fountain",
          lines: ["*makes a wish*", "So sparkly!", "I threw a coin in!"] },
        { x: 12, z: 5.6, yaw: 0, emoji: "🍃", activity: "resting under a tree",
          lines: ["Nice and shady here.", "*yawn*", "I love the sound of the leaves."] },
      ],
      lines: [
        "What a beautiful day!", "I love the park!", "Smell those flowers!",
        "Anyone want to have a picnic?", "The sun feels nice.", "Is that a butterfly?",
        "I should go jogging more.", "Let's play tag!", "La la la~", "Wheee!",
      ],
      update(t) { anim.forEach((a) => a(t)); },
    };
  }

  // =====================================================================
  // OFFICE
  // =====================================================================
  function desk(parent, x, z) {
    const d = new THREE.Group();
    d.position.set(x, 0, z);
    box(2.6, 0.1, 1.2, 0xc79a6a, 0, 1.0, 0, d);
    for (const [sx, sz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) box(0.08, 1.0, 0.08, 0x6b5640, sx, 0.5, sz, d);
    // monitor faces backwards (towards the Mii working at it)
    box(1.1, 0.7, 0.07, 0x2b2f3a, 0, 1.55, 0.35, d);
    box(0.1, 0.4, 0.1, 0x2b2f3a, 0, 1.2, 0.35, d);
    const screen = box(1.0, 0.6, 0.01, 0x7fd3ff, 0, 1.55, 0.31, d, { emissive: 0x3aa7e8, emissiveIntensity: 0.6 });
    screen.castShadow = false;
    box(0.8, 0.03, 0.3, 0x444444, 0, 1.07, -0.15, d); // keyboard
    cyl(0.1, 0.09, 0.2, 0xff7b54, 0.95, 1.15, 0.1, d, 12); // mug
    // chair behind the desk
    cyl(0.35, 0.35, 0.08, 0x3d4b66, 0, 0.6, -1.0, d, 16);
    box(0.7, 0.7, 0.08, 0x3d4b66, 0, 1.0, -1.35, d);
    cyl(0.05, 0.05, 0.55, 0x333333, 0, 0.3, -1.0, d, 8);
    parent.add(d);
    return { group: d, screen };
  }

  function plant(parent, x, z) {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    cyl(0.4, 0.3, 0.7, 0xc9673a, 0, 0.35, 0, p, 14);
    for (let i = 0; i < 7; i++) {
      const leaf = ball(0.25, i % 2 ? 0x3f9c45 : 0x53b85a, 0, 0, 0, p, { flatShading: true }, 0);
      leaf.scale.set(0.6, 2.2, 0.6);
      const a = (i / 7) * TAU;
      leaf.position.set(Math.cos(a) * 0.2, 1.2, Math.sin(a) * 0.2);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    parent.add(p);
  }

  function buildOffice() {
    const group = new THREE.Group();
    const anim = [];
    addLights(group, { sky: 0xffffff, groundLight: 0x8c8c99, hemi: 1.0, sun: 0.75 });

    // carpet with a tile pattern
    const carpet = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#8aa0b8"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, w, h);
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
    carpet.repeat.set(20, 20);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    // walls
    box(40, 9, 0.4, 0xe9e4d8, 0, 4.5, -12, group);
    box(0.4, 9, 30, 0xe2dccd, -18, 4.5, 2, group);
    box(0.4, 9, 30, 0xe2dccd, 18, 4.5, 2, group);
    box(40, 0.5, 0.45, 0xc8bfa8, 0, 0.25, -11.95, group);

    // windows with a city skyline
    const city = canvasTexture(512, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#8ec9ff"); g.addColorStop(1, "#d9eeff");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const r = seeded(11);
      for (let b = 0; b < 14; b++) {
        const bw = w / 14, bh = h * (0.3 + r() * 0.6);
        ctx.fillStyle = ["#7d8ca8", "#93a1bb", "#6b7a96"][b % 3];
        ctx.fillRect(b * bw, h - bh, bw - 3, bh);
        ctx.fillStyle = "#fff6c2";
        for (let y = h - bh + 8; y < h - 6; y += 14) for (let x = b * bw + 5; x < (b + 1) * bw - 8; x += 10) if (r() > 0.45) ctx.fillRect(x, y, 4, 6);
      }
    });
    for (const x of [-10, 0, 10]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ map: city }));
      win.position.set(x, 4.8, -11.78);
      group.add(win);
      box(7.3, 0.2, 0.2, 0xffffff, x, 6.85, -11.7, group);
      box(7.3, 0.2, 0.2, 0xffffff, x, 2.75, -11.7, group);
      box(0.15, 4, 0.2, 0xffffff, x, 4.8, -11.7, group);
    }

    // poster
    const poster = canvasTexture(128, 180, (ctx, w, h) => {
      ctx.fillStyle = "#ffcf5a"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#5a3e00"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("TEAM", w / 2, 80); ctx.fillText("WORK!", w / 2, 115);
      ctx.font = "40px sans-serif"; ctx.fillText("⭐", w / 2, 165);
    });
    const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.25), new THREE.MeshStandardMaterial({ map: poster }));
    posterMesh.position.set(-15.5, 4.5, -11.75);
    group.add(posterMesh);

    // wall clock showing the real time
    const clock = new THREE.Group();
    clock.position.set(15.2, 6, -11.7);
    cyl(0.9, 0.9, 0.1, 0xffffff, 0, 0, 0, clock, 32).rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 32), mat(0x444444));
    clock.add(rim);
    const hourHand = box(0.08, 0.5, 0.03, 0x222222, 0, 0, 0.1, null);
    hourHand.geometry.translate(0, 0.25, 0);
    const minHand = box(0.05, 0.75, 0.03, 0x222222, 0, 0, 0.12, null);
    minHand.geometry.translate(0, 0.37, 0);
    clock.add(hourHand, minHand);
    group.add(clock);
    anim.push(() => {
      const now = new Date();
      hourHand.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU;
      minHand.rotation.z = -(now.getMinutes() + now.getSeconds() / 60) / 60 * TAU;
    });

    // desks, plants, water cooler, printer
    const deskSpots = [[-8, -3.5], [0, -3.5], [8, -3.5], [-4, 4], [4, 4]];
    const screens = deskSpots.map(([x, z]) => desk(group, x, z).screen);
    anim.push((t) => screens.forEach((s, i) => { s.material.emissiveIntensity = 0.55 + Math.sin(t * 2 + i) * 0.1; }));
    plant(group, -16, -10); plant(group, 16, 9); plant(group, -16, 9);

    const cooler = new THREE.Group();
    cooler.position.set(13, 0, -9.5);
    box(0.8, 1.4, 0.8, 0xeef1f5, 0, 0.7, 0, cooler);
    cyl(0.35, 0.35, 0.9, 0x6ebeff, 0, 1.85, 0, cooler, 16, { transparent: true, opacity: 0.75, roughness: 0.1 });
    box(0.15, 0.12, 0.1, 0x3d7bd9, 0, 1.1, 0.42, cooler);
    group.add(cooler);

    const printer = new THREE.Group();
    printer.position.set(-13, 0, -9.5);
    box(1.4, 1.0, 1.0, 0x7d8592, 0, 0.5, 0, printer);
    box(1.3, 0.35, 0.9, 0xd9dde3, 0, 1.17, 0, printer);
    box(0.7, 0.02, 0.5, 0xffffff, 0, 1.36, 0.1, printer);
    ball(0.05, 0x4caf50, 0.5, 1.2, 0.46, printer, { emissive: 0x4caf50 });
    group.add(printer);

    return {
      group,
      background: 0xd8d1c0,
      fog: null,
      bounds: { minX: -16, maxX: 16, minZ: -10, maxZ: 10 },
      obstacles: deskSpots.map(([x, z]) => ({ x, z, r: 1.45 }))
        .concat(deskSpots.map(([x, z]) => ({ x: x - 0.9, z, r: 0.9 })))
        .concat(deskSpots.map(([x, z]) => ({ x: x + 0.9, z, r: 0.9 })))
        .concat([{ x: 13, z: -9.5, r: 0.8 }, { x: -13, z: -9.5, r: 1.0 }, { x: -16, z: 9, r: 0.6 }, { x: 16, z: 9, r: 0.6 }]),
      spots: deskSpots.slice(0, 3).map(([x, z], i) => ({
        x, z: z - 1.0, yaw: 0, sit: true, arms: "type",
        emoji: ["⌨️", "💻", "📊"][i], activity: "working at a desk",
        lines: [["*click clack*", "So many emails...", "Almost done with this report!"],
          ["Can you hear me now?", "You're on mute!", "Let's circle back on that."],
          ["Numbers are going up!", "Spreadsheet time!", "Who made this chart?"]][i],
      })).concat([
        { x: 13, z: -8.2, yaw: Math.PI, emoji: "💧", activity: "getting water",
          lines: ["*glug glug*", "Staying hydrated!", "Any gossip today?"] },
        { x: -13, z: -8.1, yaw: Math.PI, emoji: "🖨️", activity: "using the printer",
          lines: ["Paper jam AGAIN?!", "Come on, print!", "Who used all the ink?"] },
      ]),
      lines: [
        "Is it lunch time yet?", "I need more coffee.", "Meeting in 5 minutes!",
        "Did anyone see my stapler?", "I love Fridays.", "Working hard or hardly working?",
        "Great job, team!", "Who wants pizza?", "Let's brainstorm!", "My chair squeaks.",
      ],
      update(t) { anim.forEach((a) => a(t)); },
    };
  }

  // =====================================================================
  // OUTER SPACE
  // =====================================================================
  function buildSpace() {
    const group = new THREE.Group();
    const anim = [];
    addLights(group, { sky: 0xb9b4ff, groundLight: 0x302850, hemi: 0.55, sun: 1.1, sunColor: 0xfff6e8 });

    // moon ground with bumps
    const geo = new THREE.PlaneGeometry(120, 120, 80, 80);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.hypot(x, y);
      const bump = Math.sin(x * 0.35) * Math.cos(y * 0.3) * 0.25 + Math.sin(x * 0.08 + y * 0.05) * 1.2;
      pos.setZ(i, d < 22 ? bump * 0.08 : bump * Math.min(1, (d - 22) / 10) * 1.2);
    }
    geo.computeVertexNormals();
    const moon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a95ad, roughness: 1, flatShading: true }));
    moon.rotation.x = -Math.PI / 2;
    moon.receiveShadow = true;
    group.add(moon);

    // craters
    const r = seeded(3);
    for (let i = 0; i < 14; i++) {
      const x = (r() - 0.5) * 34, z = (r() - 0.5) * 24;
      const cr = 0.6 + r() * 1.6;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(cr, cr * 0.18, 8, 28), mat(0xa39db8, { flatShading: true }));
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, 0.02, z);
      rim.scale.z = 0.5;
      rim.receiveShadow = true;
      group.add(rim);
      flatCircle(cr, 0x9690ab, x, 0.03, z, group);
    }

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3(r() - 0.5, r() * 0.8 - 0.05, r() - 0.5).normalize().multiplyScalar(150);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true }));
    group.add(stars);
    anim.push((t) => { stars.material.opacity = 0.75 + Math.sin(t * 2) * 0.2; stars.rotation.y = t * 0.004; });

    // Earth
    const earthTex = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#1d6fd1"; ctx.fillRect(0, 0, w, h);
      const rr = seeded(9);
      ctx.fillStyle = "#4cb050";
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.ellipse(rr() * w, h * 0.15 + rr() * h * 0.7, 20 + rr() * 50, 12 + rr() * 30, rr() * 3, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.ellipse(rr() * w, rr() * h, 15 + rr() * 30, 4 + rr() * 6, 0, 0, TAU); ctx.fill(); }
      ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 14, w, 14);
    });
    const earth = mesh(new THREE.SphereGeometry(9, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.7 }), 20, 9, -60, group);
    earth.castShadow = false;
    const glow = mesh(new THREE.SphereGeometry(9.6, 48, 32), new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.18 }), 20, 9, -60, group);
    glow.castShadow = false;
    anim.push((t) => { earth.rotation.y = t * 0.05; });

    // ringed planet
    const planet = ball(5, 0xffb46b, -30, 11, -70, group);
    planet.castShadow = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.5, 9.5, 48), new THREE.MeshBasicMaterial({ color: 0xffe0b0, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.position.copy(planet.position);
    ring.rotation.set(1.2, 0.3, 0);
    group.add(ring);

    // rocket
    const rocket = new THREE.Group();
    rocket.position.set(-11, 0, -4);
    cyl(0.9, 1.0, 5, 0xf2f2f7, 0, 3.2, 0, rocket, 24);
    const nose = mesh(new THREE.ConeGeometry(0.9, 1.8, 24), mat(0xe74c3c), 0, 6.6, 0, rocket);
    nose.castShadow = true;
    const windowMat = { emissive: 0x2a7fd0, emissiveIntensity: 0.4, roughness: 0.2 };
    const win = ball(0.35, 0x6fc3ff, 0, 4.4, 0.85, rocket, windowMat);
    win.scale.z = 0.4;
    for (let i = 0; i < 3; i++) {
      const fin = box(0.12, 1.6, 1.2, 0xe74c3c, 0, 0.8, 0, null);
      const a = (i / 3) * TAU;
      fin.position.set(Math.sin(a) * 1.0, 1.1, Math.cos(a) * 1.0);
      fin.rotation.y = a;
      rocket.add(fin);
    }
    group.add(rocket);
    const puffs = [];
    for (let i = 0; i < 6; i++) {
      const p = ball(0.4, 0xd8d4e6, 0, 0, 0, rocket, { transparent: true, opacity: 0.6 });
      p.castShadow = false;
      puffs.push(p);
    }
    anim.push((t) => puffs.forEach((p, i) => {
      const k = (t * 0.5 + i / puffs.length) % 1;
      const a = i * 2.1;
      p.position.set(Math.cos(a) * k * 1.6, 0.3 + k * 0.5, Math.sin(a) * k * 1.6);
      p.scale.setScalar(0.5 + k * 1.2);
      p.material.opacity = 0.6 * (1 - k);
    }));

    // flag that waves
    const flagGroup = new THREE.Group();
    flagGroup.position.set(2, 0, -6);
    cyl(0.05, 0.05, 3.2, 0xd0d0d8, 0, 1.6, 0, flagGroup, 8);
    const flagGeo = new THREE.PlaneGeometry(1.6, 1.0, 12, 4);
    flagGeo.translate(0.8, 0, 0);
    const flagTex = canvasTexture(128, 80, (ctx, w, h) => {
      ctx.fillStyle = "#ff5a7a"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(w / 2, h / 2, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff5a7a"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Mii", w / 2, h / 2 + 1);
    });
    const flag = mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }), 0.03, 2.65, 0, flagGroup);
    group.add(flagGroup);
    const flagBase = flagGeo.attributes.position.array.slice();
    anim.push((t) => {
      const p = flagGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = flagBase[i * 3];
        p.setZ(i, Math.sin(t * 3 + x * 3) * 0.12 * x);
      }
      p.needsUpdate = true;
      flagGeo.computeVertexNormals();
    });

    // rover with a spinning dish
    const rover = new THREE.Group();
    rover.position.set(10, 0, 4);
    rover.rotation.y = -0.5;
    box(2.4, 0.6, 1.4, 0xe0b93c, 0, 0.9, 0, rover);
    for (const [x, z] of [[-0.9, 0.8], [0, 0.8], [0.9, 0.8], [-0.9, -0.8], [0, -0.8], [0.9, -0.8]]) {
      const wheel = cyl(0.35, 0.35, 0.25, 0x444444, x, 0.35, z, rover, 14);
      wheel.rotation.x = Math.PI / 2;
    }
    cyl(0.05, 0.05, 0.9, 0x888888, 0.6, 1.6, 0, rover, 8);
    const dish = mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, TAU, 0, Math.PI / 2.5), mat(0xcfd6e6, { side: THREE.DoubleSide }), 0.6, 2.1, 0, rover);
    group.add(rover);
    anim.push((t) => { dish.rotation.y = t * 0.8; dish.rotation.x = 0.8; });

    // rocks
    for (const [x, z, s] of [[-4, 7, 0.8], [6, -9, 1.1], [14, -5, 0.7], [-15, 6, 1.0]]) {
      const rock = ball(s, 0x8f88a6, x, s * 0.4, z, group, { flatShading: true }, 0);
      rock.scale.y = 0.7;
    }

    // satellite in orbit
    const sat = new THREE.Group();
    box(0.5, 0.4, 0.4, 0xcfd6e6, 0, 0, 0, sat, { metalness: 0.5 });
    box(1.2, 0.03, 0.5, 0x3b6fd8, -0.9, 0, 0, sat);
    box(1.2, 0.03, 0.5, 0x3b6fd8, 0.9, 0, 0, sat);
    sat.traverse((o) => { o.castShadow = false; });
    group.add(sat);
    anim.push((t) => {
      const a = t * 0.12;
      sat.position.set(Math.cos(a) * 30, 16 + Math.sin(a * 2) * 2, -25 + Math.sin(a) * 8);
      sat.rotation.set(t * 0.3, t * 0.2, 0);
    });

    return {
      group,
      background: 0x07061a,
      fog: null,
      cameraTilt: 0.38,
      helmet: true,
      floaty: true,
      bounds: { minX: -16, maxX: 16, minZ: -10, maxZ: 10 },
      obstacles: [{ x: -11, z: -4, r: 1.9 }, { x: 2, z: -6, r: 0.4 }, { x: 10, z: 4, r: 1.7 },
        { x: -4, z: 7, r: 0.9 }, { x: 6, z: -9, r: 1.2 }, { x: 14, z: -5, r: 0.8 }, { x: -15, z: 6, r: 1.1 }],
      spots: [
        { x: -9, z: -1.6, yaw: Math.PI * 0.8, emoji: "🚀", activity: "checking the rocket",
          lines: ["3... 2... 1... just kidding!", "Fuel looks good!", "Who wants a ride?"] },
        { x: 2.3, z: -4.6, yaw: Math.PI, arms: "up", emoji: "🚩", activity: "saluting the flag",
          lines: ["One small step for a Mii!", "We made it!", "I claim this rock!"] },
        { x: 8.3, z: 5.8, yaw: Math.PI * 0.8, emoji: "🔧", activity: "fixing the rover",
          lines: ["Beep boop?", "Needs a new wheel.", "Vroom vroom... slowly."] },
        { x: 0, z: 2, yaw: Math.PI * 0.9, lookUp: 0.5, emoji: "🌍", activity: "gazing at Earth",
          lines: ["I can see my house from here!", "Earth looks so tiny!", "Hi Mom!"] },
      ],
      lines: [
        "I'm floating!", "Look, no gravity!", "Space is so quiet...", "Houston, we have a Mii!",
        "Where's the space ice cream?", "Moon jump!", "The stars are amazing!", "Is that an alien?!",
        "Boing... boing...", "My helmet is foggy.",
      ],
      update(t) { anim.forEach((a) => a(t)); },
    };
  }

  const builders = { park: buildPark, office: buildOffice, space: buildSpace };
  const list = [
    { id: "park", name: "Park", icon: "🌳" },
    { id: "office", name: "Office", icon: "🏢" },
    { id: "space", name: "Outer Space", icon: "🚀" },
  ];

  function build(id) {
    const s = builders[id]();
    const meta = list.find((l) => l.id === id);
    return Object.assign(s, meta, { helmet: !!s.helmet, floaty: !!s.floaty });
  }

  function dispose(scene) {
    scene.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  root.World3D = { build, dispose, list };
})(typeof self !== "undefined" ? self : this);
