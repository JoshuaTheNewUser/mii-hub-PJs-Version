/*
 * homes3d.js
 * Two places that are all about where Miis live:
 *
 *   "apartments"  a cheerful apartment block with a courtyard. Every Mii has
 *                 its own apartment (a door, a name plate and a window). The
 *                 window is lit with the curtains open when that Mii is home.
 *   "home"        the inside of one Mii's apartment, built from the furniture
 *                 it owns (see homes.js for the furniture list).
 *
 * Both are built with the same toolkit as the other places (World3D.kit), so
 * they share the soft, rounded, toon-shaded Tomodachi Life look.
 */
(function (root) {
  "use strict";

  if (!root.World3D || !root.World3D.kit) return; // (not in a browser, e.g. the tests)

  const {
    THREE, TAU, toon, glow, G, put, ball, cylinder, block, disc, group, dynamic, canvasTexture, seeded,
    skyDome, addLights, mergeStatic, scatter, roundTree, bush, parkBench, lampPost,
  } = root.World3D.kit;
  const PI = Math.PI;

  // =====================================================================
  // Small helpers shared by both places
  // =====================================================================

  // A flat picture (sign, screen, painting...). Faces +z unless turned.
  function plane(p, w, h, mat, o) {
    return put(p, new THREE.PlaneGeometry(w, h), mat, Object.assign({ shadow: false }, o));
  }
  // A material that ignores lights (for screens and painted views).
  function basic(map, o) {
    return new THREE.MeshBasicMaterial(Object.assign({ map, toneMapped: false }, o || {}));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Picks a font size so the text fits in maxW pixels.
  function fitFont(ctx, text, maxW, size, weight) {
    let s = size;
    for (;;) {
      ctx.font = (weight || "bold") + " " + s + "px 'Nunito', sans-serif";
      if (ctx.measureText(text).width <= maxW || s <= 10) return s;
      s -= 2;
    }
  }

  function heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.75, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    ctx.fill();
  }

  const hex = (n) => "#" + n.toString(16).padStart(6, "0");

  // A plain (sharp-cornered) box: much lighter than a rounded block, good for
  // small or far-away details.
  function bx(p, color, x, y, z, w, h, d, o) {
    return put(p, G.box(), typeof color === "object" ? color : toon(color), Object.assign({ x, y, z, sx: w, sy: h, sz: d }, o));
  }

  // Builds something that moves as one piece (a car, a cloud...) and merges its
  // parts into a few shapes, so it's quick to draw. Build it at the origin.
  function movingThing(parent, build) {
    const g = new THREE.Group();
    build(g);
    mergeStatic(g);
    parent.add(g);
    return dynamic(g);
  }

  // A lighter version of the round tree for scenery far away (fewer triangles).
  function farTree(p, x, z, s, colors) {
    const t = group(p, x, 0, z, 0, s);
    put(t, G.taper(0.24, 0.36, 8), toon(0x9a6a3c), { y: 1.6, sy: 3.2 });
    const [c1, c2] = colors || [0x5cc84a, 0x7fdc5c];
    const S = G.lowSphere();
    put(t, S, toon(c1), { y: 4.1, s: 1.45 });
    put(t, S, toon(c1), { x: -0.95, y: 3.7, z: 0.25, s: 1.0 });
    put(t, S, toon(c1), { x: 0.95, y: 3.75, z: -0.1, s: 1.05 });
    put(t, S, toon(c2), { x: -0.35, y: 4.55, z: 0.55, s: 0.85 });
    return t;
  }

  // A fluffy cloud made of a few balls. All clouds share one material.
  function cloud(p, mat, x, y, z, s) {
    // (a shared emissive material is fine to merge: all clouds look the same)
    const c = new THREE.Group();
    const S = G.lowSphere();
    put(c, S, mat, { s: 2.2, shadow: false });
    put(c, S, mat, { x: 2.2, y: -0.4, z: 0.3, s: 1.6, shadow: false });
    put(c, S, mat, { x: -2.1, y: -0.5, s: 1.5, shadow: false });
    put(c, S, mat, { x: 0.6, y: 1.1, s: 1.4, shadow: false });
    mergeStatic(c);
    c.position.set(x, y, z);
    if (s) c.scale.setScalar(s);
    p.add(c);
    return dynamic(c);
  }

  // A cute little house: walls with a pointy gable at the front (+z), a roof,
  // a door and windows. o = { w, d, h, rh, wall, roof, door, s }
  function house(p, x, z, ry, o) {
    const g = group(p, x, 0, z, ry, o.s);
    const w = o.w || 4, d = o.d || 3.6, h = o.h || 2.6, rh = o.rh || 1.7;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(0, h + rh); shape.lineTo(-w / 2, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    put(g, geo, toon(o.wall || 0xfff1dc), {});
    // roof: two thick boards meeting at the top
    const half = Math.hypot(w / 2, rh), ang = Math.atan2(rh, w / 2);
    for (const side of [-1, 1]) {
      block(g, o.roof || 0xe2574c, side * (w / 4 + 0.06), h + rh / 2 + 0.1, 0, half + 0.5, 0.2, d + 0.5, 0.08, { rz: -side * ang });
    }
    bx(g, o.door || 0x9a6a3c, 0, 0.8, d / 2 + 0.03, 0.8, 1.6, 0.1);
    put(g, G.lowSphere(), toon(0xffcf5a), { x: 0.25, y: 0.8, z: d / 2 + 0.1, s: 0.06 });
    const winC = o.lit ? glow(0xffe2a0, 0.5) : toon(0xbfe6ff);
    for (const sx of [-1, 1]) {
      bx(g, 0xffffff, sx * w * 0.3, 1.55, d / 2 + 0.02, 0.85, 0.85, 0.08);
      bx(g, winC, sx * w * 0.3, 1.55, d / 2 + 0.05, 0.65, 0.65, 0.04);
      // windows at the back too, so houses look fine from every side
      bx(g, 0xffffff, sx * w * 0.25, 1.55, -d / 2 - 0.02, 0.85, 0.85, 0.08);
      bx(g, winC, sx * w * 0.25, 1.55, -d / 2 - 0.05, 0.65, 0.65, 0.04);
    }
    bx(g, winC, 0, h + rh * 0.4, d / 2 + 0.03, 0.5, 0.5, 0.06); // little attic window
    bx(g, o.roof || 0xe2574c, w * 0.25, h + rh * 0.8, -d * 0.2, 0.45, 1.0, 0.45); // chimney
    return g;
  }

  // =====================================================================
  // APARTMENTS — the building where every Mii has a home
  // =====================================================================

  // The building: 4 apartments per floor, at least 3 floors. When every apartment
  // is taken, the building gets another floor (like in Tomodachi Life), up to
  // MAX_FLOORS. Ground floor doors open straight onto the courtyard; upper floors
  // open onto walkway balconies, reached by the lift (left) or the stairs (right).
  const APT = { front: -11.6, back: -18, floorH: 3.5, unitW: 6.4, cols: 4, floors: 3 };
  const MAX_FLOORS = 10;
  // How many floors the building needs for this many Miis.
  function floorsFor(residents) {
    return Math.max(APT.floors, Math.min(MAX_FLOORS, Math.ceil((residents || 0) / APT.cols)));
  }
  const UNIT_COLORS = [
    [0xff7a8a, 0xffb3c1], [0x5cb8ff, 0xa8d8ff], [0x6fcf6a, 0xbdecb8], [0xffad3a, 0xffd99a],
    [0xb58cff, 0xdccbff], [0xff8a5c, 0xffc2a6], [0x3fc2b9, 0xa5e8e2], [0xf06fb0, 0xf9b5d8],
    [0x8bc34a, 0xd3eba8], [0x6f8cff, 0xbdcaff], [0xf2c230, 0xfff0a0], [0xe0605a, 0xf4b0aa],
  ];

  function unitInfo(i) {
    const f = Math.floor(i / APT.cols), c = i % APT.cols;
    const cx = -((APT.cols - 1) / 2) * APT.unitW + c * APT.unitW;
    return {
      i, f, c, cx, y: f * APT.floorH,
      doorX: cx - 1.75, winX: cx + 1.05,
      num: (f + 1) * 100 + c + 1,
      door: UNIT_COLORS[i % UNIT_COLORS.length][0], curtain: UNIT_COLORS[i % UNIT_COLORS.length][1],
    };
  }

  // What you see through a lit window: a cosy room (a few different ones).
  function interiorTexture(kind) {
    return canvasTexture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = ["#ffe9c4", "#ffdfe6", "#e3f1ff"][kind]; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ["#f4d29c", "#f7c3cf", "#c9e0f7"][kind]; ctx.fillRect(0, h * 0.72, w, h * 0.28);
      // a hanging lamp
      ctx.strokeStyle = "#8a6a4a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.3, 0); ctx.lineTo(w * 0.3, 14); ctx.stroke();
      ctx.fillStyle = "#ffcf5a"; ctx.beginPath(); ctx.arc(w * 0.3, 20, 8, PI, 0); ctx.fill();
      // a picture and a plant or a shelf
      ctx.fillStyle = "#ffffff"; ctx.fillRect(w * 0.6, 12, 26, 18);
      ctx.fillStyle = ["#7cc6e8", "#ff9ec7", "#5cc84a"][kind]; ctx.fillRect(w * 0.6 + 3, 15, 20, 12);
      if (kind === 1) {
        ctx.fillStyle = "#c98b4a"; ctx.fillRect(10, h * 0.45, 30, 6);
        ctx.fillStyle = "#ff7a59"; ctx.fillRect(14, h * 0.45 - 8, 6, 8); ctx.fillStyle = "#4a90e2"; ctx.fillRect(22, h * 0.45 - 10, 6, 10);
      } else {
        ctx.fillStyle = "#c98b4a"; ctx.fillRect(w * 0.85, h * 0.58, 10, 12);
        ctx.fillStyle = "#5cc84a"; ctx.beginPath(); ctx.arc(w * 0.85 + 5, h * 0.5, 9, 0, TAU); ctx.fill();
      }
    });
  }

  // opts.residents = how many Miis live here (decides how many floors to build)
  function buildApartments(opts) {
    const FL = floorsFor(opts && opts.residents);
    const N = FL * APT.cols; // number of apartments
    const root = new THREE.Group();
    const anim = [];
    addLights(root, { sky: 0xd6f0ff, ground: 0x9ad27a, hemi: 0.5, sun: 0.9, ambient: 0.24 });
    skyDome(root, 0x3fa9f5, 0xcdeeff, 0xa8dc8a);
    const FZ = APT.front, H = APT.floorH;

    // ---------- ground: grass everywhere, a paved courtyard in the middle ----------
    const grassTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#86d65e"; ctx.fillRect(0, 0, w, h);
      const r = seeded(12);
      for (let i = 0; i < 150; i++) {
        const x = r() * w, y = r() * h;
        ctx.strokeStyle = r() < 0.5 ? "rgba(70,150,45,0.5)" : "rgba(180,240,130,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 6); ctx.moveTo(x + 3, y); ctx.lineTo(x + 4, y - 7); ctx.stroke();
      }
    }, [60, 60]);
    disc(root, toon(0xffffff, { map: grassTex }), 0, -0.02, 0, 170, { receive: true });

    const paveTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#c9a982"; ctx.fillRect(0, 0, w, h);
      const r = seeded(3);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const off = (y % 2) * 32;
        ctx.fillStyle = ["#e4c9a0", "#dcc095", "#e0c49a", "#d4b68a"][Math.floor(r() * 4)];
        roundRect(ctx, x * 64 + off - 64 + 3, y * 64 + 3, 58, 58, 8); ctx.fill();
        roundRect(ctx, x * 64 + off + 3, y * 64 + 3, 58, 58, 8); ctx.fill();
      }
    }, [9, 6]);
    put(root, new THREE.PlaneGeometry(36, 22.6), toon(0xffffff, { map: paveTex }), { y: 0.01, z: (FZ + 11) / 2, rx: -PI / 2, shadow: false });
    // two lawns (left and right) with the playground and the picnic area
    block(root, 0x7fd05a, -11.8, 0.03, 5.6, 10.6, 0.06, 8.4, 0.03, { shadow: false });
    block(root, 0x7fd05a, 12.6, 0.03, 5.2, 9.6, 0.06, 9.2, 0.03, { shadow: false });

    // ---------- the apartment building ----------
    const W = APT.unitW * APT.cols; // 25.6
    const D = APT.back - FZ;
    const wallC = 0xffe6c7, trimC = 0xff8a7a, railC = 0x6fcfbf;
    block(root, wallC, 0, (H * FL) / 2, (FZ + APT.back) / 2, W, H * FL, -D, 0.08);
    block(root, 0xf0c9a4, 0, 0.2, FZ + 0.02, W, 0.4, 0.12, 0.03); // base trim
    // gentle stripes between the floors
    for (let f = 1; f < FL; f++) block(root, 0xffd3a8, 0, f * H + 0.6, FZ + 0.01, W, 0.18, 0.06, 0.02, { shadow: false });
    // walkway balconies (2nd and 3rd floor) with railings, held up by pillars
    const balusters = [];
    for (let f = 1; f < FL; f++) {
      const y = f * H;
      block(root, 0xfdf8f0, 0, y - 0.11, FZ + 0.76, W + 0.1, 0.22, 1.52, 0.04);
      block(root, trimC, 0, y - 0.12, FZ + 1.53, W + 0.2, 0.3, 0.1, 0.04);
      block(root, railC, 0, y + 0.95, FZ + 1.45, W + 0.1, 0.1, 0.12, 0.04);
      block(root, railC, 0, y + 0.18, FZ + 1.45, W + 0.1, 0.07, 0.08, 0.03);
      for (let x = -W / 2 + 0.2; x <= W / 2 - 0.1; x += 0.32) balusters.push({ x, y: y + 0.56, z: FZ + 1.45, sx: 0.035, sy: 0.78, sz: 0.035 });
    }
    scatter(root, G.cyl(6), toon(railC), balusters, true);
    const pillarXs = [];
    for (let c = 0; c <= APT.cols; c++) pillarXs.push(-W / 2 + c * APT.unitW);
    for (const x of pillarXs) cylinder(root, 0xfdf8f0, x, (H * (FL - 1)) / 2, FZ + 1.3, 0.15, H * (FL - 1));
    // roof with a parapet, a sign, a water tank and a TV aerial
    block(root, trimC, 0, H * FL + 0.22, (FZ + APT.back) / 2, W + 0.4, 0.44, -D + 0.4, 0.08);
    block(root, 0xd9cfc2, 0, H * FL + 0.46, (FZ + APT.back) / 2, W - 0.4, 0.06, -D - 0.4, 0.02, { shadow: false });
    const roofSign = canvasTexture(512, 96, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 8; ctx.strokeStyle = "#ff8a7a"; roundRect(ctx, 8, 8, w - 16, h - 16, 22); ctx.stroke();
      ctx.fillStyle = "#e2574c"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      fitFont(ctx, "Mii Apartments", w - 60, 58);
      ctx.fillText("Mii Apartments", w / 2, h / 2 + 3);
    });
    for (const sx of [-2.6, 2.6]) block(root, 0x8f96a3, sx, H * FL + 0.9, FZ + 0.4, 0.12, 1.0, 0.12, 0.03);
    block(root, 0xffffff, 0, H * FL + 1.55, FZ + 0.4, 7.0, 1.3, 0.14, 0.12);
    plane(root, 6.9, 1.29, toon(0xffffff, { map: roofSign }), { y: H * FL + 1.55, z: FZ + 0.48 });
    plane(root, 6.9, 1.29, toon(0xffffff, { map: roofSign }), { y: H * FL + 1.55, z: FZ + 0.32, ry: PI });
    const tank = group(root, 8.5, H * FL + 0.45, -15.5);
    for (const [sx, sz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) block(tank, 0x8f96a3, sx, 0.6, sz, 0.12, 1.2, 0.12, 0.03);
    cylinder(tank, 0x7cc6e8, 0, 1.9, 0, 1.1, 1.5);
    put(tank, G.cone(), toon(0x5aa8d0), { y: 2.9, s: 1.15, sy: 0.5 });
    const aer = group(root, -7, H * FL + 0.45, -14.5);
    cylinder(aer, 0x8f96a3, 0, 1.0, 0, 0.04, 2.0);
    for (let i = 0; i < 3; i++) cylinder(aer, 0x8f96a3, 0, 1.4 + i * 0.25, 0, 0.025, 1.2 - i * 0.25, { rz: PI / 2 });
    for (let i = 0; i < 5; i++) block(root, [0x5cc84a, 0x4fbf47][i % 2], -11 + i * 1.3, H * FL + 0.75, -17.4, 0.9, 0.6, 0.6, 0.25);

    // the back of the building: a window (with a little balcony upstairs) for every flat
    for (let i = 0; i < N; i++) {
      const u = unitInfo(i);
      const wx = -u.cx, by = u.y + 1.8, bz = APT.back - 0.02;
      bx(root, 0xffffff, wx, by, bz, 2.6, 1.6, 0.1);
      bx(root, 0x9fd0f0, wx, by, bz - 0.05, 2.3, 1.3, 0.04);
      bx(root, 0xffffff, wx, by, bz - 0.08, 0.08, 1.3, 0.04);
      bx(root, u.curtain, wx - 0.85, by, bz - 0.08, 0.5, 1.3, 0.04);
      if (u.f > 0) {
        block(root, 0xfdf8f0, wx, u.y - 0.1, bz - 0.55, 3.0, 0.2, 1.1, 0.04);
        block(root, railC, wx, u.y + 0.5, bz - 1.07, 3.0, 0.9, 0.06, 0.04);
        put(root, G.taper(0.16, 0.12), toon(0xe0784a), { x: wx + 1.1, y: u.y + 0.15, z: bz - 0.5, sy: 0.3 });
        put(root, G.lowSphere(), toon(0x5cc84a), { x: wx + 1.1, y: u.y + 0.45, z: bz - 0.5, s: 0.22 });
      } else {
        bx(root, 0x55606e, wx + 1.9, 0.45, bz - 0.35, 0.8, 0.7, 0.5); // air conditioner
        cylinder(root, 0x8f96a3, wx + 1.9, 0.45, bz - 0.61, 0.22, 0.03, { rx: PI / 2 });
      }
    }
    for (let x = -12; x <= 12; x += 4) bush(root, x + 2, APT.back - 1.2, 0.8, 0x4fbf47, [0xff6fa5, null, 0xffe25a][(x / 4 + 3) % 3]);

    // ---------- the two towers: lift (left) and stairs (right) ----------
    const TX = W / 2 + 1.8; // 14.6
    const towerTop = H * FL + 1.4;
    const stairTex = canvasTexture(64, 256, (ctx, w, h) => {
      ctx.fillStyle = "#cfeaff"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#8aa6c4"; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const y0 = h - k * 64; ctx.moveTo(k % 2 ? w : 0, y0); ctx.lineTo(k % 2 ? 0 : w, y0 - 64); }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(6, 0, 8, h);
    });
    for (const side of [-1, 1]) {
      const tx = side * TX;
      block(root, 0xffd6b0, tx, towerTop / 2, (FZ + APT.back) / 2 + 0.1, 3.6, towerTop, -D + 0.4, 0.1);
      block(root, trimC, tx, towerTop + 0.2, (FZ + APT.back) / 2 + 0.1, 3.9, 0.4, -D + 0.7, 0.1);
      // the entrance
      block(root, 0xffffff, tx, 1.3, FZ + 0.25, 2.2, 2.6, 0.12, 0.05);
      if (side < 0) {
        // lift doors with up/down buttons and a floor display
        block(root, 0xb9c3cf, tx - 0.42, 1.2, FZ + 0.32, 0.8, 2.3, 0.08, 0.02);
        block(root, 0xb9c3cf, tx + 0.42, 1.2, FZ + 0.32, 0.8, 2.3, 0.08, 0.02);
        block(root, 0x2f3542, tx + 1.35, 1.25, FZ + 0.26, 0.24, 0.5, 0.06, 0.03);
        ball(root, glow(0xffcf5a, 0.9), tx + 1.35, 1.36, FZ + 0.3, 0.05);
        ball(root, glow(0xffcf5a, 0.9), tx + 1.35, 1.14, FZ + 0.3, 0.05);
        block(root, 0x2f3542, tx, 2.85, FZ + 0.32, 1.1, 0.3, 0.06, 0.03);
        for (let k = 0; k < 3; k++) ball(root, k === 0 ? glow(0xff8a5c, 1) : toon(0x55606e), tx - 0.3 + k * 0.3, 2.85, FZ + 0.36, 0.06);
      } else {
        // glass door to the stairs
        block(root, toon(0xbfe6ff, { transparent: true, opacity: 0.85 }), tx, 1.2, FZ + 0.32, 1.7, 2.3, 0.06, 0.03);
        block(root, 0xffffff, tx, 1.2, FZ + 0.36, 0.08, 2.3, 0.04, 0.02);
        ball(root, 0xffcf5a, tx + 0.18, 1.1, FZ + 0.4, 0.06);
      }
      // tall window showing the lift shaft / the zig-zag stairs
      put(root, new THREE.PlaneGeometry(1.4, H * (FL - 1) + 0.6), toon(0xffffff, { map: side > 0 ? stairTex : null, color: side > 0 ? 0xffffff : 0xd6ecff }), { x: tx, y: H + (H * (FL - 1)) / 2 - 0.1, z: FZ + 0.32, shadow: false });
      block(root, 0xffffff, tx, H + 0.15, FZ + 0.3, 1.6, 0.12, 0.1, 0.03);
      block(root, 0xffffff, tx, H * FL + 0.65, FZ + 0.3, 1.6, 0.12, 0.1, 0.03);
      const lbl = canvasTexture(256, 64, (ctx, w, h) => {
        ctx.fillStyle = "#2f6f9f"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 34px 'Nunito', sans-serif";
        ctx.fillText(side < 0 ? "▲▼  LIFT" : "STAIRS  ⤴", w / 2, h / 2 + 2);
      });
      plane(root, 1.6, 0.4, toon(0xffffff, { map: lbl }), { x: tx, y: side < 0 ? 3.35 : 2.86, z: FZ + 0.34 });
      // windows on the outer side of the tower
      for (let f = 0; f < FL; f++) {
        bx(root, 0xffffff, tx + side * 1.82, f * H + 1.9, (FZ + APT.back) / 2, 0.1, 1.3, 1.3);
        bx(root, 0x9fd0f0, tx + side * 1.86, f * H + 1.9, (FZ + APT.back) / 2, 0.04, 1.05, 1.05);
      }
      // a little canopy over the entrance
      block(root, trimC, tx, 3.05 + (side < 0 ? 0.55 : 0), FZ + 0.75, 2.6, 0.12, 1.1, 0.05);
    }

    // ---------- each apartment: a door, a name plate, a window ----------
    const interiors = [interiorTexture(0), interiorTexture(1), interiorTexture(2)];
    const forRentTex = canvasTexture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#e2574c"; ctx.lineWidth = 5; roundRect(ctx, 5, 5, w - 10, h - 10, 8); ctx.stroke();
      ctx.fillStyle = "#e2574c"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "bold 24px 'Nunito', sans-serif"; ctx.fillText("FOR RENT", w / 2, h / 2 + 1);
    });
    const forRentMat = toon(0xffffff, { map: forRentTex });
    const curtainGeo = G.rbox(1, 1, 1, 0.08);
    const lampSpots = [];
    const units = [];
    for (let i = 0; i < N; i++) {
      const u = unitInfo(i);
      const y = u.y;
      // door (with a little round window and a knob) and its frame
      block(root, 0xffffff, u.doorX, y + 1.2, FZ + 0.03, 1.4, 2.4, 0.08, 0.04);
      block(root, u.door, u.doorX, y + 1.12, FZ + 0.09, 1.15, 2.22, 0.12, 0.06);
      disc(root, toon(0xdff3ff), u.doorX, y + 1.72, FZ + 0.16, 0.17, { rx: 0 });
      ball(root, 0xffcf5a, u.doorX + 0.4, y + 1.05, FZ + 0.19, 0.07);
      block(root, 0x9a6a3c, u.doorX, y + 0.02, FZ + 0.55, 1.1, 0.04, 0.6, 0.02, { shadow: false }); // doormat
      // wall lamp by the door (lit when someone's home)
      block(root, 0x55606e, u.doorX - 0.9, y + 1.85, FZ + 0.08, 0.1, 0.22, 0.12, 0.03);
      lampSpots.push({ x: u.doorX - 0.9, y: y + 1.85, z: FZ + 0.2 });
      // name plate under the window: on the wall downstairs, hung on the railing upstairs
      const pz = u.f === 0 ? FZ + 0.04 : FZ + 1.53;
      block(root, 0x9a6a3c, u.winX, y + 0.58, pz, 2.62, 0.72, 0.06, 0.05);
      const plateCanvas = document.createElement("canvas");
      plateCanvas.width = 384; plateCanvas.height = 100;
      const plateTex = new THREE.CanvasTexture(plateCanvas);
      plateTex.encoding = THREE.sRGBEncoding;
      plateTex.anisotropy = 8;
      dynamic(plane(root, 2.5, 0.65, toon(0xffffff, { map: plateTex }), { x: u.winX, y: y + 0.58, z: pz + 0.04 }));
      // window: frame, sill with flowers, the room inside, curtains and a rod
      const wy = y + 1.75;
      const glass = toon(0xffffff, { map: interiors[i % 3], emissive: 0xffffff, emissiveMap: interiors[i % 3], emissiveIntensity: 0 });
      dynamic(plane(root, 2.7, 1.35, glass, { x: u.winX, y: wy, z: FZ + 0.02 }));
      block(root, 0xffffff, u.winX, wy + 0.74, FZ + 0.08, 3.05, 0.14, 0.18, 0.04);
      block(root, 0xffffff, u.winX, wy - 0.74, FZ + 0.14, 3.2, 0.14, 0.3, 0.04);
      for (const sx of [-1, 1]) block(root, 0xffffff, u.winX + sx * 1.42, wy, FZ + 0.08, 0.14, 1.5, 0.18, 0.04);
      cylinder(root, 0x9a6a3c, u.winX, wy + 0.6, FZ + 0.12, 0.03, 2.8, { rz: PI / 2, shadow: false });
      if (u.f === 0) {
        // a potted plant by each ground floor door
        put(root, G.taper(0.2, 0.15), toon(u.door), { x: u.doorX + 0.95, y: 0.2, z: FZ + 0.35, sy: 0.4 });
        ball(root, 0x5cc84a, u.doorX + 0.95, 0.6, FZ + 0.35, 0.28);
        ball(root, [0xff6fa5, 0xffe25a, 0xffffff, 0xb58cff][u.c], u.doorX + 0.95, 0.82, FZ + 0.42, 0.1);
      }
      const curtains = [];
      for (const sx of [-1, 1]) {
        const c = put(root, curtainGeo, toon(u.curtain), { x: u.winX + sx * 0.7, y: wy - 0.02, z: FZ + 0.07, sx: 1.36, sy: 1.3, sz: 0.06, shadow: false });
        dynamic(c);
        curtains.push(c);
      }
      const rent = dynamic(plane(root, 1.0, 0.5, forRentMat, { x: u.winX - 0.6, y: wy + 0.1, z: FZ + 0.05, rz: 0.06 }));
      units.push(Object.assign(u, { plateCanvas, plateTex, glass, curtains, rent, open: 0, openNow: 0, lit: 0, litNow: 0, key: null, resident: null }));
    }
    // porch lamps: one shape drawn 12 times, coloured on/off
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), lampSpots.length);
    const tmpO = new THREE.Object3D();
    const lampOn = new THREE.Color(0xffe08a), lampOff = new THREE.Color(0x9aa3b0);
    lampSpots.forEach((q, i) => { tmpO.position.set(q.x, q.y, q.z); tmpO.updateMatrix(); lamps.setMatrixAt(i, tmpO.matrix); lamps.setColorAt(i, lampOff); });
    root.add(dynamic(lamps));

    function drawPlate(u, res) {
      const ctx = u.plateCanvas.getContext("2d");
      const w = 384, h = 100;
      ctx.fillStyle = "#9a6a3c"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = res ? "#fffaf0" : "#ece6da"; roundRect(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
      ctx.fillStyle = hex(u.door); roundRect(ctx, 8, 8, 92, h - 16, 14); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "bold 38px 'Nunito', sans-serif"; ctx.fillText(String(u.num), 54, h / 2 + 2);
      const mid = 108 + (w - 120) / 2;
      if (res) {
        ctx.fillStyle = "#3a2a1a";
        fitFont(ctx, res.name || "?", w - 130, 58);
        ctx.fillText(res.name || "?", mid, h / 2 + 3);
      } else {
        ctx.fillStyle = "#9a8f80";
        ctx.font = "italic bold 40px 'Nunito', sans-serif";
        ctx.fillText("For rent", mid, h / 2 + 2);
      }
      u.plateTex.needsUpdate = true;
    }
    units.forEach((u) => drawPlate(u, null));

    // ---------- courtyard things to do ----------
    // mailboxes (one little box per apartment, in each apartment's colour)
    const MB = { x: -16.7, z: -7.0 };
    const mb = group(root, MB.x, 0, MB.z, PI / 2);
    for (const sx of [-1.0, 1.0]) block(mb, 0x8f96a3, sx, 0.4, 0, 0.12, 0.8, 0.12, 0.03);
    block(mb, 0xdfe4ea, 0, 1.35, 0, 2.5, 1.3, 0.55, 0.08);
    const rowH = Math.min(0.4, 1.2 / FL); // more floors = more (smaller) mailboxes
    for (let i = 0; i < N; i++) {
      const u = unitInfo(i);
      const bx = -0.87 + u.c * 0.58, by = 1.82 - u.f * rowH;
      block(mb, u.door, bx, by, 0.27, 0.5, rowH * 0.8, 0.04, 0.03);
      block(mb, 0x2f3542, bx, by + rowH * 0.2, 0.3, 0.26, 0.03, 0.02, 0.01);
    }
    block(mb, 0x9aa3b0, 0, 2.05, 0, 2.6, 0.08, 0.65, 0.03);
    // a cat napping on top of the mailboxes, swishing its tail
    const cat = group(mb, 0.6, 2.09, 0, 0.3);
    ball(cat, 0xffa94d, 0, 0.18, 0, 0.26, { sx: 1.4, sy: 0.75 });
    ball(cat, 0xffa94d, 0.33, 0.3, 0.05, 0.17);
    for (const sz of [-0.08, 0.13]) put(cat, G.cone(), toon(0xffa94d), { x: 0.36, y: 0.46, z: sz + 0.02, s: 0.07, sy: 0.12 });
    ball(cat, 0x3a2a1a, 0.46, 0.32, -0.02, 0.022);
    ball(cat, 0x3a2a1a, 0.46, 0.32, 0.12, 0.022);
    const tail = dynamic(group(cat, -0.33, 0.18, 0));
    cylinder(tail, 0xff9a33, -0.2, 0, 0, 0.045, 0.45, { rz: PI / 2 - 0.3 });
    anim.push((t) => { tail.rotation.y = Math.sin(t * 2.2) * 0.5; });

    // vending machine
    const VM = { x: 16.6, z: -6.5 };
    const vm = group(root, VM.x, 0, VM.z, -PI / 2);
    block(vm, 0x4a90e2, 0, 1.4, 0, 1.6, 2.8, 0.9, 0.1);
    const vendTex = canvasTexture(128, 160, (ctx, w, h) => {
      ctx.fillStyle = "#e6f6ff"; ctx.fillRect(0, 0, w, h);
      const cols = ["#ff5a64", "#ffcf5a", "#5cc84a", "#ff8ad8", "#b58cff"];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        ctx.fillStyle = cols[(r * 2 + c) % 5]; roundRect(ctx, 10 + c * 28, 10 + r * 36, 18, 28, 5); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(13 + c * 28, 16 + r * 36, 12, 4);
      }
    });
    plane(vm, 1.1, 1.6, basic(vendTex), { x: -0.15, y: 1.85, z: 0.46 });
    block(vm, 0x2f3542, -0.15, 0.55, 0.45, 1.1, 0.3, 0.06, 0.03);
    block(vm, 0xdfe4ea, 0.6, 1.5, 0.46, 0.22, 0.5, 0.04, 0.02);
    ball(vm, glow(0x5cff8a, 0.9), 0.6, 1.9, 0.48, 0.05);

    // washing line with sheets and shirts flapping in the breeze
    const LL = { x1: 7.2, x2: 12.6, z: -7.4 };
    for (const x of [LL.x1, LL.x2]) {
      cylinder(root, 0xd9894a, x, 1.3, LL.z, 0.07, 2.6);
      cylinder(root, 0xd9894a, x, 2.55, LL.z, 0.05, 0.9, { rx: PI / 2 });
    }
    for (const dz of [-0.3, 0.3]) cylinder(root, 0xffffff, (LL.x1 + LL.x2) / 2, 2.5, LL.z + dz, 0.012, LL.x2 - LL.x1, { rz: PI / 2, shadow: false });
    const washing = [];
    const clothes = [[7.9, 0.3, 0x8fd3ff, "sheet"], [9.0, 0.3, 0xff9ec7, "shirt"], [9.9, 0.3, 0xffffff, "sheet"], [11.1, 0.3, 0xffd166, "shirt"], [8.6, -0.3, 0x5cc84a, "shirt"], [10.6, -0.3, 0xb58cff, "sheet"], [11.9, -0.3, 0xff7a59, "shirt"]];
    for (const [x, dz, color, kind] of clothes) {
      const g = dynamic(group(root, x, 2.5, LL.z + dz));
      const m = toon(color, { side: THREE.DoubleSide });
      if (kind === "sheet") block(g, m, 0, -0.6, 0, 0.95, 1.2, 0.03, 0.02);
      else {
        block(g, m, 0, -0.4, 0, 0.6, 0.75, 0.04, 0.03);
        for (const sx of [-1, 1]) block(g, m, sx * 0.4, -0.18, 0, 0.3, 0.25, 0.04, 0.03, { rz: sx * 0.5 });
      }
      block(g, 0xd9894a, -0.25, 0.0, 0, 0.05, 0.12, 0.06, 0.01);
      block(g, 0xd9894a, 0.25, 0.0, 0, 0.05, 0.12, 0.06, 0.01);
      washing.push(g);
    }
    anim.push((t) => washing.forEach((g, i) => { g.rotation.x = Math.sin(t * 1.7 + i * 0.9) * 0.16 + 0.08; }));

    // round flower bed with a little cherry tree
    const FB = { x: 0, z: -5.0, r: 1.6 };
    cylinder(root, 0xd98a6a, FB.x, 0.22, FB.z, FB.r, 0.44, { seg: 32 });
    disc(root, toon(0x8a5a3a), FB.x, 0.45, FB.z, FB.r - 0.12);
    const fl = seeded(7), heads = [], stems = [];
    for (let i = 0; i < 40; i++) {
      const a = fl() * TAU, d = 0.5 + fl() * (FB.r - 0.7);
      const x = FB.x + Math.cos(a) * d, z = FB.z + Math.sin(a) * d;
      stems.push({ x, y: 0.62, z, sx: 0.03, sy: 0.35, sz: 0.03 });
      heads.push({ x, y: 0.82, z, s: 0.13, sy: 0.09, color: [0xff6fa5, 0xffe25a, 0xffffff, 0xb58cff, 0xff8a4c][i % 5] });
    }
    scatter(root, G.cyl(6), toon(0x4f9e35), stems);
    scatter(root, G.sphere(), toon(0xffffff), heads);
    roundTree(group(root, FB.x, 0.45, FB.z), 0, 0, 0.5, [0xff9ec7, 0xffc3dc]);

    // a bench under a tree
    const BN = { x: -5.6, z: 0.6, ry: 0 };
    parkBench(root, BN.x, BN.z, BN.ry);
    bush(root, BN.x, BN.z - 1.25, 0.8, 0x5cc84a, 0xffe25a);

    // sandbox with a sandcastle, bucket and spade
    const SB = { x: -11.0, z: 5.6, w: 3.8, d: 3.2 };
    for (const [x, z, w, d] of [[0, -SB.d / 2, SB.w, 0.25], [0, SB.d / 2, SB.w, 0.25], [-SB.w / 2, 0, 0.25, SB.d], [SB.w / 2, 0, 0.25, SB.d]]) block(root, 0xd9894a, SB.x + x, 0.2, SB.z + z, w, 0.4, d, 0.06);
    block(root, 0xf6dd9a, SB.x, 0.2, SB.z, SB.w - 0.2, 0.3, SB.d - 0.2, 0.05, { shadow: false });
    const castle = group(root, SB.x + 0.3, 0.35, SB.z - 0.2);
    block(castle, 0xe9c77a, 0, 0.25, 0, 1.0, 0.5, 0.8, 0.05);
    for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) {
      cylinder(castle, 0xe9c77a, x, 0.4, z, 0.18, 0.8);
      put(castle, G.cone(), toon(0xe0b868), { x, y: 0.95, z, s: 0.22, sy: 0.3 });
    }
    block(castle, 0xc9a35a, 0, 0.18, 0.41, 0.25, 0.35, 0.04, 0.05);
    put(castle, G.taper(0.2, 0.15), toon(0xff5a64), { x: 1.25, y: 0.2, z: 0.6, sy: 0.35 });
    put(castle, G.torus(0.19, 0.015), toon(0xffcf5a), { x: 1.25, y: 0.4, z: 0.6, rx: PI / 2 - 0.4 });
    block(castle, 0x4a90e2, -1.1, 0.03, 0.7, 0.12, 0.05, 0.6, 0.02, { ry: 0.6 });
    block(castle, 0x4a90e2, -1.25, 0.03, 0.95, 0.25, 0.05, 0.3, 0.03, { ry: 0.6 });

    // a little slide
    const SL = { x: -15.4, z: 1.8 };
    const slide = group(root, SL.x, 0, SL.z);
    for (const sx of [-0.45, 0.45]) {
      block(slide, 0x4a90e2, sx, 1.0, -1.3, 0.1, 2.0, 0.1, 0.04);
      block(slide, 0x4a90e2, sx, 0.8, -0.5, 0.1, 1.6, 0.1, 0.04);
      block(slide, 0xffcf5a, sx * 0.95, 0.58, 0.95, 0.08, 0.2, 3.2, 0.03, { rx: 0.5 });
    }
    for (let k = 0; k < 4; k++) block(slide, 0xffffff, 0, 0.35 + k * 0.42, -1.3, 0.9, 0.06, 0.12, 0.02);
    block(slide, 0xff7a59, 0, 1.62, -0.9, 1.0, 0.12, 0.9, 0.04);
    block(slide, 0xffcf5a, 0, 0.82, 0.85, 0.82, 0.08, 3.1, 0.04, { rx: 0.5 });
    block(slide, 0xffcf5a, 0, 0.1, 2.5, 0.82, 0.08, 0.5, 0.04);

    // BBQ grill with sizzling sausages and smoke
    const BQ = { x: 9.6, z: 1.4 };
    const bbq = group(root, BQ.x, 0, BQ.z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      cylinder(bbq, 0x3a3f4a, Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3, 0.04, 0.95, { rx: Math.sin(a) * 0.25, rz: -Math.cos(a) * 0.25 });
    }
    put(bbq, new THREE.SphereGeometry(0.55, 24, 12, 0, TAU, PI / 2, PI / 2), toon(0x2f3542), { y: 1.05 });
    cylinder(bbq, 0x8f96a3, 0, 1.05, 0, 0.55, 0.02);
    put(bbq, new THREE.SphereGeometry(0.55, 24, 12, 0, TAU, 0, PI / 2), toon(0x2f3542), { x: 0, y: 1.05, z: -0.55, rx: -1.3 });
    for (let k = 0; k < 3; k++) put(bbq, G.capsule(), toon(0xc0593a), { x: -0.25 + k * 0.25, y: 1.1, z: 0.05, sx: 0.09, sy: 0.25, sz: 0.09, rx: PI / 2 });
    put(bbq, G.capsule(), toon(0x8ad43a), { x: 0.15, y: 1.1, z: 0.3, sx: 0.08, sy: 0.12, sz: 0.08, rz: PI / 2 });
    const smoke = [];
    const smokeMat = [];
    for (let i = 0; i < 5; i++) {
      const m = toon(0xf2f2f2, { transparent: true, opacity: 0.5 });
      smokeMat.push(m);
      smoke.push(dynamic(ball(root, m, BQ.x, 1.3, BQ.z, 0.2, { shadow: false })));
    }
    anim.push((t) => smoke.forEach((s, i) => {
      const k = (t * 0.4 + i / smoke.length) % 1;
      s.position.set(BQ.x + Math.sin(t + i * 2) * 0.15 + k * 0.4, 1.3 + k * 2.2, BQ.z + 0.05);
      s.scale.setScalar(0.15 + k * 0.35);
      smokeMat[i].opacity = 0.5 * (1 - k);
    }));

    // picnic table
    const PT = { x: 13.2, z: 2.2 };
    const pt = group(root, PT.x, 0, PT.z);
    const ptWood = toon(0xc98b4a);
    block(pt, ptWood, 0, 0.8, 0, 2.4, 0.1, 0.95, 0.04);
    for (const sz of [-0.8, 0.8]) block(pt, ptWood, 0, 0.48, sz, 2.4, 0.08, 0.38, 0.03);
    for (const sx of [-0.95, 0.95]) {
      block(pt, ptWood, sx, 0.4, 0, 0.1, 0.8, 0.1, 0.02);
      block(pt, ptWood, sx, 0.4, 0, 0.1, 0.08, 1.9, 0.02);
    }
    ball(pt, 0xff5a64, -0.4, 0.92, 0.1, 0.11);
    block(pt, 0xf5d48e, 0.3, 0.9, -0.1, 0.4, 0.1, 0.3, 0.04);
    cylinder(pt, 0xffffff, 0.75, 0.97, 0.15, 0.08, 0.25);

    // bike rack with three bikes
    const BR = { x: 16.3, z: 6.6 };
    for (let i = 0; i < 3; i++) {
      const bz = BR.z - 1.1 + i * 1.1;
      put(root, G.torus(0.35, 0.04), toon(0x8f96a3), { x: BR.x + 0.25, y: 0.35, z: bz - 0.2, ry: PI / 2 });
      const bk = group(root, BR.x, 0, bz, -PI / 2 + (i - 1) * 0.06);
      const col = [0xff5a64, 0x4a90e2, 0x5cc84a][i];
      for (const sx of [-0.55, 0.55]) put(bk, G.torus(0.32, 0.045), toon(0x2f3542), { x: sx, y: 0.36 });
      cylinder(bk, col, 0, 0.6, 0, 0.04, 1.0, { rz: PI / 2 });
      cylinder(bk, col, -0.2, 0.5, 0, 0.035, 0.55, { rz: 0.9 });
      cylinder(bk, col, 0.4, 0.55, 0, 0.035, 0.5, { rz: -0.4 });
      block(bk, 0x2f3542, -0.25, 0.85, 0, 0.32, 0.07, 0.14, 0.03);
      cylinder(bk, 0x2f3542, 0.5, 0.88, 0, 0.025, 0.55, { rx: PI / 2 });
      if (i === 1) block(bk, 0xc98b4a, 0.62, 0.72, 0, 0.3, 0.22, 0.3, 0.04); // a basket on the front
    }

    // koi pond with a stone lantern
    const KP = { x: 4.6, z: 5.6, rx: 2.8, rz: 1.7 };
    disc(root, toon(0x5aa646), KP.x, 0.02, KP.z, 1, { sx: KP.rx + 0.35, sy: KP.rz + 0.35 });
    const pondWater = disc(root, toon(0x4fb8e8), KP.x, 0.05, KP.z, 1, { sx: KP.rx, sy: KP.rz });
    pondWater.receiveShadow = true;
    const rim = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      rim.push({ x: KP.x + Math.cos(a) * (KP.rx + 0.2), y: 0.1, z: KP.z + Math.sin(a) * (KP.rz + 0.2), s: 0.3 + ((i * 7) % 5) * 0.04, sy: 0.2, ry: i, color: i % 2 ? 0xc9c4b8 : 0xb3ada0 });
    }
    scatter(root, G.lowSphere(), toon(0xffffff), rim, true);
    for (const [lx, lz, f] of [[3.0, 5.2, true], [6.1, 6.2, false], [5.5, 4.6, true]]) {
      disc(root, toon(0x4fae3f), lx, 0.08, lz, 0.32);
      if (f) ball(root, 0xff9ec7, lx, 0.14, lz, 0.12, { sy: 0.6 });
    }
    const lantern = group(root, KP.x + KP.rx + 1.0, 0, KP.z - 1.2);
    block(lantern, 0xbdb6a8, 0, 0.3, 0, 0.5, 0.6, 0.5, 0.06);
    cylinder(lantern, 0xbdb6a8, 0, 0.8, 0, 0.12, 0.5);
    block(lantern, 0xbdb6a8, 0, 1.2, 0, 0.55, 0.4, 0.55, 0.06);
    ball(lantern, glow(0xffe8a0, 0.6), 0, 1.2, 0.2, 0.12);
    put(lantern, G.cone(4), toon(0xa8a092), { y: 1.6, s: 0.55, sy: 0.4, ry: PI / 4 });
    const koi = [];
    for (let i = 0; i < 4; i++) {
      const c = [0xff7a2a, 0xffffff, 0xffb02e, 0xff5a3a][i];
      const f = movingThing(root, (f) => {
        ball(f, c, 0, 0, 0, 0.22, { sx: 1.0, sy: 0.25, sz: 0.45 });
        if (i !== 2) ball(f, i === 1 ? 0xff5a3a : 0xffffff, 0.05, 0.03, 0, 0.1, { sy: 0.3 });
        put(f, G.cone(4), toon(c), { x: -0.27, s: 0.12, sy: 0.18, rz: PI / 2, sz: 0.05 });
      });
      koi.push(f);
    }
    anim.push((t) => koi.forEach((f, i) => {
      const a = t * (0.35 + i * 0.07) * (i % 2 ? -1 : 1) + i * 1.6;
      const rx = (KP.rx - 0.7) * (0.6 + 0.3 * Math.sin(i + t * 0.2)), rz = (KP.rz - 0.5) * (0.6 + 0.3 * Math.cos(i * 2 + t * 0.17));
      f.position.set(KP.x + Math.cos(a) * rx, 0.07, KP.z + Math.sin(a) * rz);
      const dir = i % 2 ? -1 : 1;
      const vx = -Math.sin(a) * rx * dir, vz = Math.cos(a) * rz * dir;
      f.rotation.y = -Math.atan2(vz, vx) + Math.sin(t * 6 + i) * 0.15;
    }));

    // trees, bushes and lamps around the courtyard
    const trees = [[-16.0, -2.4, 1.0, [0x5cc84a, 0x7fdc5c], null], [15.9, -2.6, 1.0, [0x4fbf47, 0x79d65a], 0xff4b3a],
      [-16.0, 9.3, 0.9, [0x5cc84a, 0x8ae065], null], [16.3, 9.6, 0.85, [0xff9ec7, 0xffc3dc], null],
    ];
    // low flowering bushes along the front (so they don't hide the courtyard)
    const bushes = [[-7.2, 9.4, 0xff6fa5], [-4.2, 9.5, 0xffe25a], [7.6, 9.4, 0xffffff], [11.0, 9.5, 0xff6fa5]];
    bushes.forEach(([x, z, f]) => bush(root, x, z, 0.85, 0x4fbf47, f));
    trees.forEach(([x, z, s, c, fruit]) => roundTree(root, x, z, s, c, fruit));
    const lampsAt = [[-5.0, -4.6], [5.0, -4.6], [-12.4, -1.2], [12.0, -1.2]];
    lampsAt.forEach(([x, z]) => lampPost(root, x, z));

    // hedge all around with a gate at the front
    const hedgeMat = toon(0x4fae3f);
    const hedge = (x, z, w, d) => {
      block(root, hedgeMat, x, 0.5, z, w, 1.0, d, 0.35);
      for (let k = 0; k < Math.max(w, d) / 1.2; k++) {
        const t = (k + 0.5) / (Math.max(w, d) / 1.2);
        put(root, G.lowSphere(), toon(0x5cbe48), { x: w > d ? x - w / 2 + t * w : x, y: 1.0, z: w > d ? z : z - d / 2 + t * d, s: 0.42, sy: 0.6 });
      }
    };
    hedge(-9.9, 10.9, 16.2, 0.8); hedge(9.9, 10.9, 16.2, 0.8);
    hedge(-18.2, -0.3, 0.8, 22.4); hedge(18.2, -0.3, 0.8, 22.4);
    // the gate: two brick pillars with lamps on top where the hedge opens up
    for (const sx of [-1.75, 1.75]) {
      block(root, 0xd98a6a, sx, 0.65, 10.9, 0.7, 1.3, 0.7, 0.08);
      block(root, 0xf0c9a4, sx, 1.36, 10.9, 0.84, 0.14, 0.84, 0.05);
      cylinder(root, 0x2f4f46, sx, 1.55, 10.9, 0.06, 0.3);
      ball(root, glow(0xfff1b8, 0.9), sx, 1.85, 10.9, 0.22);
      put(root, G.cone(), toon(0x2f4f46), { x: sx, y: 2.1, z: 10.9, s: 0.26, sy: 0.18 });
    }

    // ---------- outside the courtyard: the street, houses, hills ----------
    // pavement, road with a zebra crossing, and the far pavement
    block(root, 0xd8d4cc, 0, 0.06, 12.4, 300, 0.12, 1.8, 0.02, { shadow: false });
    block(root, 0x6b6f78, 0, 0.02, 16.0, 300, 0.04, 5.4, 0.01, { shadow: false });
    block(root, 0xd8d4cc, 0, 0.06, 19.6, 300, 0.12, 1.8, 0.02, { shadow: false });
    const dashes = [];
    for (let x = -150; x < 150; x += 3) if (Math.abs(x) > 3) dashes.push({ x, y: 0.05, z: 16, sx: 1.6, sy: 0.02, sz: 0.14 });
    for (let k = 0; k < 7; k++) dashes.push({ x: -2.4 + k * 0.8, y: 0.05, z: 16, sx: 0.45, sy: 0.02, sz: 5.0 });
    scatter(root, G.box(), toon(0xfdfdf5), dashes);
    for (let x = -36; x <= 36; x += 12) lampPost(root, x, 19.1);

    // houses across the street and to the sides
    const houseCols = [[0xfff1dc, 0xe2574c], [0xdff3ff, 0x4a90e2], [0xffe0ec, 0xb58cff], [0xeaffd9, 0xff8a4c], [0xfff6c2, 0x3fb39a]];
    let hc = 0;
    for (let x = -44; x <= 44; x += 11) {
      const [wall, roof] = houseCols[hc++ % houseCols.length];
      house(root, x, 25.5, PI, { w: 5, d: 4.2, h: 2.8, rh: 2.0, wall, roof, door: [0x9a6a3c, 0x4a90e2, 0xff7a8a][hc % 3] });
      farTree(root, x + 5.5, 22.5, 0.8, hc % 2 ? [0x5cc84a, 0x7fdc5c] : [0x4fbf47, 0x8ae065]);
      bush(root, x - 2.5, 22.6, 0.8, 0x4fbf47, [0xff6fa5, 0xffe25a, null][hc % 3]);
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const [wall, roof] = houseCols[(k + (side > 0 ? 2 : 0)) % houseCols.length];
        house(root, side * (25 + (k % 2) * 3), -6 + k * 8, -side * PI / 2, { w: 4.6, d: 4.0, h: 2.6, rh: 1.8, wall, roof });
        farTree(root, side * 21.5, -9 + k * 8, 0.9 + (k % 2) * 0.15, k % 2 ? [0x5cc84a, 0x7fdc5c] : [0x4fbf47, 0x79d65a]);
      }
      farTree(root, side * 33, 14, 1.1);
    }
    // behind the building: a garden, trees and taller blocks in town
    for (let x = -30; x <= 30; x += 6) farTree(root, x + ((x / 6) % 2) * 1.5, -21.5 - Math.abs(x % 4), 1.0 + (Math.abs(x) % 3) * 0.1, Math.abs(x) % 12 ? [0x5cc84a, 0x7fdc5c] : [0xff9ec7, 0xffc3dc]);
    const blockTex = canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      for (let y = 12; y < h - 10; y += 30) for (let x = 12; x < w - 10; x += 28) {
        ctx.fillStyle = (x * 7 + y * 3) % 5 === 0 ? "#ffe9a8" : "#a9d4f2"; ctx.fillRect(x, y, 16, 18);
      }
    });
    const blockMat = toon(0xffffff, { map: blockTex });
    const tall = [[-40, -38, 8, 18, 0xffd8c2], [-26, -42, 7, 24, 0xd9ecff], [-12, -46, 9, 20, 0xffeab8], [6, -44, 8, 28, 0xe6dcff], [22, -40, 9, 19, 0xd6f5e3], [38, -36, 7, 22, 0xffd6e6], [52, -20, 8, 16, 0xd9ecff], [-54, -18, 8, 17, 0xffeab8]];
    for (const [x, z, w, h, c] of tall) {
      const m = blockMat.clone(); m.color.set(c);
      put(root, G.box(), m, { x, y: h / 2, z, sx: w, sy: h, sz: w * 0.8 });
      block(root, 0xffffff, x, h + 0.2, z, w + 0.4, 0.4, w * 0.8 + 0.4, 0.1);
    }
    // soft hills all the way round
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.2;
      const r = 95 + (i % 3) * 12;
      const s = 28 + ((i * 7) % 5) * 6;
      put(root, G.lowSphere(), toon(i % 2 ? 0x7fcf5a : 0x6cc24a), { x: Math.cos(a) * r, y: -s * 0.45, z: Math.sin(a) * r, sx: s, sy: s * 0.75, sz: s * 0.7, shadow: false, receive: false });
    }

    // cars driving up and down the street (they face along +x)
    const cars = [];
    const carCols = [0xff5a64, 0x4a90e2, 0xffcf3a];
    for (let i = 0; i < 3; i++) {
      const c = movingThing(root, (c) => {
        block(c, carCols[i], 0, 0.6, 0, 3.0, 0.7, 1.5, 0.3);
        block(c, 0xffffff, -0.2, 1.15, 0, 1.6, 0.6, 1.3, 0.25);
        block(c, 0xa9dcff, -0.2, 1.17, 0, 1.4, 0.4, 1.34, 0.12);
        block(c, 0xa9dcff, 0.25, 1.17, 0, 0.6, 0.4, 1.34, 0.12);
        for (const [x, z] of [[-0.9, 0.7], [0.9, 0.7], [-0.9, -0.7], [0.9, -0.7]]) {
          cylinder(c, 0x2f3542, x, 0.33, z, 0.33, 0.25, { rx: PI / 2 });
          cylinder(c, 0xdfe4ea, x, 0.33, z * 1.1, 0.14, 0.1, { rx: PI / 2 });
        }
        ball(c, glow(0xfff4c2, 0.8), 1.5, 0.65, 0.45, 0.11);
        ball(c, glow(0xfff4c2, 0.8), 1.5, 0.65, -0.45, 0.11);
        ball(c, glow(0xff3b3b, 0.6), -1.5, 0.65, 0.5, 0.08);
        ball(c, glow(0xff3b3b, 0.6), -1.5, 0.65, -0.5, 0.08);
      });
      cars.push({ c, dir: i === 1 ? -1 : 1, speed: 5 + i * 1.3, off: i * 47 });
    }
    anim.push((t) => cars.forEach((q) => {
      // drive along the road, then pause off-screen before coming round again
      const L = 220;
      const k = ((t * q.speed + q.off) % L) - L / 2;
      q.c.position.set(k * q.dir, Math.abs(Math.sin(t * 9 + q.off)) * 0.03, q.dir > 0 ? 17.4 : 14.6);
      q.c.rotation.y = q.dir > 0 ? 0 : PI;
    }));

    // clouds drifting across the sky
    const cloudMat = toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 });
    const clouds = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      clouds.push({ c: cloud(root, cloudMat, 0, 20 + (i % 3) * 4, 0, 1 + (i % 2) * 0.3), a, r: 55 + (i % 3) * 15 });
    }
    anim.push((t) => clouds.forEach((q) => {
      const a = q.a + t * 0.006;
      q.c.position.x = Math.cos(a) * q.r;
      q.c.position.z = Math.sin(a) * q.r;
    }));

    mergeStatic(root);

    // ---------- residents ----------
    let residents = [];
    function setResidents(list) {
      residents = Array.isArray(list) ? list.slice(0, units.length) : [];
      units.forEach((u, i) => {
        const r = residents[i] || null;
        const key = r ? r.id + "|" + r.name + "|" + (r.home ? 1 : 0) : "";
        if (key === u.key) return;
        u.key = key;
        u.resident = r;
        drawPlate(u, r);
        u.open = r && r.home ? 1 : 0;
        u.lit = r && r.home ? 1 : 0;
        u.rent.visible = !r;
        u.curtains.forEach((c) => { c.visible = !!r; });
        lamps.setColorAt(i, r && r.home ? lampOn : lampOff);
      });
      lamps.instanceColor.needsUpdate = true;
    }
    setResidents([]);

    const indexOf = (id) => residents.findIndex((r) => r && r.id === id);

    // The courtyard spot in front of someone's door. Upper floors are reached by
    // the lift (left) or the stairs (right), so they head for that door.
    function doorFor(id) {
      const i = indexOf(id);
      if (i < 0) return null;
      const u = units[i];
      if (u.f === 0) return { x: u.doorX, z: FZ + 1.3 };
      const side = u.c < 2 ? -1 : 1;
      const k = ((u.f - 1) * 2 + (u.c % 2)) % 4; // 0..3, so they don't all stand on one spot
      return { x: side * TX + (k - 1.5) * 0.55, z: FZ + 1.4 };
    }

    // Which apartment (door / window / name plate) does this ray point at?
    const box = new THREE.Box3(), hit = new THREE.Vector3();
    function pickApartment(ray) {
      let best = null, bestD = Infinity;
      units.forEach((u, i) => {
        const r = residents[i];
        if (!r) return;
        box.min.set(u.cx - APT.unitW / 2 + 0.1, u.y, FZ - 0.3);
        box.max.set(u.cx + APT.unitW / 2 - 0.1, u.y + H, FZ + 1.5);
        if (ray.intersectBox(box, hit)) {
          const d = hit.distanceTo(ray.origin);
          if (d < bestD) { bestD = d; best = r.id; }
        }
      });
      return best;
    }

    function updateWindows(dt) {
      for (const u of units) {
        u.openNow += (u.open - u.openNow) * Math.min(1, dt * 3);
        u.litNow += (u.lit - u.litNow) * Math.min(1, dt * 3);
        const open = u.openNow;
        const cw = 1.36 + (0.36 - 1.36) * open; // each curtain's width
        u.curtains[0].scale.x = cw; u.curtains[0].position.x = u.winX - 1.35 + cw / 2;
        u.curtains[1].scale.x = cw; u.curtains[1].position.x = u.winX + 1.35 - cw / 2;
        const rent = !u.resident;
        u.glass.emissiveIntensity = 0.95 * u.litNow;
        u.glass.color.setRGB(0.18 + 0.82 * u.litNow, 0.22 + 0.78 * u.litNow, 0.38 + 0.62 * u.litNow);
        if (rent) u.glass.color.setRGB(0.6, 0.66, 0.76);
      }
    }

    let lastT = null;
    const benchFx = Math.sin(BN.ry), benchFz = Math.cos(BN.ry);

    return {
      group: root,
      background: 0xcdeeff,
      fog: [0xd8f2ff, 70, 190],
      cameraTilt: 0.42,
      cameraTargetY: 3.4 + (FL - 3) * 0.5,
      capacity: N, // how many apartments there are
      bounds: { minX: -17, maxX: 17, minZ: -11, maxZ: 10 },
      water: [{ x: KP.x, z: KP.z, rx: KP.rx, rz: KP.rz }],
      obstacles: [
        { x: 0, z: (FZ + APT.back) / 2 + 0.1, w: 2 * TX + 3.8, d: FZ - APT.back + 0.4 }, // the building
        ...pillarXs.map((x) => ({ x, z: FZ + 1.3, r: 0.2 })),
        { x: MB.x, z: MB.z, w: 0.75, d: 2.7 },                       // mailboxes
        { x: VM.x, z: VM.z, w: 1.0, d: 1.7 },                        // vending machine
        { x: (LL.x1 + LL.x2) / 2, z: LL.z, w: LL.x2 - LL.x1 + 0.3, d: 1.1 }, // washing line
        { x: FB.x, z: FB.z, r: FB.r + 0.1 },                         // flower bed
        { x: BN.x, z: BN.z - 0.05, w: 2.5, d: 1.0 },                 // bench
        { x: SB.x, z: SB.z, w: SB.w, d: SB.d },                      // sandbox
        { x: SL.x, z: SL.z + 0.55, w: 1.2, d: 4.2 },                 // slide
        { x: BQ.x, z: BQ.z, r: 0.65 },                               // BBQ
        { x: PT.x, z: PT.z, w: 2.5, d: 2.1 },                        // picnic table
        { x: BR.x + 0.1, z: BR.z, w: 1.5, d: 3.4 },                  // bikes
        { x: KP.x, z: KP.z, rx: KP.rx + 0.3, rz: KP.rz + 0.3 },      // koi pond
        { x: KP.x + KP.rx + 1.0, z: KP.z - 1.2, r: 0.4 },            // stone lantern
        { x: 1.75, z: 10.9, r: 0.45 }, { x: -1.75, z: 10.9, r: 0.45 }, // gate pillars
      ].concat(trees.map(([x, z, s]) => ({ x, z, r: 0.55 * s })))
        .concat(lampsAt.map(([x, z]) => ({ x, z, r: 0.25 })))
        .concat(bushes.map(([x, z]) => ({ x, z, r: 0.9 })))
        .concat([{ x: BN.x, z: BN.z - 1.25, r: 0.9 }]),
      spots: [
        { x: MB.x + 1.4, z: MB.z, yaw: -PI / 2, emoji: "📬", activity: "checking the mail",
          lines: ["Any letters for me?", "Ooh, a postcard!", "Just bills again...", "Hi, kitty!"] },
        { x: BN.x + benchFx * 1.2, z: BN.z + benchFz * 1.2, yaw: BN.ry, emoji: "🪑", activity: "sitting on the bench",
          seat: { x: BN.x + benchFx * 0.08, z: BN.z + benchFz * 0.08, y: 0 },
          lines: ["Nice and shady here.", "I love this courtyard.", "*people watching*"] },
        { x: SB.x, z: SB.z + SB.d / 2 + 0.9, yaw: PI, emoji: "🏰", activity: "building a sandcastle",
          lines: ["My castle needs a moat!", "Sand everywhere!", "King of the sandbox!"] },
        { x: SL.x, z: SL.z + 3.25, yaw: 0, arms: "cheer", emoji: "🛝", activity: "playing on the slide",
          lines: ["Wheee!", "One more time!", "I'm too big for this... again!"] },
        { x: BQ.x, z: BQ.z - 1.35, yaw: 0, arms: "out", emoji: "🍖", activity: "grilling at the BBQ",
          lines: ["Who wants a sausage?", "*sizzle sizzle*", "Smells amazing!", "Medium or well done?"] },
        { x: PT.x, z: PT.z - 1.95, yaw: 0, arms: "eat", emoji: "🍙", activity: "having a snack",
          seat: { x: PT.x, z: PT.z - 0.8, y: -0.06 },
          lines: ["Snack time!", "Mmm, rice ball!", "Lunch in the sun!"] },
        { x: (LL.x1 + LL.x2) / 2, z: LL.z + 1.15, yaw: PI, arms: "up", emoji: "👕", activity: "hanging up the laundry",
          lines: ["Perfect drying weather!", "Whose socks are these?", "Fresh and clean!"] },
        { x: VM.x - 1.4, z: VM.z, yaw: PI / 2, emoji: "🥤", activity: "at the vending machine",
          lines: ["Melon soda, please!", "It ate my coin!", "So many choices!"] },
        { x: FB.x, z: FB.z + FB.r + 0.75, yaw: PI, emoji: "🌷", activity: "smelling the flowers",
          lines: ["Mmm, lovely!", "Achoo!", "Who planted these? So pretty!"] },
        { x: BR.x - 1.55, z: BR.z, yaw: PI / 2, emoji: "🚲", activity: "checking their bike",
          lines: ["Time for a ride?", "Flat tyre again...", "Ding ding!"] },
        { x: KP.x, z: KP.z + KP.rz + 0.85, yaw: PI, emoji: "🐟", activity: "feeding the koi",
          lines: ["Here, fishy fishy!", "That one's so big!", "Blub blub!"] },
      ],
      lines: [
        "Home sweet home!", "I love living here!", "Hi, neighbour!", "Who's cooking? Smells great!",
        "Did you get your mail?", "Nice weather for laundry!", "The koi look hungry.", "I should water my plants.",
        "Let's have a BBQ!", "My apartment is the best one!",
      ],
      setResidents,
      doorFor,
      pickApartment,
      update(t, camera) {
        const dt = lastT === null ? 0.016 : Math.min(0.1, Math.max(0, t - lastT));
        lastT = t;
        anim.forEach((a) => a(t));
        updateWindows(dt);
      },
    };
  }

  // =====================================================================
  // HOME — the inside of one Mii's apartment
  // =====================================================================

  const ROOM = { x: 6, z: 4.5, h: 5.2 };
  const TILE = 2; // one wallpaper / floor picture covers 2 x 2 units

  // Wallpaper and floor pictures (they repeat across the walls and floor).
  function patternTexture(it, isFloor) {
    const base = it.color || (isFloor ? "#c98a52" : "#f6ead2");
    const acc = it.accent || base;
    const pat = it.pattern || "plain";
    return canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      const r = seeded(17);
      if (pat === "stripes") {
        ctx.fillStyle = acc;
        for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 28, h);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        for (let x = 0; x < w; x += 64) ctx.fillRect(x + 40, 0, 4, h);
      } else if (pat === "hearts") {
        ctx.fillStyle = acc;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) heart(ctx, x * 64 + (y % 2) * 32 + 16, y * 64 + 18, 26);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.beginPath(); ctx.arc(x * 64 + (y % 2 ? 0 : 32) + 16, y * 64 + 48, 3, 0, TAU); ctx.fill(); }
      } else if (pat === "clouds") {
        ctx.fillStyle = acc; ctx.fillRect(0, h * 0.9, w, h * 0.1);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (const [x, y] of [[50, 60], [180, 140], [90, 200], [230, 40]]) {
          for (const [dx, dy, rr] of [[0, 0, 18], [18, -8, 20], [36, 0, 16], [18, 6, 16]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, rr, 0, TAU); ctx.fill(); }
        }
      } else if (pat === "grid") {
        ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.shadowColor = acc; ctx.shadowBlur = 10;
        for (let k = 0; k <= w; k += 64) {
          ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(w, k); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#6ff0ff";
        for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 4) * 64, y = Math.floor(r() * 4) * 64; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); }
      } else if (pat === "damask") {
        ctx.fillStyle = acc;
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
          const cx = x * 128 + 64 + (y % 2) * 64, cy = y * 128 + 64;
          for (const ox of [0, -256, 256]) damask(ctx, cx + ox, cy);
        }
      } else if (pat === "planks") {
        for (let row = 0; row < 4; row++) {
          const off = (row % 2) * 96 + row * 37;
          for (let k = -1; k < 3; k++) {
            const x0 = ((k * 128 + off) % 256 + 256) % 256 - 128;
            ctx.fillStyle = ["#c98a52", "#c28149", "#d0935c", "#bd7c45"][(row + k + 4) % 4];
            if (it.color) ctx.globalAlpha = 0.55;
            ctx.fillRect(x0, row * 64, 128, 64);
            ctx.fillRect(x0 + 256, row * 64, 128, 64);
            ctx.globalAlpha = 1;
            ctx.fillStyle = acc; ctx.fillRect(x0, row * 64, 3, 64); ctx.fillRect(x0 + 256, row * 64, 3, 64);
          }
          ctx.fillStyle = acc; ctx.fillRect(0, row * 64, w, 3);
          ctx.strokeStyle = "rgba(120,70,30,0.25)"; ctx.lineWidth = 2;
          for (let g = 0; g < 3; g++) { const y = row * 64 + 14 + g * 16 + r() * 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(80, y + 6, 160, y - 6, w, y + 2); ctx.stroke(); }
        }
      } else if (pat === "checker") {
        ctx.fillStyle = acc;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * 64, y * 64, 64, 64);
      } else if (pat === "marble") {
        ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8;
        for (let i = 0; i < 7; i++) {
          const y = r() * h;
          ctx.beginPath(); ctx.moveTo(-10, y);
          ctx.bezierCurveTo(70, y + (r() - 0.5) * 120, 170, y + (r() - 0.5) * 120, w + 10, y + (r() - 0.5) * 60);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(150,150,170,0.6)"; ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 128, 128); ctx.strokeRect(128, 0, 128, 128); ctx.strokeRect(0, 128, 128, 128); ctx.strokeRect(128, 128, 128, 128);
      } else {
        // plain: a soft speckle (carpet, or grass blades for fake grass)
        const grass = /grass/.test(it.id || "");
        for (let i = 0; i < (grass ? 260 : 400); i++) {
          const x = r() * w, y = r() * h;
          ctx.fillStyle = r() < 0.5 ? acc : "rgba(255,255,255,0.18)";
          if (grass) { ctx.fillRect(x, y, 2, 7); } else { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
        }
        if (!isFloor) {
          ctx.fillStyle = acc;
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.beginPath(); ctx.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 4, 0, TAU); ctx.fill(); }
        }
      }
    }, [1, 1]);
  }

  function damask(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 30, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 22, -10, 8, 18, s * 0.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 18, 22, 6, 12, -s * 0.5, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(8, -34); ctx.lineTo(-8, -34); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 42, 6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // A rectangle of wall/floor whose picture lines up with its neighbours:
  // (u0, v0) = where its bottom-left corner is on the wall, in units.
  function patchGeo(w, h, u0, v0) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / TILE, (v0 + uv.getY(i) * h) / TILE);
    return g;
  }

  // Which item is in each slot (falling back to the starter item).
  function resolveItems(record) {
    const H = root.MiiHomes;
    const chosen = (record && record.home && record.home.items) || {};
    const out = {};
    const start = H ? H.starterHome().items : {};
    for (const slot of Object.keys(start)) {
      const id = chosen[slot];
      const it = id && H.item(id);
      out[slot] = it && it.slot === slot ? it : H.item(start[slot]);
    }
    return out;
  }

  // ---------- where each slot goes in the room ----------
  // Every slot has an anchor point and a turn (ry). Furniture is modelled facing
  // +z around its anchor, then turned into place.
  const SLOT_PLACES = {
    bed: { x: -4.25, z: -2.95, ry: 0 },              // back-left corner, head against the back wall
    sofa: { x: -4.8, z: 1.4, ry: PI / 2 - 0.3 },     // against the left wall, turned a little toward you
    table: { x: 0.3, z: 1.0, ry: 0 },                // middle of the room
    tv: { x: 5.4, z: -0.4, ry: -PI / 2 },            // against the right wall, facing into the room
    rug: { x: 0.3, z: 1.0, ry: 0 },                  // under the table
    lamp: { x: -2.4, z: -4.0, ry: 0 },               // on the bedside table (floor lamp: by the left wall)
    plant: { x: -5.1, z: 3.7, ry: 0.4 },             // front-left corner
    art: { x: 2.4, z: -4.5, ry: 0 },                 // on the back wall
    special: { x: 4.5, z: -3.4, ry: 0 },             // back-right corner
  };
  const WINDOW = { x: -0.4, w: 2.4, y0: 1.5, y1: 3.6 };
  const DOOR = { z: 3.0, w: 1.3, h: 2.5 };

  function toWorld(place, lx, lz) {
    const c = Math.cos(place.ry), s = Math.sin(place.ry);
    return { x: place.x + lx * c + lz * s, z: place.z - lx * s + lz * c };
  }

  // ---------- furniture models ----------
  // Each one: build(g, ctx) draws it around (0, 0) facing +z.
  //   obs   obstacles in the item's own coordinates (rect: cx, cz, w, d / circle: cx, cz, r)
  //   spot  where a Mii stands to use it (lx, lz) and which way it looks (yaw)
  //   seat / lie / stand  where the Mii goes when it sits / lies / runs (h = height of the surface)
  const FURNITURE = {
    // ===== beds (head at -z against the wall, foot toward +z) =====
    "bed-basic": {
      obs: [{ cx: 0, cz: 0, w: 2.2, d: 3.0 }], spot: { lx: 2.05, lz: 0.5, yaw: -PI / 2 }, lie: { lx: 0, lz: 0.1, h: 0.82, yaw: PI },
      build(g) {
        const wood = toon(0xc98b4a);
        block(g, wood, 0, 0.3, 0, 2.0, 0.36, 2.95, 0.08);
        for (const [x, z] of [[-0.9, -1.35], [0.9, -1.35], [-0.9, 1.35], [0.9, 1.35]]) block(g, wood, x, 0.08, z, 0.16, 0.16, 0.16, 0.04);
        block(g, 0xffffff, 0, 0.6, 0.02, 1.86, 0.3, 2.85, 0.12);
        block(g, wood, 0, 0.9, -1.44, 2.1, 1.4, 0.14, 0.1);
        block(g, 0xe2a35e, 0, 1.45, -1.44, 1.5, 0.3, 0.16, 0.1);
        block(g, wood, 0, 0.55, 1.45, 2.1, 0.7, 0.12, 0.08);
        block(g, 0xfff8ee, 0, 0.84, -1.05, 1.2, 0.22, 0.55, 0.11);
        block(g, 0x7fb8f0, 0, 0.78, 0.4, 1.95, 0.08, 2.0, 0.04);
        block(g, 0xffffff, 0, 0.83, -0.55, 1.95, 0.06, 0.22, 0.03);
        for (let k = 0; k < 4; k++) ball(g, 0xffffff, -0.6 + k * 0.4, 0.83, 0.6 + (k % 2) * 0.5, 0.08, { sy: 0.3 });
      },
    },
    "bed-canopy": {
      obs: [{ cx: 0, cz: 0, w: 2.4, d: 3.05 }], spot: { lx: 2.15, lz: 0.5, yaw: -PI / 2 }, lie: { lx: 0, lz: 0.1, h: 0.9, yaw: PI },
      build(g, ctx) {
        const white = toon(0xfff6fa), pink = toon(0xffa8c8), gold = toon(0xffcf3a);
        block(g, white, 0, 0.32, 0, 2.1, 0.4, 2.95, 0.1);
        block(g, 0xfff0f6, 0, 0.66, 0.02, 1.95, 0.34, 2.85, 0.14);
        block(g, 0xff8ab8, 0, 0.85, 0.45, 2.02, 0.08, 1.95, 0.05);
        block(g, white, 0, 1.05, -1.44, 2.15, 1.7, 0.14, 0.3);
        ball(g, 0xff8ab8, 0, 1.4, -1.36, 0.3, { sz: 0.25 });
        for (let k = 0; k < 3; k++) put(g, G.cone(), gold, { x: -0.3 + k * 0.3, y: 2.1 + (k === 1 ? 0.12 : 0), z: -1.44, s: 0.1, sy: 0.3 });
        ball(g, 0xffffff, -0.45, 0.93, -1.05, 0.28, { sy: 0.4, sx: 1.3 });
        ball(g, 0xffd6e6, 0.45, 0.93, -1.05, 0.28, { sy: 0.4, sx: 1.3 });
        for (const [x, z] of [[-1.05, -1.48], [1.05, -1.48], [-1.05, 1.48], [1.05, 1.48]]) {
          cylinder(g, white, x, 1.7, z, 0.07, 3.4);
          ball(g, gold, x, 3.45, z, 0.1);
        }
        block(g, pink, 0, 3.35, 0, 2.3, 0.12, 3.15, 0.05);
        const sc = [];
        for (let k = 0; k <= 10; k++) for (const s of [-1, 1]) sc.push({ x: -1.1 + k * 0.22, y: 3.2, z: s * 1.56, s: 0.13, sy: 0.18 });
        for (let k = 0; k <= 14; k++) for (const s of [-1, 1]) sc.push({ x: s * 1.13, y: 3.2, z: -1.54 + k * 0.22, s: 0.13, sy: 0.18 });
        scatter(g, G.lowSphere(), toon(0xff8ab8), sc);
        // curtains tied back at each post, swaying gently
        const cur = [];
        for (const [x, z] of [[-1.05, -1.3], [1.05, -1.3], [-1.05, 1.3], [1.05, 1.3]]) {
          const c = dynamic(group(g, x, 3.25, z));
          put(c, G.capsule(), toon(0xffc6dc, { transparent: true, opacity: 0.92 }), { y: -1.3, sx: 0.32, sy: 1.55, sz: 0.2, shadow: false });
          put(c, G.torus(0.13, 0.03), gold, { y: -1.5, rx: PI / 2 });
          cur.push(c);
        }
        ctx.anim.push((t) => cur.forEach((c, i) => { c.rotation.z = Math.sin(t * 1.2 + i) * 0.03; }));
      },
    },
    "bed-race": {
      obs: [{ cx: 0, cz: 0.2, w: 2.5, d: 3.45 }], spot: { lx: 2.2, lz: 0.6, yaw: -PI / 2 }, lie: { lx: 0, lz: 0.0, h: 0.86, yaw: PI },
      build(g) {
        const red = toon(0xff3b3b);
        block(g, red, 0, 0.5, 0.2, 2.2, 0.75, 3.4, 0.28);
        block(g, 0xffffff, 0, 0.75, -0.15, 1.7, 0.2, 2.4, 0.08);
        block(g, 0x4a90e2, 0, 0.84, 0.55, 1.72, 0.06, 1.2, 0.03);
        ball(g, 0xffffff, 0, 0.92, -1.0, 0.3, { sx: 1.8, sy: 0.4 });
        block(g, red, 0, 0.88, 1.45, 2.2, 0.22, 0.7, 0.1, { rx: -0.2 }); // the hood
        block(g, 0xffffff, -0.35, 0.93, 1.45, 0.25, 0.04, 0.72, 0.02, { rx: -0.2 });
        block(g, 0xffffff, 0.35, 0.93, 1.45, 0.25, 0.04, 0.72, 0.02, { rx: -0.2 });
        ball(g, glow(0xfff4c2, 0.9), -0.7, 0.6, 1.9, 0.15, { sz: 0.5 });
        ball(g, glow(0xfff4c2, 0.9), 0.7, 0.6, 1.9, 0.15, { sz: 0.5 });
        for (const [x, z] of [[-1.13, -0.95], [1.13, -0.95], [-1.13, 1.3], [1.13, 1.3]]) {
          cylinder(g, 0x2f3542, x, 0.38, z, 0.38, 0.28, { rz: PI / 2 });
          cylinder(g, 0xdfe4ea, x * 1.08, 0.38, z, 0.17, 0.08, { rz: PI / 2 });
        }
        for (const sx of [-0.7, 0.7]) block(g, 0x2f3542, sx, 1.15, -1.35, 0.1, 0.7, 0.1, 0.03);
        block(g, red, 0, 1.5, -1.38, 2.3, 0.12, 0.5, 0.05); // spoiler
        for (const sx of [-1, 1]) {
          disc(g, toon(0xffffff), sx * 1.11, 0.55, 0.25, 0.3, { rx: 0, ry: sx * PI / 2 });
          block(g, 0x2f3542, sx * 1.12, 0.55, 0.25, 0.02, 0.32, 0.08, 0.01);
        }
      },
    },
    "bed-hammock": {
      obs: [{ cx: 0, cz: 0.05, w: 1.7, d: 3.3 }], spot: { lx: 1.85, lz: 0.4, yaw: -PI / 2 }, lie: { lx: 0, lz: 0.05, h: 1.0, yaw: PI },
      build(g) {
        const wood = toon(0xa47a48);
        for (const z of [-1.45, 1.55]) {
          block(g, wood, 0, 1.0, z, 0.2, 2.0, 0.2, 0.06);
          block(g, wood, 0, 0.06, z, 1.2, 0.12, 0.3, 0.05);
          ball(g, 0x5cc84a, 0, 2.15, z, 0.18);
        }
        // the cloth: a curved, striped sheet sagging in the middle
        const stripes = canvasTexture(64, 128, (ctx, w, h) => {
          const cols = ["#ff7a59", "#ffcf5a", "#5cc8b8", "#ffffff"];
          for (let i = 0; i < 8; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(0, i * 16, w, 16); }
        });
        const nu = 16, nv = 6, geo = new THREE.BufferGeometry();
        const pos = [], uvs = [], idx = [];
        for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
          const a = i / nu, b = j / nv, zt = a * 2 - 1, vt = b * 2 - 1;
          pos.push(vt * 0.6, 0.95 + 0.55 * zt * zt + 0.12 * vt * vt, -1.15 + a * 2.4);
          uvs.push(b, a);
        }
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
          const a = i * (nv + 1) + j, b = a + nv + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        geo.setIndex(idx);
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geo.computeVertexNormals();
        put(g, geo, toon(0xffffff, { map: stripes, side: THREE.DoubleSide }), {});
        // ropes from the ends of the cloth up to the posts
        for (const [z, zz] of [[-1.15, -1.45], [1.25, 1.55]]) {
          const y = 1.55, yy = 1.9;
          cylinder(g, 0xf4efe4, 0, (y + yy) / 2, (z + zz) / 2, 0.025, Math.hypot(zz - z, yy - y), { rx: Math.atan2(zz - z, yy - y) });
        }
        ball(g, 0xffffff, 0, 1.25, -0.85, 0.24, { sx: 1.5, sy: 0.45 });
      },
    },

    // ===== seats (facing +z) =====
    "sofa-basic": {
      obs: [{ cx: 0, cz: 0, w: 1.4, d: 1.2 }], spot: { lx: 0, lz: 1.3, yaw: 0 }, seat: { lx: 0, lz: 0.02, h: 0.56 },
      build(g) {
        const c = toon(0xffb84a);
        block(g, c, 0, 0.3, 0, 1.3, 0.4, 1.1, 0.12);
        block(g, 0xffd27a, 0, 0.5, 0.05, 1.0, 0.14, 0.92, 0.07);
        block(g, c, 0, 0.9, -0.45, 1.3, 0.85, 0.24, 0.12);
        for (const sx of [-0.56, 0.56]) block(g, c, sx, 0.62, 0.02, 0.22, 0.42, 1.05, 0.1);
        for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) block(g, 0x8a5a3a, x, 0.06, z, 0.1, 0.12, 0.1, 0.03);
        ball(g, 0xff7a8a, 0.35, 0.78, -0.25, 0.2, { sz: 0.5, rz: 0.4 });
      },
    },
    "sofa-comfy": {
      obs: [{ cx: 0, cz: 0, w: 2.75, d: 1.25 }], spot: { lx: 0, lz: 1.35, yaw: 0 }, seat: { lx: 0, lz: 0.05, h: 0.6 },
      build(g) {
        const c = toon(0x4fb8b0), c2 = toon(0x7fd6cc);
        block(g, c, 0, 0.3, 0, 2.6, 0.42, 1.2, 0.14);
        for (const sx of [-0.6, 0.6]) block(g, c2, sx, 0.53, 0.07, 1.15, 0.18, 1.0, 0.09);
        block(g, c, 0, 0.95, -0.5, 2.6, 0.9, 0.3, 0.15);
        for (const sx of [-0.6, 0.6]) block(g, c2, sx, 0.95, -0.32, 1.1, 0.65, 0.2, 0.1, { rx: -0.12 });
        for (const sx of [-1.25, 1.25]) put(g, G.capsule(), c, { x: sx, y: 0.62, z: 0.0, sx: 0.32, sy: 0.75, sz: 0.32, rx: PI / 2 });
        ball(g, 0xff9ec7, -0.95, 0.85, -0.2, 0.22, { sz: 0.5, rz: -0.4 });
        ball(g, 0xffe25a, 0.95, 0.85, -0.2, 0.22, { sz: 0.5, rz: 0.4 });
        for (const [x, z] of [[-1.15, -0.45], [1.15, -0.45], [-1.15, 0.45], [1.15, 0.45]]) ball(g, 0x8a5a3a, x, 0.06, z, 0.07);
      },
    },
    "sofa-beanbag": {
      obs: [{ cx: 0, cz: -0.05, r: 0.85 }], spot: { lx: 0, lz: 1.45, yaw: 0 }, seat: { lx: 0, lz: 0.0, h: 0.45 },
      build(g) {
        ball(g, 0xb58cff, 0, 0.36, -0.05, 0.8, { sy: 0.48 });
        ball(g, 0xb58cff, 0, 0.62, -0.42, 0.55, { sy: 0.65, sz: 0.6 });
        ball(g, 0xc9a8ff, 0, 0.46, 0.05, 0.5, { sy: 0.25 });
        ball(g, 0xffffff, 0.45, 0.75, -0.55, 0.06);
        ball(g, 0xffffff, -0.55, 0.58, -0.35, 0.05);
      },
    },
    "sofa-throne": {
      obs: [{ cx: 0, cz: -0.05, w: 1.9, d: 1.7 }], spot: { lx: 0, lz: 1.6, yaw: 0 }, seat: { lx: 0, lz: 0.05, h: 0.81 },
      build(g) {
        const gold = toon(0xffcf3a), red = toon(0xd8344a);
        block(g, red, 0, 0.12, -0.05, 1.8, 0.24, 1.6, 0.06);
        block(g, gold, 0, 0.25, -0.05, 1.84, 0.04, 1.64, 0.02);
        block(g, gold, 0, 0.5, 0.0, 1.15, 0.5, 0.95, 0.08);
        block(g, red, 0, 0.78, 0.04, 1.0, 0.1, 0.85, 0.05);
        block(g, gold, 0, 1.55, -0.5, 1.2, 1.9, 0.2, 0.1);
        block(g, red, 0, 1.45, -0.39, 0.9, 1.4, 0.04, 0.08);
        for (const sx of [-0.6, 0.6]) {
          block(g, gold, sx, 0.98, 0.0, 0.16, 0.12, 0.95, 0.05);
          ball(g, gold, sx, 1.02, 0.5, 0.11);
          ball(g, gold, sx, 2.55, -0.5, 0.13);
          block(g, gold, sx, 0.75, 0.38, 0.12, 0.45, 0.12, 0.04);
        }
        put(g, G.cone(5), gold, { y: 2.75, z: -0.5, s: 0.22, sy: 0.4 });
        ball(g, glow(0xff3b6b, 0.6), 0, 2.2, -0.39, 0.12, { sz: 0.5 });
        ball(g, glow(0x3bb5ff, 0.6), -0.3, 2.0, -0.39, 0.07, { sz: 0.5 });
        ball(g, glow(0x5cff8a, 0.6), 0.3, 2.0, -0.39, 0.07, { sz: 0.5 });
      },
    },

    // ===== tables (the Mii stands behind them, at -z, facing you) =====
    "table-basic": {
      obs: [{ cx: 0, cz: 0, w: 1.6, d: 1.1 }], spot: { lx: 0, lz: -1.2, yaw: 0 },
      build(g) {
        const wood = toon(0xe0a868);
        block(g, wood, 0, 0.82, 0, 1.6, 0.1, 1.1, 0.05);
        for (const [x, z] of [[-0.65, -0.4], [0.65, -0.4], [-0.65, 0.4], [0.65, 0.4]]) block(g, wood, x, 0.4, z, 0.1, 0.8, 0.1, 0.03);
        cylinder(g, 0x7cc6e8, -0.4, 1.05, 0.0, 0.12, 0.35);
        cylinder(g, 0x4f9e35, -0.4, 1.35, 0.0, 0.02, 0.4);
        ball(g, 0xff6fa5, -0.4, 1.58, 0.0, 0.12);
        cylinder(g, 0xffffff, 0.35, 0.89, 0.05, 0.3, 0.04);
        ball(g, 0xff3b3b, 0.3, 0.98, 0.05, 0.1);
        ball(g, 0x8ad43a, 0.45, 0.98, 0.1, 0.09);
      },
    },
    "table-picnic": {
      obs: [{ cx: 0, cz: 0, w: 2.4, d: 2.25 }], spot: { lx: 0, lz: -1.7, yaw: 0 },
      build(g) {
        const wood = toon(0xc98b4a);
        const check = canvasTexture(64, 64, (ctx) => {
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = "#ff5a64";
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
        }, [3, 1.5]);
        block(g, wood, 0, 0.8, 0, 2.2, 0.1, 0.95, 0.04);
        block(g, toon(0xffffff, { map: check }), 0, 0.86, 0, 2.0, 0.03, 1.05, 0.01);
        for (const sz of [-0.82, 0.82]) block(g, wood, 0, 0.48, sz, 2.2, 0.08, 0.36, 0.03);
        for (const sx of [-0.9, 0.9]) {
          block(g, wood, sx, 0.4, 0, 0.1, 0.8, 0.1, 0.02);
          block(g, wood, sx, 0.4, 0, 0.1, 0.08, 1.9, 0.02);
          block(g, wood, sx, 0.22, 0, 0.1, 0.44, 0.1, 0.02, { rz: sx * 0.2 });
        }
        block(g, 0xc98b4a, -0.5, 1.07, -0.05, 0.6, 0.4, 0.45, 0.08);
        put(g, G.torus(0.25, 0.03), toon(0xa86b32), { x: -0.5, y: 1.27, z: -0.05 });
        block(g, 0xf5d48e, 0.35, 0.95, 0.15, 0.4, 0.14, 0.3, 0.04);
        block(g, 0x8ad43a, 0.35, 1.03, 0.15, 0.42, 0.03, 0.32, 0.01);
        cylinder(g, 0xff9a3a, 0.8, 1.0, -0.15, 0.08, 0.28);
      },
    },
    "table-desk": {
      obs: [{ cx: 0, cz: 0.05, w: 2.15, d: 1.0 }], spot: { lx: 0, lz: -1.15, yaw: 0 },
      build(g, ctx) {
        const top = toon(0xf4f4f4), legs = toon(0x8f96a3);
        block(g, top, 0, 1.0, 0, 2.1, 0.08, 0.9, 0.04);
        for (const sx of [-0.98, 0.98]) block(g, legs, sx, 0.5, 0, 0.08, 1.0, 0.8, 0.03);
        block(g, 0x2f3542, 0, 1.55, 0.25, 1.2, 0.75, 0.06, 0.04);
        const scr = codeScreen();
        const screen = dynamic(plane(g, 1.1, 0.65, basic(scr), { y: 1.55, z: 0.215, ry: PI }));
        ctx.anim.push((t) => { scr.offset.y = -((t * 0.08) % 1); screen.material.color.setScalar(0.92 + Math.sin(t * 13) * 0.04); });
        block(g, 0x2f3542, 0, 1.12, 0.25, 0.1, 0.2, 0.1, 0.03);
        block(g, 0x2f3542, 0, 1.05, 0.25, 0.4, 0.03, 0.25, 0.02);
        block(g, 0xdfe4ea, 0, 1.06, -0.2, 0.8, 0.04, 0.25, 0.02);
        ball(g, 0xdfe4ea, 0.6, 1.07, -0.2, 0.06, { sy: 0.5, sz: 1.4 });
        block(g, 0x3a3f4a, 0.75, 0.42, 0.1, 0.35, 0.8, 0.7, 0.04);
        ball(g, glow(0x5cc8ff, 1), 0.75, 0.7, -0.26, 0.04);
        cylinder(g, 0xff7a59, -0.8, 1.13, -0.15, 0.08, 0.18);
        cylinder(g, 0xffcf3a, -0.8, 1.2, 0.2, 0.04, 0.35); // desk lamp
        put(g, G.cone(), toon(0xffcf3a), { x: -0.7, y: 1.42, z: 0.15, s: 0.16, sy: 0.18, rz: 0.6 });
      },
    },
    "table-tea": {
      obs: [{ cx: 0, cz: 0, r: 0.8 }], spot: { lx: 0, lz: -1.35, yaw: 0 },
      build(g) {
        cylinder(g, 0xffffff, 0, 0.82, 0, 0.75, 0.06, { seg: 32 });
        put(g, G.taper(0.76, 0.84), toon(0xfff0f6), { y: 0.6, sy: 0.42 });
        cylinder(g, 0xd9a441, 0, 0.3, 0, 0.06, 0.6);
        cylinder(g, 0xd9a441, 0, 0.03, 0, 0.4, 0.05);
        // teapot
        ball(g, 0xffffff, -0.25, 1.05, 0.0, 0.22, { sy: 0.85 });
        ball(g, 0xff9ec7, -0.25, 1.05, 0.0, 0.225, { sy: 0.2 });
        ball(g, 0xffffff, -0.25, 1.26, 0.0, 0.08);
        cylinder(g, 0xffffff, -0.02, 1.1, 0.0, 0.035, 0.25, { rz: -0.9 });
        put(g, G.torus(0.1, 0.025), toon(0xffffff), { x: -0.47, y: 1.07, z: 0 });
        // cups and saucers
        for (const [x, z] of [[0.3, -0.25], [0.25, 0.35]]) {
          cylinder(g, 0xffd6e6, x, 0.865, z, 0.13, 0.015);
          put(g, G.taper(0.08, 0.06), toon(0xffffff), { x, y: 0.92, z, sy: 0.1 });
        }
        // little cake stand
        cylinder(g, 0xd9a441, 0.0, 1.05, 0.3, 0.02, 0.4);
        cylinder(g, 0xffffff, 0.0, 0.95, 0.3, 0.2, 0.02);
        cylinder(g, 0xffffff, 0.0, 1.15, 0.3, 0.14, 0.02);
        ball(g, 0xff9ec7, 0.06, 0.99, 0.32, 0.05);
        ball(g, 0xffe25a, -0.07, 0.99, 0.27, 0.05);
        ball(g, 0xff3b5a, 0.0, 1.19, 0.3, 0.045);
      },
    },

    // ===== fun things (against the right wall; the Mii stands at +z facing them) =====
    "tv-none": {
      obs: [{ cx: 0, cz: -0.15, w: 1.0, d: 0.8 }], spot: { lx: 0, lz: 1.2, yaw: PI },
      build(g, ctx) {
        const wood = toon(0xc98b4a);
        block(g, wood, 0, 0.7, -0.15, 0.9, 0.08, 0.7, 0.03);
        for (const [x, z] of [[-0.38, -0.42], [0.38, -0.42], [-0.38, 0.12], [0.38, 0.12]]) block(g, wood, x, 0.35, z, 0.07, 0.7, 0.07, 0.02);
        block(g, 0xff7a59, 0, 1.0, -0.15, 0.8, 0.52, 0.38, 0.12);
        disc(g, toon(0xfff1dc), -0.15, 1.0, 0.045, 0.17, { rx: 0 });
        for (let k = 0; k < 4; k++) block(g, 0xc98b4a, -0.15, 0.9 + k * 0.065, 0.05, 0.28, 0.02, 0.01, 0.005);
        ball(g, 0xffcf5a, 0.22, 1.08, 0.05, 0.06, { sz: 0.5 });
        ball(g, 0xffcf5a, 0.22, 0.92, 0.05, 0.05, { sz: 0.5 });
        cylinder(g, 0x8f96a3, 0.25, 1.5, -0.25, 0.015, 0.6, { rz: -0.4 });
        // music notes floating up
        const noteTex = canvasTexture(64, 64, (c) => {
          c.fillStyle = "#ff5a8a"; c.font = "bold 52px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("♪", 32, 34);
        });
        const notes = [];
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false }));
          s.scale.setScalar(0.35);
          g.add(dynamic(s));
          notes.push(s);
        }
        ctx.anim.push((t) => notes.forEach((s, i) => {
          const k = (t * 0.35 + i / 3) % 1;
          s.position.set(Math.sin(t * 2 + i * 2) * 0.25, 1.35 + k * 1.3, -0.1 + k * 0.4);
          s.material.opacity = Math.min(1, (1 - k) * 2);
        }));
      },
    },
    "tv-retro": {
      obs: [{ cx: 0, cz: -0.05, w: 1.75, d: 1.05 }], spot: { lx: 0, lz: 1.85, yaw: PI },
      build(g, ctx) {
        const wood = toon(0xa86b32);
        block(g, wood, 0, 0.95, -0.1, 1.65, 1.25, 0.95, 0.14);
        for (const sx of [-0.65, 0.65]) block(g, 0x6b4423, sx, 0.15, -0.1, 0.1, 0.3, 0.1, 0.03, { rz: sx * 0.3 });
        block(g, 0xe8dcc8, -0.2, 0.98, 0.37, 1.05, 0.85, 0.04, 0.12);
        const shows = [tvShow(0), tvShow(1), tvShow(2)];
        const scr = dynamic(plane(g, 0.92, 0.72, basic(shows[0]), { x: -0.2, y: 0.98, z: 0.395 }));
        for (let k = 0; k < 2; k++) ball(g, 0xffcf5a, 0.55, 1.15 - k * 0.3, 0.38, 0.07, { sz: 0.6 });
        for (let k = 0; k < 4; k++) block(g, 0x6b4423, 0.55, 0.65 - k * 0.06, 0.38, 0.22, 0.02, 0.01, 0.005);
        // rabbit-ear aerial
        ball(g, 0x3a3f4a, 0, 1.6, -0.1, 0.12, { sy: 0.6 });
        for (const s of [-1, 1]) cylinder(g, 0x8f96a3, s * 0.22, 1.95, -0.1, 0.015, 0.8, { rz: -s * 0.55 });
        let show = 0, next = 3;
        ctx.anim.push((t) => {
          if (t > next) { show = (show + 1) % shows.length; scr.material.map = shows[show]; next = t + 3 + Math.random() * 3; }
          scr.material.color.setScalar(0.85 + Math.random() * 0.15);
        });
      },
    },
    "tv-console": {
      obs: [{ cx: 0, cz: -0.2, w: 2.1, d: 0.75 }], spot: { lx: 0, lz: 1.5, yaw: PI },
      build(g, ctx) {
        block(g, 0xf4f4f4, 0, 0.3, -0.2, 2.0, 0.6, 0.6, 0.08);
        block(g, 0x3a3f4a, 0, 0.3, 0.11, 1.8, 0.4, 0.02, 0.02);
        block(g, 0x2f3542, 0, 1.35, -0.3, 1.9, 1.1, 0.08, 0.05);
        block(g, 0x2f3542, 0, 0.7, -0.3, 0.3, 0.2, 0.25, 0.04);
        const game = gameScreen();
        const scr = dynamic(plane(g, 1.8, 1.0, basic(game), { y: 1.35, z: -0.255 }));
        ctx.anim.push((t) => { game.offset.x = (t * 0.12) % 1; scr.material.color.setScalar(0.94 + Math.sin(t * 17) * 0.03); });
        // the console and two controllers
        block(g, 0xffffff, -0.45, 0.66, -0.15, 0.55, 0.12, 0.4, 0.05);
        ball(g, glow(0x5cc8ff, 1), -0.25, 0.67, 0.06, 0.03);
        block(g, 0xff3b3b, 0.35, 0.65, -0.05, 0.12, 0.08, 0.28, 0.04);
        block(g, 0x4a90e2, 0.55, 0.65, -0.05, 0.12, 0.08, 0.28, 0.04);
        cylinder(g, 0x2f3542, 0.0, 0.62, 0.1, 0.01, 0.6, { rz: PI / 2, shadow: false });
      },
    },
    "tv-treadmill": {
      obs: [{ cx: 0, cz: 0.4, w: 1.1, d: 2.1 }], spot: { lx: 0, lz: 2.15, yaw: PI }, stand: { lx: 0, lz: 0.45, h: 0.3 },
      build(g, ctx) {
        block(g, 0x3a3f4a, 0, 0.15, 0.45, 1.0, 0.25, 2.0, 0.08);
        const belt = canvasTexture(32, 128, (c, w, h) => {
          c.fillStyle = "#2a2e36"; c.fillRect(0, 0, w, h);
          c.fillStyle = "#454b57"; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 4);
        }, [1, 3]);
        dynamic(plane(g, 0.8, 1.9, toon(0xffffff, { map: belt }), { y: 0.285, z: 0.45, rx: -PI / 2 }));
        ctx.anim.push((t) => { belt.offset.y = (t * 1.6) % 1; });
        for (const sx of [-0.48, 0.48]) {
          block(g, 0x4a90e2, sx, 0.85, -0.38, 0.12, 1.4, 0.12, 0.05, { rx: 0.15 });
          block(g, 0xff7a59, sx, 1.22, 0.05, 0.1, 0.1, 0.9, 0.05); // handrails
          block(g, 0x3a3f4a, sx, 0.2, 0.45, 0.06, 0.18, 2.0, 0.03);
        }
        block(g, 0x4a90e2, 0, 1.55, -0.42, 0.9, 0.4, 0.2, 0.06, { rx: -0.4 });
        const disp = canvasTexture(64, 32, (c, w, h) => { c.fillStyle = "#14213d"; c.fillRect(0, 0, w, h); c.fillStyle = "#5cff8a"; c.font = "bold 16px monospace"; c.fillText("5.2km", 6, 21); });
        plane(g, 0.5, 0.22, basic(disp), { y: 1.6, z: -0.31, rx: -0.4 });
        cylinder(g, 0xffffff, 0.35, 1.32, -0.28, 0.06, 0.2); // water bottle
      },
    },
    "tv-piano": {
      obs: [{ cx: 0, cz: -0.05, w: 2.1, d: 1.05 }], spot: { lx: 0, lz: 1.2, yaw: PI },
      build(g) {
        const black = toon(0x2a2430);
        block(g, black, 0, 0.85, -0.25, 2.0, 1.7, 0.6, 0.08);
        block(g, black, 0, 0.75, 0.2, 2.0, 0.12, 0.6, 0.04);
        const keys = canvasTexture(256, 32, (c, w, h) => {
          c.fillStyle = "#fffdf5"; c.fillRect(0, 0, w, h);
          c.fillStyle = "#cfc8bc"; for (let x = 0; x < w; x += 10.6) c.fillRect(x, 0, 1.2, h);
          c.fillStyle = "#1a1a1a";
          for (let k = 0; k < 24; k++) if (![2, 6].includes(k % 7)) c.fillRect(k * 10.6 + 7, 0, 6, h * 0.6);
        });
        plane(g, 1.85, 0.3, toon(0xffffff, { map: keys }), { y: 0.82, z: 0.32, rx: -PI / 2 });
        block(g, black, 0, 0.88, 0.48, 2.0, 0.14, 0.05, 0.02);
        for (const sx of [-0.92, 0.92]) block(g, black, sx, 0.4, 0.3, 0.1, 0.8, 0.12, 0.03);
        block(g, 0xffffff, 0.1, 1.32, 0.07, 0.6, 0.42, 0.03, 0.01, { rx: -0.2 }); // sheet music
        for (let k = 0; k < 4; k++) block(g, 0x2a2430, 0.1, 1.2 + k * 0.08, 0.09, 0.45, 0.01, 0.01, 0.002, { rx: -0.2 });
        block(g, 0xd9a441, 0, 1.73, -0.25, 2.05, 0.06, 0.65, 0.02);
        cylinder(g, 0xffffff, -0.7, 1.85, -0.3, 0.06, 0.2);
        ball(g, glow(0xffc04d, 1), -0.7, 2.0, -0.3, 0.05, { sy: 1.6 });
      },
    },

    // ===== rugs (flat, under the table) =====
    "rug-none": { build() {} },
    "rug-round": {
      build(g) {
        const tex = canvasTexture(256, 256, (c, w, h) => {
          const cols = ["#ff8a4c", "#ffcf5a", "#ffb07a", "#fff1dc", "#ff8a4c"];
          for (let i = 0; i < cols.length; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(128, 128, 128 - i * 24, 0, TAU); c.fill(); }
        });
        put(g, new THREE.CircleGeometry(2.0, 48), toon(0xffffff, { map: tex }), { y: 0.012, rx: -PI / 2, shadow: false });
      },
    },
    "rug-stripes": {
      build(g) {
        const tex = canvasTexture(256, 192, (c, w, h) => {
          c.fillStyle = "#ffffff"; roundRect(c, 0, 0, w, h, 40); c.fill();
          const cols = ["#ff5a64", "#ff9a3a", "#ffd23f", "#5cc84a", "#4a90e2", "#9b6bff"];
          c.save(); roundRect(c, 10, 10, w - 20, h - 20, 32); c.clip();
          cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(10, 10 + i * (h - 20) / 6, w - 20, (h - 20) / 6 + 1); });
          c.restore();
        });
        put(g, new THREE.PlaneGeometry(4.0, 3.0), toon(0xffffff, { map: tex, transparent: true }), { y: 0.012, rx: -PI / 2, shadow: false });
      },
    },
    "rug-fancy": {
      build(g) {
        const tex = canvasTexture(256, 176, (c, w, h) => {
          c.fillStyle = "#b8213a"; c.fillRect(0, 0, w, h);
          c.strokeStyle = "#e8b84a"; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
          c.lineWidth = 3; c.strokeRect(22, 22, w - 44, h - 44);
          c.fillStyle = "#e8b84a";
          c.save(); c.translate(w / 2, h / 2); c.rotate(PI / 4); c.fillRect(-34, -34, 68, 68); c.restore();
          c.fillStyle = "#8a1428"; c.save(); c.translate(w / 2, h / 2); c.rotate(PI / 4); c.fillRect(-22, -22, 44, 44); c.restore();
          c.fillStyle = "#e8b84a";
          for (const [x, y] of [[40, 40], [w - 40, 40], [40, h - 40], [w - 40, h - 40]]) { c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill(); }
        });
        put(g, new THREE.PlaneGeometry(4.4, 3.0), toon(0xffffff, { map: tex }), { y: 0.012, rx: -PI / 2, shadow: false });
        const tassels = [];
        for (const sx of [-1, 1]) for (let k = 0; k < 12; k++) tassels.push({ x: sx * 2.27, y: 0.02, z: -1.38 + k * 0.25, sx: 0.14, sy: 0.02, sz: 0.05 });
        scatter(g, G.box(), toon(0xe8b84a), tassels);
      },
    },

    // ===== lamps =====
    "lamp-basic": {
      // a floor lamp standing by the left wall, between the bed and the sofa
      at: { x: -5.45, z: -0.55 }, obs: [{ cx: 0, cz: 0, r: 0.32 }],
      build(g) {
        cylinder(g, 0x8f96a3, 0, 0.04, 0, 0.3, 0.08);
        cylinder(g, 0x8f96a3, 0, 1.2, 0, 0.035, 2.3);
        ball(g, glow(0xfff1b8, 1), 0, 2.25, 0, 0.13);
        put(g, G.taper(0.25, 0.45), toon(0xfff1dc, { emissive: 0xffe0a0, emissiveIntensity: 0.35 }), { y: 2.35, sy: 0.5 });
      },
    },
    "lamp-lava": {
      obs: [], spot: { wx: -1.55, wz: -2.85, toward: true },
      build(g, ctx) {
        // (the bedside table it stands on is always there)
        const y0 = 0.72;
        put(g, G.taper(0.09, 0.17), toon(0x8f96a3), { y: y0 + 0.12, sy: 0.24 });
        const glass = put(g, G.taper(0.07, 0.15), toon(0xff8ad8, { transparent: true, opacity: 0.55, emissive: 0xff5ab8, emissiveIntensity: 0.5 }), { y: y0 + 0.55, sy: 0.65, shadow: false });
        dynamic(glass);
        put(g, G.taper(0.05, 0.08), toon(0x8f96a3), { y: y0 + 0.94, sy: 0.14 });
        const blobs = [];
        for (let i = 0; i < 3; i++) blobs.push(dynamic(ball(g, glow(0xffcf3a, 0.9), 0, y0 + 0.4, 0, 0.055, { shadow: false })));
        ctx.anim.push((t) => blobs.forEach((b, i) => {
          const k = (Math.sin(t * 0.5 + i * 2.1) + 1) / 2;
          b.position.set(Math.sin(t * 0.7 + i) * 0.02, y0 + 0.32 + k * 0.48, Math.cos(t * 0.6 + i) * 0.02);
          b.scale.set(0.05 + Math.sin(t * 1.3 + i) * 0.012, 0.06 + Math.cos(t * 1.1 + i) * 0.02, 0.05);
        }));
      },
    },
    "lamp-chandelier": {
      at: { x: 0.3, z: 1.0 }, obs: [], spot: { wx: -1.5, wz: 2.75, toward: true },
      build(g, ctx) {
        // it hangs on a long golden chain (the room has no ceiling, like a dollhouse)
        const cy = ROOM.h - 1.2;
        cylinder(g, 0xd9a441, 0, cy + 6, 0, 0.022, 12, { shadow: false });
        put(g, G.torus(0.75, 0.05), toon(0xffcf3a), { y: cy, rx: PI / 2, shadow: false });
        ball(g, 0xffcf3a, 0, cy - 0.05, 0, 0.18, { shadow: false });
        put(g, G.cone(), toon(0xffcf3a), { y: cy - 0.3, s: 0.12, sy: 0.3, rx: PI, shadow: false });
        const flames = [], crystals = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const x = Math.cos(a) * 0.75, z = Math.sin(a) * 0.75;
          cylinder(g, 0xffcf3a, x / 2, cy - 0.02, z / 2, 0.02, 0.75, { rz: PI / 2, ry: -a, shadow: false });
          cylinder(g, 0xffcf3a, x, cy + 0.05, z, 0.07, 0.04, { shadow: false });
          cylinder(g, 0xfffdf5, x, cy + 0.2, z, 0.045, 0.26, { shadow: false });
          flames.push(dynamic(ball(g, glow(0xffb02e, 1.2), x, cy + 0.38, z, 0.05, { sy: 1.8, shadow: false })));
          const ca = a + PI / 6;
          crystals.push(dynamic(put(g, G.cone(4), toon(0xdff6ff, { emissive: 0xbfeaff, emissiveIntensity: 0.3 }), { x: Math.cos(ca) * 0.6, y: cy - 0.25, z: Math.sin(ca) * 0.6, s: 0.07, sy: 0.18, rx: PI, shadow: false })));
          cylinder(g, 0xdff6ff, Math.cos(ca) * 0.6, cy - 0.12, Math.sin(ca) * 0.6, 0.006, 0.18, { shadow: false });
        }
        ctx.anim.push((t) => {
          flames.forEach((f, i) => { f.scale.set(0.05, 0.08 + Math.sin(t * 13 + i * 3) * 0.02, 0.05); });
          crystals.forEach((c, i) => { c.material.emissiveIntensity = 0.2 + Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.9; });
        });
      },
    },

    // ===== plants (front-left corner) =====
    "plant-none": { build() {} },
    "plant-pot": {
      obs: [{ cx: 0, cz: 0, r: 0.5 }], spot: { wx: -3.75, wz: 3.55, toward: true },
      build(g, ctx) {
        put(g, G.taper(0.45, 0.32), toon(0xe0784a), { y: 0.35, sy: 0.7 });
        cylinder(g, 0xd06a3e, 0, 0.7, 0, 0.47, 0.1);
        disc(g, toon(0x6b4423), 0, 0.72, 0, 0.42);
        const leaves = dynamic(group(g, 0, 0.7, 0));
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          put(leaves, G.sphere(), toon(i % 2 ? 0x46b04a : 0x5cc84a), { x: Math.cos(a) * 0.3, y: 0.55 + (i % 3) * 0.2, z: Math.sin(a) * 0.3, sx: 0.18, sy: 0.6, sz: 0.18, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 });
        }
        ctx.anim.push((t) => { leaves.rotation.z = Math.sin(t * 1.3) * 0.04; leaves.rotation.x = Math.cos(t * 1.1) * 0.03; });
      },
    },
    "plant-cactus": {
      obs: [{ cx: 0, cz: 0, r: 0.5 }], spot: { wx: -3.75, wz: 3.55, toward: true },
      build(g, ctx) {
        put(g, G.taper(0.42, 0.32), toon(0x4a90e2), { y: 0.3, sy: 0.6 });
        cylinder(g, 0xffffff, 0, 0.6, 0, 0.44, 0.08);
        disc(g, toon(0xe8c98a), 0, 0.62, 0, 0.4);
        const c = dynamic(group(g, 0, 0.6, 0));
        const green = toon(0x4fae5a);
        put(c, G.capsule(), green, { y: 0.75, sx: 0.5, sy: 0.85, sz: 0.5 });
        put(c, G.capsule(), green, { x: 0.38, y: 0.85, sx: 0.22, sy: 0.32, sz: 0.22, rz: PI / 2 });
        put(c, G.capsule(), green, { x: 0.52, y: 1.1, sx: 0.22, sy: 0.4, sz: 0.22 });
        put(c, G.capsule(), green, { x: -0.36, y: 0.65, sx: 0.2, sy: 0.3, sz: 0.2, rz: PI / 2 });
        put(c, G.capsule(), green, { x: -0.48, y: 0.85, sx: 0.2, sy: 0.32, sz: 0.2 });
        const spines = [];
        for (let i = 0; i < 26; i++) { const a = i * 2.4, y = 0.35 + (i / 26) * 0.9; spines.push({ x: Math.cos(a) * 0.25, y, z: Math.sin(a) * 0.25, s: 0.025 }); }
        scatter(c, G.lowSphere(), toon(0xfff6c2), spines);
        for (let i = 0; i < 5; i++) ball(c, 0xff6fa5, Math.cos(i * 1.26) * 0.08, 1.45, Math.sin(i * 1.26) * 0.08, 0.07, { sy: 0.6 });
        ball(c, 0xffe25a, 0, 1.48, 0, 0.05);
        // a happy cactus face
        ball(c, 0x2a2430, -0.09, 0.95, 0.24, 0.025);
        ball(c, 0x2a2430, 0.09, 0.95, 0.24, 0.025);
        ball(c, 0xff8ab8, 0, 0.87, 0.245, 0.03, { sx: 1.5, sy: 0.6 });
        ctx.anim.push((t) => { c.rotation.z = Math.sin(t * 1.6) * 0.04; });
      },
    },
    "plant-tree": {
      obs: [{ cx: 0, cz: 0, r: 0.6 }], spot: { wx: -3.6, wz: 3.45, toward: true },
      build(g, ctx) {
        put(g, G.taper(0.55, 0.42), toon(0xfff1dc), { y: 0.4, sy: 0.8 });
        cylinder(g, 0xd9a441, 0, 0.6, 0, 0.53, 0.06);
        disc(g, toon(0x6b4423), 0, 0.81, 0, 0.5);
        put(g, G.taper(0.09, 0.14), toon(0x9a6a3c), { y: 1.9, sy: 2.2 });
        const crown = dynamic(group(g, 0, 3.0, 0));
        ball(crown, 0x5cc84a, 0, 0.1, 0, 0.75);
        ball(crown, 0x4fbf47, -0.55, -0.15, 0.15, 0.5);
        ball(crown, 0x4fbf47, 0.55, -0.1, -0.1, 0.52);
        ball(crown, 0x7fdc5c, 0.1, 0.5, 0.3, 0.45);
        for (let i = 0; i < 5; i++) ball(crown, 0xffa21c, Math.cos(i * 1.3) * 0.65, -0.1 + (i % 2) * 0.3, Math.sin(i * 1.3) * 0.65, 0.08);
        ctx.anim.push((t) => { crown.rotation.z = Math.sin(t * 0.9) * 0.03; });
      },
    },

    // ===== wall art (on the back wall) =====
    "art-none": { build() {} },
    "art-sunset": {
      spot: { wx: 2.4, wz: -3.2, yaw: PI },
      build(g) {
        const tex = canvasTexture(256, 180, (c, w, h) => {
          const gr = c.createLinearGradient(0, 0, 0, h * 0.65);
          gr.addColorStop(0, "#5a3a8a"); gr.addColorStop(0.5, "#ff7a59"); gr.addColorStop(1, "#ffd166");
          c.fillStyle = gr; c.fillRect(0, 0, w, h);
          c.fillStyle = "#fff2a8"; c.beginPath(); c.arc(w / 2, h * 0.62, 34, PI, 0); c.fill();
          c.fillStyle = "#2f7fb8"; c.fillRect(0, h * 0.62, w, h);
          c.fillStyle = "rgba(255,230,150,0.7)"; for (let k = 0; k < 6; k++) c.fillRect(w / 2 - 30 + k * 4, h * 0.66 + k * 9, 60 - k * 8, 4);
          c.fillStyle = "#3a2a4a"; c.beginPath(); c.moveTo(20, h); c.quadraticCurveTo(30, h * 0.5, 60, h * 0.42); c.lineTo(64, h * 0.46); c.quadraticCurveTo(38, h * 0.55, 34, h); c.fill();
          for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(60 + Math.cos(k * 1.25) * 18, h * 0.42 + Math.sin(k * 1.25) * 8, 22, 6, k * 1.25, 0, TAU); c.fill(); }
        });
        block(g, 0xc98b4a, 0, 0, 0, 2.0, 1.45, 0.1, 0.05);
        plane(g, 1.8, 1.25, toon(0xffffff, { map: tex }), { z: 0.06 });
      },
    },
    "art-poster": {
      spot: { wx: 2.4, wz: -3.2, yaw: PI },
      build(g) {
        const tex = canvasTexture(180, 256, (c, w, h) => {
          c.fillStyle = "#2e8b57"; c.fillRect(0, 0, w, h);
          c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 3; c.strokeRect(20, 150, w - 40, 90); c.beginPath(); c.arc(w / 2, 150, 30, 0, PI); c.stroke();
          c.fillStyle = "#ffffff"; c.beginPath(); c.arc(w / 2, 100, 38, 0, TAU); c.fill();
          c.fillStyle = "#222"; c.beginPath(); c.arc(w / 2, 100, 13, 0, TAU); c.fill();
          for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU - PI / 2; c.beginPath(); c.arc(w / 2 + Math.cos(a) * 28, 100 + Math.sin(a) * 28, 8, 0, TAU); c.fill(); }
          c.fillStyle = "#ffd23f"; c.font = "bold 44px 'Nunito', sans-serif"; c.textAlign = "center"; c.fillText("GOAL!", w / 2, 46);
          c.fillStyle = "#fff"; c.font = "bold 18px 'Nunito', sans-serif"; c.fillText("MII CUP CHAMPIONS", w / 2, 225);
        });
        plane(g, 1.3, 1.85, toon(0xffffff, { map: tex }), { z: 0.03, rz: 0.03 });
        for (const [x, y] of [[-0.6, 0.86], [0.6, 0.86], [-0.6, -0.86], [0.6, -0.86]]) block(g, 0xfff6c2, x, y, 0.04, 0.22, 0.08, 0.01, 0.005, { rz: x * y > 0 ? 0.7 : -0.7 });
      },
    },
    "art-portrait": {
      spot: { wx: 2.4, wz: -3.2, yaw: PI },
      build(g, ctx) {
        const name = (ctx.record && ctx.record.name) || "Me";
        const tex = canvasTexture(180, 230, (c, w, h) => {
          const gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 140);
          gr.addColorStop(0, "#c46a7a"); gr.addColorStop(1, "#6a2a3a");
          c.fillStyle = gr; c.fillRect(0, 0, w, h);
          c.fillStyle = "#4a2a1a"; c.beginPath(); c.ellipse(w / 2, 104, 62, 66, 0, PI, 0); c.fill();
          c.fillStyle = "#ffd6b0"; c.beginPath(); c.ellipse(w / 2, 112, 52, 58, 0, 0, TAU); c.fill();
          c.fillStyle = "#4a2a1a"; c.beginPath(); c.ellipse(w / 2 - 14, 70, 44, 20, -0.3, 0, TAU); c.fill();
          c.fillStyle = "#2a1a1a"; c.beginPath(); c.ellipse(w / 2 - 18, 110, 6, 9, 0, 0, TAU); c.ellipse(w / 2 + 18, 110, 6, 9, 0, 0, TAU); c.fill();
          c.fillStyle = "#ff9aa8"; c.beginPath(); c.ellipse(w / 2 - 30, 128, 9, 5, 0, 0, TAU); c.ellipse(w / 2 + 30, 128, 9, 5, 0, 0, TAU); c.fill();
          c.strokeStyle = "#8a3a3a"; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, 132, 14, 0.2, PI - 0.2); c.stroke();
          c.fillStyle = "#4a7ad0"; c.beginPath(); c.ellipse(w / 2, h + 10, 70, 60, 0, PI, 0); c.fill();
        });
        const gold = toon(0xffcf3a);
        block(g, gold, 0, 0, 0, 1.45, 1.8, 0.12, 0.08);
        block(g, 0xd9a441, 0, 0, 0.04, 1.25, 1.6, 0.06, 0.04);
        plane(g, 1.12, 1.45, toon(0xffffff, { map: tex }), { z: 0.08 });
        for (const [x, y] of [[-0.72, 0.9], [0.72, 0.9], [-0.72, -0.9], [0.72, -0.9]]) ball(g, gold, x, y, 0.06, 0.1);
        ball(g, gold, 0, 1.0, 0.04, 0.16, { sz: 0.5 });
        const plaque = canvasTexture(192, 48, (c, w, h) => {
          c.fillStyle = "#d9a441"; c.fillRect(0, 0, w, h);
          c.fillStyle = "#4a3010"; c.textAlign = "center"; c.textBaseline = "middle"; fitFont(c, name, w - 20, 30); c.fillText(name, w / 2, h / 2 + 2);
        });
        plane(g, 0.8, 0.2, toon(0xffffff, { map: plaque }), { y: -1.08, z: 0.04 });
      },
    },

    // ===== special things (back-right corner) =====
    "special-none": { build() {} },
    "special-fishtank": {
      obs: [{ cx: 0, cz: -0.6, w: 2.3, d: 0.9 }], spot: { lx: 0, lz: 0.55, yaw: PI },
      build(g, ctx) {
        block(g, 0x8a5a3a, 0, 0.42, -0.6, 2.2, 0.84, 0.8, 0.06);
        for (const sx of [-0.55, 0.55]) ball(g, 0xffcf5a, sx, 0.45, -0.19, 0.05);
        block(g, 0x2f3542, 0, 2.08, -0.6, 2.18, 0.1, 0.8, 0.03);
        put(g, G.box(), toon(0x8fd8ff, { transparent: true, opacity: 0.35, emissive: 0x2a8acc, emissiveIntensity: 0.25 }), { y: 1.45, z: -0.6, sx: 2.1, sy: 1.15, sz: 0.74, shadow: false });
        block(g, 0xf3dd9a, 0, 0.94, -0.6, 2.05, 0.12, 0.7, 0.02);
        for (let k = 0; k < 8; k++) ball(g, [0xff9ec7, 0xffffff, 0x8fd3ff][k % 3], -0.9 + k * 0.25, 1.0, -0.45 - (k % 2) * 0.25, 0.05);
        block(g, 0xb3ada0, 0.6, 1.2, -0.75, 0.35, 0.4, 0.25, 0.04);
        put(g, G.cone(4), toon(0xff7a59), { x: 0.6, y: 1.5, z: -0.75, s: 0.17, sy: 0.25, ry: PI / 4 });
        const weeds = [];
        for (let k = 0; k < 4; k++) {
          const w = dynamic(group(g, -0.85 + k * 0.35 + (k > 1 ? 0.7 : 0), 0.98, -0.85));
          put(w, G.capsule(), toon(0x3fae5a), { y: 0.3, sx: 0.07, sy: 0.4, sz: 0.07 });
          weeds.push(w);
        }
        const fish = [];
        for (let i = 0; i < 4; i++) {
          const f = dynamic(group(g, 0, 1.4, -0.6));
          const col = [0xff8a2a, 0x4ab8ff, 0xffd23f, 0xff6fa5][i];
          ball(f, col, 0, 0, 0, 0.11, { sx: 1.3, sz: 0.5 });
          put(f, G.cone(4), toon(col), { x: -0.16, s: 0.08, sy: 0.12, rz: PI / 2, sz: 0.04 });
          ball(f, 0x222222, 0.08, 0.03, 0.04, 0.018);
          fish.push(f);
        }
        const bubbles = [];
        for (let i = 0; i < 5; i++) bubbles.push(dynamic(ball(g, toon(0xffffff, { transparent: true, opacity: 0.7 }), 0.85, 1.0, -0.6, 0.03, { shadow: false })));
        ctx.anim.push((t) => {
          fish.forEach((f, i) => {
            const sp = 0.45 + i * 0.12, ph = t * sp + i * 1.7;
            const x = Math.sin(ph) * 0.8;
            f.position.set(x, 1.2 + i * 0.15 + Math.sin(t * 1.3 + i) * 0.06, -0.6 + Math.cos(ph * 1.7) * 0.15);
            f.rotation.y = Math.cos(ph) > 0 ? 0 : PI;
          });
          weeds.forEach((w, i) => { w.rotation.z = Math.sin(t * 1.5 + i) * 0.2; });
          bubbles.forEach((b, i) => { const k = (t * 0.5 + i / 5) % 1; b.position.set(0.85 + Math.sin(t * 4 + i) * 0.03, 1.0 + k * 0.95, -0.6); });
        });
      },
    },
    "special-drums": {
      obs: [{ cx: 0, cz: 0.85, w: 2.2, d: 1.0 }], spot: { lx: 0, lz: -0.42, yaw: 0 },
      build(g, ctx) {
        const shell = toon(0xff3b5a), chrome = toon(0xdfe4ea);
        const logo = canvasTexture(128, 128, (c, w, h) => {
          c.fillStyle = "#ffffff"; c.beginPath(); c.arc(64, 64, 62, 0, TAU); c.fill();
          c.fillStyle = "#ff3b5a"; c.font = "bold 40px 'Nunito', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("MII", 64, 54);
          c.font = "bold 22px 'Nunito', sans-serif"; c.fillText("ROCK", 64, 88);
        });
        cylinder(g, shell, 0, 0.48, 0.9, 0.46, 0.45, { rx: PI / 2 });
        put(g, G.circle(), toon(0xffffff, { map: logo }), { y: 0.48, z: 1.13, s: 0.42, shadow: false });
        for (const s of [-1, 1]) {
          cylinder(g, shell, s * 0.28, 1.05, 0.8, 0.2, 0.2, { rx: 0.35 });
          cylinder(g, 0xffffff, s * 0.28, 1.15, 0.77, 0.19, 0.02, { rx: 0.35 });
        }
        cylinder(g, shell, -0.65, 0.78, 0.45, 0.24, 0.2, { rx: 0.2 });
        cylinder(g, 0xffffff, -0.65, 0.89, 0.43, 0.23, 0.02, { rx: 0.2 });
        cylinder(g, chrome, -0.65, 0.35, 0.45, 0.025, 0.7);
        cylinder(g, shell, 0.7, 0.5, 0.5, 0.26, 0.55);
        cylinder(g, 0xffffff, 0.7, 0.78, 0.5, 0.25, 0.02);
        const cym = [];
        for (const [x, y, z] of [[-0.95, 1.2, 0.75], [0.9, 1.55, 1.05]]) {
          cylinder(g, chrome, x, y / 2, z, 0.02, y);
          const c = dynamic(group(g, x, y, z));
          put(c, G.taper(0.02, 0.32), toon(0xffcf3a), { sy: 0.03 });
          cym.push(c);
        }
        ctx.anim.push((t) => cym.forEach((c, i) => { c.rotation.x = Math.sin(t * 7 + i * 2) * 0.08; c.rotation.z = Math.cos(t * 6 + i) * 0.06; }));
      },
    },
    "special-telescope": {
      obs: [{ cx: -0.2, cz: -0.3, r: 0.6 }], spot: { lx: 0.35, lz: 0.85, toward: { lx: -0.05, lz: 0.05 } },
      build(g, ctx) {
        const tp = dynamic(group(g, -0.2, 1.45, -0.3));
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + 0.4;
          cylinder(g, 0x9a6a3c, -0.2 + Math.cos(a) * 0.28, 0.72, -0.3 + Math.sin(a) * 0.28, 0.03, 1.5, { rx: -Math.sin(a) * 0.38, rz: Math.cos(a) * 0.38 });
        }
        ball(g, 0x3a3f4a, -0.2, 1.45, -0.3, 0.09);
        const inner = group(tp, 0, 0, 0);
        inner.rotation.x = -0.7; // tipped up toward the sky
        cylinder(inner, 0x4a5aa8, 0, 0, -0.3, 0.12, 1.3, { rx: PI / 2 });
        cylinder(inner, 0xffcf3a, 0, 0, -0.95, 0.15, 0.12, { rx: PI / 2 });
        cylinder(inner, 0x2f3542, 0, 0, 0.4, 0.05, 0.2, { rx: PI / 2 });
        cylinder(inner, 0xdfe4ea, 0, 0.17, -0.4, 0.035, 0.45, { rx: PI / 2 });
        tp.rotation.y = 0.3;
        ctx.anim.push((t) => { tp.rotation.y = 0.3 + Math.sin(t * 0.2) * 0.25; });
      },
    },
    "special-plushies": {
      obs: [{ cx: 0.3, cz: -0.35, r: 0.95 }], spot: { lx: -0.95, lz: 0.95, toward: { lx: 0.3, lz: -0.35 } },
      build(g, ctx) {
        // a big teddy, a bunny, a frog, a duck and a penguin, all piled up
        const pile = group(g, 0.3, 0, -0.35);
        ball(pile, 0xffd6e6, 0, 0.18, 0, 0.75, { sy: 0.3 });
        const bear = group(pile, 0, 0.25, -0.2, 0.2);
        ball(bear, 0xc98b4a, 0, 0.5, 0, 0.45, { sy: 0.9 });
        ball(bear, 0xc98b4a, 0, 1.1, 0, 0.34);
        for (const s of [-1, 1]) { ball(bear, 0xc98b4a, s * 0.26, 1.38, 0, 0.12); ball(bear, 0xc98b4a, s * 0.42, 0.55, 0.12, 0.15); }
        ball(bear, 0xf5d4a8, 0, 1.03, 0.28, 0.14, { sz: 0.6 });
        ball(bear, 0x2a2430, 0, 1.08, 0.36, 0.04);
        for (const s of [-1, 1]) ball(bear, 0x2a2430, s * 0.12, 1.18, 0.29, 0.035);
        block(bear, 0xff5a64, 0, 0.82, 0.2, 0.3, 0.12, 0.1, 0.05);
        const bunny = group(pile, 0.55, 0.15, 0.35, -0.4);
        ball(bunny, 0xffffff, 0, 0.3, 0, 0.28);
        ball(bunny, 0xffffff, 0, 0.68, 0, 0.22);
        for (const s of [-1, 1]) put(bunny, G.capsule(), toon(0xffffff), { x: s * 0.09, y: 1.0, sx: 0.09, sy: 0.25, sz: 0.06, rz: -s * 0.15 });
        for (const s of [-1, 1]) ball(bunny, 0x2a2430, s * 0.08, 0.72, 0.19, 0.03);
        ball(bunny, 0xff8ab8, 0, 0.65, 0.21, 0.03);
        const frog = group(pile, -0.55, 0.12, 0.35, 0.5);
        ball(frog, 0x6fcf6a, 0, 0.25, 0, 0.3, { sy: 0.8 });
        for (const s of [-1, 1]) { ball(frog, 0x6fcf6a, s * 0.14, 0.48, 0.05, 0.11); ball(frog, 0xffffff, s * 0.14, 0.5, 0.12, 0.06); ball(frog, 0x2a2430, s * 0.14, 0.5, 0.17, 0.03); }
        const duck = group(pile, 0.1, 0.4, 0.55);
        ball(duck, 0xffe25a, 0, 0.15, 0, 0.2);
        ball(duck, 0xffe25a, 0, 0.38, 0.05, 0.14);
        ball(duck, 0xff9a3a, 0, 0.36, 0.2, 0.06, { sx: 1.4, sy: 0.5 });
        const peng = group(pile, -0.6, 0.15, -0.35, 0.3);
        ball(peng, 0x2f3542, 0, 0.35, 0, 0.3, { sy: 1.3 });
        ball(peng, 0xffffff, 0, 0.3, 0.12, 0.22, { sy: 1.2 });
        ball(peng, 0xff9a3a, 0, 0.55, 0.28, 0.05);
        const bob = dynamic(group(pile, 0, 0, 0));
        bob.add(bunny); // the bunny bounces a little
        ctx.anim.push((t) => { bob.position.y = Math.abs(Math.sin(t * 1.5)) * 0.04; });
      },
    },
    "special-punchbag": {
      obs: [{ cx: 0.5, cz: -0.3, w: 1.1, d: 1.4 }], spot: { lx: -0.55, lz: 0.15, yaw: PI / 2 },
      build(g, ctx) {
        block(g, 0x3a3f4a, 0.5, 0.05, -0.55, 0.9, 0.1, 0.8, 0.04);
        cylinder(g, 0x3a3f4a, 0.5, 1.45, -0.8, 0.07, 2.8);
        cylinder(g, 0x3a3f4a, 0.5, 2.8, -0.42, 0.05, 0.8, { rx: PI / 2 });
        const bag = dynamic(group(g, 0.5, 2.8, 0.0));
        cylinder(bag, 0x8f96a3, 0, -0.2, 0, 0.012, 0.4);
        put(bag, G.capsule(), toon(0xe2384a), { y: -1.05, sx: 0.62, sy: 1.0, sz: 0.62 });
        block(bag, 0x2f3542, 0, -0.95, 0, 0.64, 0.12, 0.64, 0.05);
        for (const s of [-1, 1]) ball(g, 0xff3b3b, -0.2 + s * 0.15, 0.12, -0.6, 0.13, { sx: 1.2 });
        ctx.anim.push((t) => { bag.rotation.z = Math.sin(t * 2.2) * 0.06; bag.rotation.x = Math.sin(t * 1.7) * 0.04; });
      },
    },
  };

  // A computer screen full of code (scrolls upward).
  function codeScreen() {
    return canvasTexture(128, 128, (c, w, h) => {
      c.fillStyle = "#1e2233"; c.fillRect(0, 0, w, h);
      const r = seeded(29);
      const cols = ["#ff7ab8", "#7fe0ff", "#ffd166", "#9cff8a", "#ffffff"];
      for (let y = 6; y < h; y += 8) {
        let x = 6 + Math.floor(r() * 3) * 8;
        while (x < w - 20 && r() < 0.8) { const l = 8 + r() * 26; c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(x, y, l, 4); x += l + 5; }
      }
    }, [1, 1]);
  }
  // A side-scrolling game: hills, clouds, coins and a little hero.
  function gameScreen() {
    return canvasTexture(256, 128, (c, w, h) => {
      c.fillStyle = "#6cc2ff"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffffff"; for (const x of [30, 150, 220]) { c.beginPath(); c.arc(x, 28, 10, 0, TAU); c.arc(x + 12, 24, 12, 0, TAU); c.arc(x + 24, 28, 9, 0, TAU); c.fill(); }
      c.fillStyle = "#5cc84a"; for (const x of [40, 170]) { c.beginPath(); c.arc(x, h - 18, 34, PI, 0); c.fill(); }
      c.fillStyle = "#c97a3a"; c.fillRect(0, h - 18, w, 18);
      c.fillStyle = "#8ad43a"; c.fillRect(0, h - 20, w, 4);
      c.fillStyle = "#e0884a"; for (const x of [90, 106, 122]) c.fillRect(x, 60, 15, 15);
      c.fillStyle = "#ffd23f"; for (const x of [70, 200, 215, 230]) { c.beginPath(); c.ellipse(x, 52, 4, 6, 0, 0, TAU); c.fill(); }
      c.fillStyle = "#3db55a"; c.fillRect(150, h - 44, 18, 26); c.fillRect(146, h - 48, 26, 8);
    }, [1, 1]);
  }
  // A few different TV shows (switched every few seconds).
  function tvShow(kind) {
    return canvasTexture(128, 100, (c, w, h) => {
      if (kind === 0) { // cooking show
        c.fillStyle = "#ffe9c4"; c.fillRect(0, 0, w, h);
        c.fillStyle = "#ffffff"; c.fillRect(40, 22, 30, 22);
        c.fillStyle = "#ffd6b0"; c.beginPath(); c.arc(55, 50, 14, 0, TAU); c.fill();
        c.fillStyle = "#8a5a3a"; c.fillRect(0, 72, w, 28);
        c.fillStyle = "#555"; c.beginPath(); c.ellipse(90, 74, 22, 6, 0, 0, TAU); c.fill();
        c.fillStyle = "#ff7a59"; c.font = "bold 13px sans-serif"; c.fillText("COOKING!", 6, 14);
      } else if (kind === 1) { // weather
        c.fillStyle = "#4a90e2"; c.fillRect(0, 0, w, h);
        c.fillStyle = "#5cc84a"; c.beginPath(); c.ellipse(60, 60, 40, 26, 0.3, 0, TAU); c.fill();
        c.fillStyle = "#ffd23f"; c.beginPath(); c.arc(40, 45, 10, 0, TAU); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(80, 60, 10, 0, TAU); c.arc(92, 58, 12, 0, TAU); c.fill();
        c.font = "bold 16px sans-serif"; c.fillText("24°", 92, 92);
      } else { // a cartoon
        c.fillStyle = "#ffd6e6"; c.fillRect(0, 0, w, h);
        c.fillStyle = "#ff6fa5"; c.beginPath(); c.arc(64, 54, 26, 0, TAU); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(55, 48, 7, 0, TAU); c.arc(73, 48, 7, 0, TAU); c.fill();
        c.fillStyle = "#222"; c.beginPath(); c.arc(56, 49, 3, 0, TAU); c.arc(74, 49, 3, 0, TAU); c.fill();
        c.strokeStyle = "#222"; c.lineWidth = 2; c.beginPath(); c.arc(64, 60, 9, 0.2, PI - 0.2); c.stroke();
      }
      // old TV scan lines
      c.fillStyle = "rgba(0,0,0,0.08)"; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    });
  }

  // The painted view out of the window: sky, hills, trees and other houses.
  function windowView() {
    return canvasTexture(256, 224, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#5cb8f5"); gr.addColorStop(1, "#d6f0ff");
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = "#fff6c2"; c.beginPath(); c.arc(200, 40, 18, 0, TAU); c.fill();
      c.fillStyle = "#8fd36a"; c.beginPath(); c.ellipse(60, h, 120, 70, 0, PI, 0); c.fill();
      c.fillStyle = "#7cc85a"; c.beginPath(); c.ellipse(210, h, 110, 60, 0, PI, 0); c.fill();
      const housesAt = [[30, "#ffe0ec", "#b58cff"], [110, "#fff1dc", "#e2574c"], [180, "#dff3ff", "#4a90e2"]];
      for (const [x, wall, roof] of housesAt) {
        c.fillStyle = wall; c.fillRect(x, h - 80, 46, 40);
        c.fillStyle = roof; c.beginPath(); c.moveTo(x - 6, h - 80); c.lineTo(x + 23, h - 104); c.lineTo(x + 52, h - 80); c.fill();
        c.fillStyle = "#ffe9a8"; c.fillRect(x + 8, h - 70, 10, 10); c.fillRect(x + 28, h - 70, 10, 10);
      }
      c.fillStyle = "#4fbf47";
      for (const x of [90, 160, 240, 10]) { c.fillStyle = "#9a6a3c"; c.fillRect(x - 3, h - 50, 6, 20); c.fillStyle = "#4fbf47"; c.beginPath(); c.arc(x, h - 58, 16, 0, TAU); c.fill(); }
    });
  }
  function cloudStrip() {
    return canvasTexture(256, 64, (c) => {
      c.fillStyle = "rgba(255,255,255,0.95)";
      for (const [x, y] of [[40, 30], [150, 22], [220, 38]]) { c.beginPath(); c.arc(x, y, 12, 0, TAU); c.arc(x + 14, y - 5, 14, 0, TAU); c.arc(x + 28, y, 10, 0, TAU); c.fill(); }
    }, [1, 1]);
  }

  function buildHome(opts) {
    const record = (opts && opts.record) || { name: "Mii", home: root.MiiHomes ? root.MiiHomes.starterHome() : { items: {} } };
    const items = resolveItems(record);
    const ctx = { anim: [], record };
    const anim = ctx.anim;
    const rootG = new THREE.Group();
    addLights(rootG, { sky: 0xfff6e8, ground: 0xd9c7a8, hemi: 0.5, sun: 0.62, ambient: 0.26, fill: 0.32 });
    skyDome(rootG, 0x4fb0f2, 0xd6f0ff, 0x9fd47f);
    const RX = ROOM.x, RZ = ROOM.z, RH = ROOM.h;

    // ---------- outside: a garden around the dollhouse ----------
    const grassTex = canvasTexture(128, 128, (c, w, h) => {
      c.fillStyle = "#86d65e"; c.fillRect(0, 0, w, h);
      const r = seeded(5);
      for (let i = 0; i < 60; i++) { c.fillStyle = r() < 0.5 ? "rgba(70,150,45,0.45)" : "rgba(180,240,130,0.5)"; c.fillRect(r() * w, r() * h, 2, 6); }
    }, [50, 50]);
    disc(rootG, toon(0xffffff, { map: grassTex }), 0, -0.3, 0, 140, { receive: true });
    block(rootG, 0xf3e6d2, 0, -0.17, 0, RX * 2 + 1.2, 0.3, RZ * 2 + 1.2, 0.1);
    const outR = seeded(9);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + 0.2, d = 14 + outR() * 8;
      farTree(rootG, Math.cos(a) * d * 1.2, Math.sin(a) * d, 0.9 + outR() * 0.4, i % 4 === 0 ? [0xff9ec7, 0xffc3dc] : [0x5cc84a, 0x7fdc5c]);
    }
    const hc = [[0xfff1dc, 0xe2574c], [0xdff3ff, 0x4a90e2], [0xffe0ec, 0xb58cff], [0xeaffd9, 0xff8a4c]];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.6, d = 30;
      house(rootG, Math.cos(a) * d * 1.2, Math.sin(a) * d, -a - PI / 2, { w: 5, d: 4, h: 2.8, rh: 2, wall: hc[i % 4][0], roof: hc[i % 4][1], s: 1.2 });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, r = 90 + (i % 3) * 10, s = 26 + (i % 4) * 5;
      put(rootG, G.lowSphere(), toon(i % 2 ? 0x7fcf5a : 0x6cc24a), { x: Math.cos(a) * r, y: -s * 0.45, z: Math.sin(a) * r, sx: s, sy: s * 0.7, sz: s * 0.7, shadow: false, receive: false });
    }
    const cloudMat = toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 });
    const clouds = [];
    for (let i = 0; i < 6; i++) clouds.push({ c: cloud(rootG, cloudMat, 0, 18 + (i % 3) * 4, 0, 1), a: (i / 6) * TAU, r: 50 + (i % 2) * 15 });
    anim.push((t) => clouds.forEach((q) => { const a = q.a + t * 0.008; q.c.position.set(Math.cos(a) * q.r, q.c.position.y, Math.sin(a) * q.r); }));

    // ---------- the room: floor, walls, window, door ----------
    const wallIt = items.wallpaper || {}, floorIt = items.floor || {};
    const wallTex = patternTexture(wallIt, false);
    const floorTex = patternTexture(floorIt, true);
    const wallMat = toon(0xffffff, { map: wallTex });
    const floorMat = toon(0xffffff, { map: floorTex });
    put(rootG, patchGeo(RX * 2, RZ * 2, 0, 0), floorMat, { y: 0.005, rx: -PI / 2, shadow: false });
    const dark = wallIt.id === "wall-dark", fancy = wallIt.id === "wall-gold";
    const trimC = dark ? 0x4a4570 : fancy ? 0xd9a441 : 0xffffff;
    const shellC = 0xf6efe4;

    // Builds one wall in its own group. The group is turned so its local +z points
    // into the room and local x runs along the wall. hole = { u0, u1, v0, v1 }.
    // (The outer group stays at the origin: merging bakes in each shape's final
    // position, so the group the merged shape goes into must not move it again.)
    function wall(px, pz, ry, len, hole) {
      const outer = group(rootG);
      const g = group(outer, px, 0, pz, ry);
      g.userData.outer = outer;
      const T = 0.3;
      const pieces = [];
      if (!hole) pieces.push([-len / 2, len / 2, 0, RH]);
      else {
        pieces.push([-len / 2, hole.u0, 0, RH], [hole.u1, len / 2, 0, RH]);
        if (hole.v0 > 0) pieces.push([hole.u0, hole.u1, 0, hole.v0]);
        pieces.push([hole.u0, hole.u1, hole.v1, RH]);
      }
      for (const [u0, u1, v0, v1] of pieces) {
        const w = u1 - u0, h = v1 - v0;
        put(g, patchGeo(w, h, u0 + len / 2, v0), wallMat, { x: (u0 + u1) / 2, y: (v0 + v1) / 2, z: 0.005, shadow: false });
        // the outside of the wall, a little wider so the corners close up
        const ext = (u0 <= -len / 2 + 0.01 ? T : 0) + (u1 >= len / 2 - 0.01 ? T : 0);
        const shift = (u0 <= -len / 2 + 0.01 ? -T / 2 : 0) + (u1 >= len / 2 - 0.01 ? T / 2 : 0);
        put(g, G.box(), toon(shellC), { x: (u0 + u1) / 2 + shift, y: (v0 + v1) / 2, z: -T / 2 - 0.002, sx: w + ext, sy: h, sz: T, shadow: false });
      }
      // skirting board along the bottom and a trim along the top
      const skirts = hole && hole.v0 === 0 ? [[-len / 2, hole.u0], [hole.u1, len / 2]] : [[-len / 2, len / 2]];
      for (const [a, b] of skirts) block(g, trimC, (a + b) / 2, 0.14, 0.04, b - a, 0.28, 0.08, 0.02, { shadow: false });
      block(g, trimC, 0, RH + 0.06, -T / 2, len + 2 * T + 0.02, 0.12, T + 0.14, 0.03, { shadow: false });
      block(g, trimC, 0, RH - 0.1, 0.03, len, 0.14, 0.06, 0.02, { shadow: false });
      return g;
    }
    const winHole = { u0: WINDOW.x - WINDOW.w / 2, u1: WINDOW.x + WINDOW.w / 2, v0: WINDOW.y0, v1: WINDOW.y1 };
    const backWall = wall(0, -RZ, 0, RX * 2, winHole);
    const frontWall = wall(0, RZ, PI, RX * 2, null);
    const leftWall = wall(-RX, 0, PI / 2, RZ * 2, null);
    const rightWall = wall(RX, 0, -PI / 2, RZ * 2, { u0: DOOR.z - DOOR.w / 2, u1: DOOR.z + DOOR.w / 2, v0: 0, v1: DOOR.h });

    // the window: painted view, clouds drifting past, frame, sill and curtains
    {
      const wx = WINDOW.x, wy = (WINDOW.y0 + WINDOW.y1) / 2, ww = WINDOW.w, wh = WINDOW.y1 - WINDOW.y0;
      plane(backWall, ww, wh, basic(windowView()), { x: wx, y: wy, z: -0.22 });
      const cl = cloudStrip();
      dynamic(plane(backWall, ww, wh * 0.4, basic(cl, { transparent: true, depthWrite: false }), { x: wx, y: wy + wh * 0.28, z: -0.2 }));
      anim.push((t) => { cl.offset.x = (t * 0.01) % 1; });
      // the sides of the hole
      block(backWall, trimC, wx, WINDOW.y0 - 0.04, -0.1, ww + 0.3, 0.12, 0.3, 0.02, { shadow: false });
      block(backWall, trimC, wx, WINDOW.y1 + 0.04, -0.1, ww + 0.3, 0.12, 0.3, 0.02, { shadow: false });
      for (const s of [-1, 1]) block(backWall, trimC, wx + s * (ww / 2 + 0.04), wy, -0.1, 0.12, wh + 0.2, 0.3, 0.02, { shadow: false });
      block(backWall, trimC, wx, wy, -0.12, 0.08, wh, 0.06, 0.02, { shadow: false });
      block(backWall, trimC, wx, wy, -0.12, ww, 0.08, 0.06, 0.02, { shadow: false });
      block(backWall, trimC, wx, WINDOW.y0 - 0.06, 0.15, ww + 0.5, 0.1, 0.35, 0.03); // sill
      cylinder(backWall, 0xe0784a, wx + 0.8, WINDOW.y0 + 0.1, 0.15, 0.12, 0.2);
      ball(backWall, 0xff6fa5, wx + 0.8, WINDOW.y0 + 0.3, 0.15, 0.13);
      cylinder(backWall, 0xb98a5e, wx, WINDOW.y1 + 0.25, 0.15, 0.03, ww + 1.2, { rz: PI / 2 });
      const curtainC = dark ? 0x7a5aff : fancy ? 0xd9a441 : 0xff9ec7;
      for (const s of [-1, 1]) {
        put(backWall, G.capsule(), toon(curtainC), { x: wx + s * (ww / 2 + 0.25), y: wy - 0.05, z: 0.15, sx: 0.4, sy: (wh + 0.3) / 2, sz: 0.14 });
        put(backWall, G.torus(0.12, 0.025), toon(trimC), { x: wx + s * (ww / 2 + 0.25), y: wy - 0.3, z: 0.15 });
      }
    }
    // the front door (on the right wall, near the front)
    {
      const g = rightWall;
      block(g, 0x9a6a3c, DOOR.z, DOOR.h / 2, -0.12, DOOR.w - 0.05, DOOR.h - 0.02, 0.1, 0.04);
      block(g, 0xb57d4a, DOOR.z, DOOR.h * 0.72, -0.06, DOOR.w - 0.35, DOOR.h * 0.32, 0.03, 0.03);
      block(g, 0xb57d4a, DOOR.z, DOOR.h * 0.28, -0.06, DOOR.w - 0.35, DOOR.h * 0.36, 0.03, 0.03);
      ball(g, 0xffcf5a, DOOR.z - DOOR.w / 2 + 0.2, DOOR.h * 0.48, -0.02, 0.07);
      block(g, trimC, DOOR.z, DOOR.h + 0.06, 0.02, DOOR.w + 0.3, 0.12, 0.1, 0.02, { shadow: false });
      for (const s of [-1, 1]) block(g, trimC, DOOR.z + s * (DOOR.w / 2 + 0.06), DOOR.h / 2, 0.02, 0.12, DOOR.h, 0.1, 0.02, { shadow: false });
      block(g, 0x4a90e2, DOOR.z, 0.015, 0.7, 1.2, 0.03, 0.8, 0.02, { shadow: false }); // doormat
      // coat hooks with a scarf and a hat
      block(g, 0x9a6a3c, DOOR.z - 1.35, 2.0, 0.04, 0.8, 0.12, 0.06, 0.03);
      put(g, G.capsule(), toon(0xff5a64), { x: DOOR.z - 1.5, y: 1.6, z: 0.1, sx: 0.12, sy: 0.6, sz: 0.06 });
      ball(g, 0x4a90e2, DOOR.z - 1.15, 1.85, 0.14, 0.18, { sy: 0.6 });
    }
    // a clock on the left wall, above the sofa
    {
      const clock = group(leftWall, -1.6, 3.6, 0.06);
      cylinder(clock, 0xffffff, 0, 0, 0, 0.42, 0.08, { rx: PI / 2 });
      put(clock, G.torus(0.42, 0.05), toon(dark ? 0xff4fd8 : 0xff8a7a), {});
      const hh = dynamic(group(clock, 0, 0, 0.05)), mh = dynamic(group(clock, 0, 0, 0.06));
      block(hh, 0x333333, 0, 0.11, 0, 0.05, 0.24, 0.02, 0.02);
      block(mh, 0x333333, 0, 0.16, 0, 0.035, 0.34, 0.02, 0.015);
      anim.push(() => {
        const now = new Date();
        hh.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU;
        mh.rotation.z = -(now.getMinutes() + now.getSeconds() / 60) / 60 * TAU;
      });
    }
    // a bedside table (always there, the lava lamp sits on it)
    {
      const p = SLOT_PLACES.lamp;
      const ns = group(rootG, p.x, 0, p.z);
      block(ns, 0xc98b4a, 0, 0.36, 0, 0.75, 0.72, 0.65, 0.06);
      block(ns, 0xe0a868, 0, 0.42, 0.33, 0.6, 0.25, 0.02, 0.03);
      ball(ns, 0xffcf5a, 0, 0.42, 0.36, 0.04);
      if (items.lamp.id !== "lamp-lava") {
        block(ns, 0xff8a7a, -0.12, 0.85, 0.05, 0.3, 0.26, 0.15, 0.06); // alarm clock
        disc(ns, toon(0xffffff), -0.12, 0.85, 0.13, 0.09, { rx: 0 });
        block(ns, 0x4a90e2, 0.2, 0.76, -0.05, 0.25, 0.06, 0.32, 0.02); // a book
      }
    }

    // ---------- furniture ----------
    const obstacles = [
      { x: 0, z: -RZ - 0.25, w: RX * 2 + 1, d: 0.5 }, { x: 0, z: RZ + 0.25, w: RX * 2 + 1, d: 0.5 },
      { x: -RX - 0.25, z: 0, w: 0.5, d: RZ * 2 + 1 }, { x: RX + 0.25, z: 0, w: 0.5, d: RZ * 2 + 1 },
      { x: SLOT_PLACES.lamp.x, z: SLOT_PLACES.lamp.z, w: 0.8, d: 0.75 }, // bedside table
    ];
    const spots = [];
    const order = ["rug", "bed", "sofa", "table", "tv", "lamp", "plant", "art", "special"];
    for (const slot of order) {
      const it = items[slot];
      if (!it) continue;
      const def = FURNITURE[it.id];
      if (!def) continue;
      const base = SLOT_PLACES[slot];
      const place = def.at ? { x: def.at.x, z: def.at.z, ry: def.at.ry || 0 } : base;
      const g = group(rootG, place.x, slot === "art" ? 3.0 : 0, place.z + (slot === "art" ? 0.06 : 0), place.ry);
      def.build(g, ctx);
      for (const o of def.obs || []) {
        const p = toWorld(place, o.cx, o.cz);
        obstacles.push(o.r !== undefined ? { x: p.x, z: p.z, r: o.r } : { x: p.x, z: p.z, w: o.w, d: o.d, rot: -place.ry, item: it.id });
      }
      if (!it.use || !def.spot) continue;
      const u = it.use;
      const sp = def.spot;
      const at = sp.wx !== undefined ? { x: sp.wx, z: sp.wz } : toWorld(place, sp.lx, sp.lz);
      let yaw;
      if (sp.toward) {
        const tgt = sp.toward === true ? { x: place.x, z: place.z } : toWorld(place, sp.toward.lx, sp.toward.lz);
        yaw = Math.atan2(tgt.x - at.x, tgt.z - at.z);
      } else yaw = (sp.wx !== undefined ? 0 : place.ry) + sp.yaw;
      const spot = {
        x: at.x, z: at.z, yaw, emoji: u.emoji, activity: u.activity, lines: u.lines.slice(),
        itemId: it.id, slot,
      };
      if (u.arms) spot.arms = u.arms;
      if (u.lookUp) spot.lookUp = u.lookUp;
      if (u.sit && def.seat) {
        const s = toWorld(place, def.seat.lx, def.seat.lz);
        spot.seat = { x: s.x, z: s.z, y: def.seat.h - 0.56 };
        spot.yaw = place.ry; // sit facing the way the seat faces
      }
      if (u.lie && def.lie) {
        const s = toWorld(place, def.lie.lx, def.lie.lz);
        spot.lie = { x: s.x, z: s.z, y: def.lie.h, yaw: place.ry + def.lie.yaw };
      }
      if (u.run && def.stand) {
        const s = toWorld(place, def.stand.lx, def.stand.lz);
        spot.stand = { x: s.x, z: s.z, y: def.stand.h };
        spot.run = true;
      }
      spots.push(spot);
    }
    spots.push({
      x: WINDOW.x, z: -RZ + 1.25, yaw: PI, emoji: "🪟", activity: "gazing out of the window", slot: "window", lookUp: 0.1,
      lines: ["What a nice view!", "I can see the park from here.", "Is it going to rain?", "*sigh* So peaceful."],
    });

    // hide any wall that's between the camera and the room (like a dollhouse)
    const walls = [
      { group: backWall.userData.outer, axis: "z", at: -RZ, outside: -1 },
      { group: frontWall.userData.outer, axis: "z", at: RZ, outside: 1 },
      { group: leftWall.userData.outer, axis: "x", at: -RX, outside: -1 },
      { group: rightWall.userData.outer, axis: "x", at: RX, outside: 1 },
    ];
    for (const w of walls) { mergeStatic(w.group); dynamic(w.group); }
    mergeStatic(rootG);

    const name = record.name || "I";
    return {
      group: rootG,
      background: 0xd6f0ff,
      fog: [0xd8f0ff, 45, 160],
      cameraTilt: 0.85,
      cameraTargetY: 1.9,
      isHome: true,
      bounds: { minX: -RX, maxX: RX, minZ: -RZ, maxZ: RZ },
      water: [],
      obstacles,
      spots,
      playerSpot: { x: 0, z: 3.1 },
      lines: [
        "Home sweet home!", "I love my room!", "Make yourself at home!", "Want some tea?",
        "I should tidy up a bit...", "It's so cosy in here.", "Welcome to " + (name === "I" ? "my" : name + "'s") + " place!",
        "La la la~", "What should I do today?", "Shoes off, please!",
      ],
      update(t, camera) {
        anim.forEach((a) => a(t));
        if (camera) {
          for (const w of walls) {
            const c = w.axis === "z" ? camera.position.z : camera.position.x;
            w.group.visible = (c - w.at) * w.outside < 0;
          }
        }
      },
    };
  }

  root.World3D.addPlace({ id: "apartments", name: "Apartments", icon: "🏘️" }, buildApartments);
  root.World3D.addPlace({ id: "home", name: "Home", icon: "🏠" }, buildHome, true);
  // for tests and other files
  root.MiiHomes3D = { FURNITURE, SLOT_PLACES, unitInfo, APT, floorsFor, MAX_FLOORS };
})(typeof self !== "undefined" ? self : this);
