/*
 * places-town.js
 * Two more places for Miis to hang out in around town:
 *
 *   "school"  a cheerful school classroom (a "dollhouse" like the office: the
 *             wall nearest the camera hides itself so you can see inside).
 *             Desks, a blackboard, a reading corner, a science corner, an art
 *             corner, a piano and a class hamster. Out of the windows you can
 *             see the schoolyard, a playground, the sports field and the town.
 *   "stage"   an outdoor concert in the park at golden hour: a big stage with
 *             coloured spotlights, a drum kit, a keyboard and a mic, a big
 *             screen, food stands, benches, string lights and confetti.
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

  // A plain (sharp-cornered) box: lighter than a rounded block, good for small things.
  function bx(p, color, x, y, z, w, h, d, o) {
    return put(p, G.box(), typeof color === "object" ? color : toon(color), Object.assign({ x, y, z, sx: w, sy: h, sz: d }, o));
  }
  // A material that ignores the lights (for screens and glowing things).
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
  function star(ctx, x, y, r, points) {
    ctx.beginPath();
    for (let i = 0; i < (points || 5) * 2; i++) {
      const a = -PI / 2 + (i * PI) / (points || 5), rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
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
  // A tiny smiling Mii-ish face (for drawings and posters).
  function smiley(ctx, x, y, r, skin, hair) {
    ctx.fillStyle = skin || "#ffd9b0"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = hair || "#5a3a22"; ctx.beginPath(); ctx.arc(x, y - r * 0.25, r * 1.02, PI * 1.05, PI * 1.95); ctx.fill();
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x - r * 0.35, y + r * 0.05, r * 0.11, 0, TAU); ctx.arc(x + r * 0.35, y + r * 0.05, r * 0.11, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = Math.max(2, r * 0.1); ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.35, 0.2, PI - 0.2); ctx.stroke();
    ctx.fillStyle = "rgba(255,120,120,0.5)"; ctx.beginPath(); ctx.arc(x - r * 0.6, y + r * 0.35, r * 0.15, 0, TAU); ctx.arc(x + r * 0.6, y + r * 0.35, r * 0.15, 0, TAU); ctx.fill();
  }
  function text(ctx, str, x, y, size, color, align) {
    ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    ctx.font = "bold " + size + "px 'Nunito', sans-serif";
    ctx.fillText(str, x, y);
  }

  // ---------- one big picture with lots of little pictures on it ----------
  // Posters, signs and paintings all share ONE picture (an "atlas"), so the
  // computer can draw every one of them in a single go.
  //   cells = { name: [width, height, draw(ctx, w, h)] } in pixels
  function makeAtlas(size, cells, height) {
    const H = height || size;
    const c = document.createElement("canvas");
    c.width = size; c.height = H;
    const ctx = c.getContext("2d");
    const rects = {};
    const GAP = 4;
    let x = 0, y = 0, rowH = 0;
    for (const name of Object.keys(cells)) {
      const [w, h, draw] = cells[name];
      if (x + w > size) { x = 0; y += rowH + GAP; rowH = 0; }
      rects[name] = { x, y, w, h };
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      draw(ctx, w, h);
      ctx.restore();
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }
    if (y + rowH > H) console.warn("places-town: atlas is too small");
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    const mat = toon(0xffffff, { map: tex });
    // makes a geometry show one of the little pictures
    function fit(name, geo) {
      const r = rects[name];
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const u = (r.x + 1 + uv.getX(i) * (r.w - 2)) / size;
        const v = 1 - (r.y + 1 + (1 - uv.getY(i)) * (r.h - 2)) / H;
        uv.setXY(i, u, v);
      }
      return geo;
    }
    // a flat picture (faces +z unless turned)
    function pic(p, name, w, h, o, material) {
      return put(p, fit(name, new THREE.PlaneGeometry(w, h)), material || mat, Object.assign({ shadow: false }, o));
    }
    return { tex, mat, pic, fit };
  }

  // ---------- "painted" models: many colours, ONE shape, ONE draw call ----------
  const gradientMap = toon(0xffffff).gradientMap;
  const paintMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, vertexColors: true });

  function bakeGeo(build) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    const geos = [];
    const col = new THREE.Color();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!src.attributes.normal) src.computeVertexNormals();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", src.attributes.position);
      geo.setAttribute("normal", src.attributes.normal);
      geo.applyMatrix4(o.matrixWorld);
      col.copy(o.material.color);
      if (o.material.emissive && o.material.emissiveIntensity && o.material.emissive.getHex()) col.lerp(new THREE.Color(1, 1, 1), 0.3);
      const n = geo.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b; }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      geos.push(geo);
    });
    return THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
  }
  // list = [[geometry, items, brightness], ...]; items like scatter's { x, y, z, s, sx, sy, sz, ry, color }
  function bakeCopies(list) {
    const c = new THREE.Color();
    return bakeGeo((g) => list.forEach(([geo, items, bright]) => items.forEach((it) => {
      c.set(it.color === undefined ? 0xffffff : it.color).multiplyScalar(bright === undefined ? 1 : bright);
      put(g, geo, toon(c.getHex()), {
        x: it.x, y: it.y || 0, z: it.z, rx: it.rx || 0, ry: it.ry || 0, rz: it.rz || 0,
        sx: it.sx || it.s || 1, sy: it.sy || it.s || 1, sz: it.sz || it.s || 1,
      });
    })));
  }
  function painted(parent, geo, o) {
    return put(parent, geo, paintMat, Object.assign({ shadow: false, receive: false }, o));
  }
  // Builds something that moves as one piece and merges its parts, so it's quick to draw.
  function movingThing(parent, x, y, z, build) {
    const g = new THREE.Group();
    build(g);
    mergeStatic(g);
    g.position.set(x, y, z);
    parent.add(g);
    return dynamic(g);
  }
  // Copies of one shape far away: always drawn, never in shadow.
  function farScatter(parent, geo, mat, items) {
    const m = scatter(parent, geo, mat, items, false);
    m.receiveShadow = false;
    m.frustumCulled = false;
    return m;
  }
  // a two-sided triangle (for flags and bunting)
  function triangleGeo(pts) {
    const g = new THREE.BufferGeometry();
    const [a, b, c] = [pts.slice(0, 3), pts.slice(3, 6), pts.slice(6, 9)];
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
    g.computeVertexNormals();
    return g;
  }
  // one box with its bottom at 0, so "sy" is simply the height
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // a pyramid roof (square base of size 1, bottom at 0)
  const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(PI / 4).translate(0, 0.5, 0);
  const lowCyl = new THREE.CylinderGeometry(1, 1, 1, 7).translate(0, 0.5, 0);

  // ---------- clouds ----------
  const cloudGeo = bakeGeo((g) => {
    const puff = (x, y, z, s, o) => put(g, G.lowSphere(), toon(0xffffff), Object.assign({ x, y, z, s }, o));
    puff(0, 0, 0, 2.2); puff(2.2, -0.4, 0.3, 1.6); puff(-2.1, -0.5, 0, 1.5); puff(0.6, 1.1, 0, 1.4); puff(-0.9, 0.7, 0.6, 1.2);
    puff(0, -0.9, 0, 3.2, { sy: 0.6, sz: 0.5 });
  });
  // a slowly turning ring of clouds all the way round the sky
  function cloudRing(parent, anim, mat, o) {
    const r = seeded(o.seed || 1);
    const items = [];
    for (let i = 0; i < o.count; i++) {
      const a = ((i + r() * 0.7) / o.count) * TAU;
      const d = o.rMin + r() * (o.rMax - o.rMin);
      const s = o.sMin + r() * (o.sMax - o.sMin);
      items.push({ x: Math.cos(a) * d, y: o.yMin + r() * (o.yMax - o.yMin), z: Math.sin(a) * d, s, sy: s * (0.75 + r() * 0.3), ry: -a + PI / 2 });
    }
    const ring = dynamic(farScatter(parent, cloudGeo, mat, items));
    anim.push((t) => { ring.rotation.y = (o.start || 0) + t * o.speed; });
    return ring;
  }

  // Rows of windows painted onto any box, using where the box is in the world
  // (so tall and short buildings get the same size windows). Some are lit up.
  function windowMaterial(o) {
    const mat = new THREE.MeshToonMaterial({ color: o.color || 0xffffff, gradientMap });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.winSize = { value: new THREE.Vector2(o.w || 2.4, o.h || 3.4) };
      sh.uniforms.winGlass = { value: new THREE.Color(o.glass || 0x8fd0ff) };
      sh.uniforms.winLit = { value: new THREE.Color(o.lit || 0xfff1a8) };
      sh.uniforms.winLitAmt = { value: o.litAmount || 0.13 };
      sh.vertexShader = "varying vec3 vWinPos;\nvarying vec3 vWinN;\n" + sh.vertexShader.replace("#include <project_vertex>", [
        "#include <project_vertex>",
        "vec4 winP = vec4(transformed, 1.0);",
        "vec3 winN = objectNormal;",
        "#ifdef USE_INSTANCING",
        "  winP = instanceMatrix * winP;",
        "  winN = mat3(instanceMatrix) * winN;",
        "#endif",
        "vWinPos = (modelMatrix * winP).xyz;",
        "vWinN = normalize(mat3(modelMatrix) * winN);",
      ].join("\n"));
      sh.fragmentShader = "uniform vec2 winSize;\nuniform vec3 winGlass;\nuniform vec3 winLit;\nuniform float winLitAmt;\nvarying vec3 vWinPos;\nvarying vec3 vWinN;\n" +
        sh.fragmentShader.replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "float winAmt = 0.0;",
          "vec3 winCol = winGlass;",
          "if (abs(vWinN.y) < 0.5) {",
          "  float u = abs(vWinN.x) > abs(vWinN.z) ? vWinPos.z : vWinPos.x;",
          "  vec2 cell = vec2(u, vWinPos.y) / winSize;",
          "  vec2 f = fract(cell);",
          "  winAmt = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.8);",
          "  float rnd = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);",
          "  winCol = rnd < winLitAmt ? winLit : mix(winGlass, vec3(1.0), f.y * 0.35);",
          "  diffuseColor.rgb = mix(diffuseColor.rgb, winCol, winAmt);",
          "}",
        ].join("\n")).replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += winCol * winAmt * 0.35;");
    };
    return mat;
  }

  // Grass picture (repeats over the ground).
  function grassTexture(repeat, base, seed) {
    return canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = base || "#86d65e"; ctx.fillRect(0, 0, w, h);
      const r = seeded(seed || 12);
      for (let i = 0; i < 150; i++) {
        const x = r() * w, y = r() * h;
        ctx.strokeStyle = r() < 0.5 ? "rgba(60,140,40,0.45)" : "rgba(190,245,140,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 6); ctx.moveTo(x + 3, y); ctx.lineTo(x + 4, y - 7); ctx.stroke();
      }
    }, repeat);
  }
  // Wooden floorboards.
  function planksTexture(repeat, shades) {
    return canvasTexture(256, 256, (ctx, w, h) => {
      const r = seeded(31);
      for (let row = 0; row < 8; row++) {
        let x = -r() * 140;
        while (x < w) {
          const len = 90 + r() * 90;
          ctx.fillStyle = shades[Math.floor(r() * shades.length)];
          ctx.fillRect(x, row * 32, len, 32);
          ctx.fillStyle = "rgba(110,60,25,0.35)"; ctx.fillRect(x, row * 32, 2, 32);
          ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x + 4, row * 32 + 4, len - 8, 3);
          x += len;
        }
        ctx.fillStyle = "rgba(110,60,25,0.32)"; ctx.fillRect(0, row * 32 + 30, w, 2);
      }
    }, repeat);
  }
  // Window glass: almost clear with soft streaks of shine.
  function glassMaterial() {
    const tex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "rgba(205,235,255,0.10)"; ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.rotate(-0.7); ctx.translate(-w / 2, -h / 2);
      const streak = (x, sw, a) => {
        const g = ctx.createLinearGradient(x - sw, 0, x + sw, 0);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255," + a + ")"); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(x - sw, -h, sw * 2, h * 3);
      };
      streak(w * 0.3, 13, 0.34); streak(w * 0.47, 5, 0.26); streak(w * 0.82, 9, 0.16);
      ctx.restore();
    });
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  }

  // A sagging line between two points (for string lights and bunting).
  function sagLine(a, b, sag, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - Math.sin(k * PI) * sag, a.z + (b.z - a.z) * k));
    }
    return pts;
  }
  // a thin cable through a list of points (one cylinder per segment)
  function cable(p, mat, pts, r) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      const m = put(p, G.cyl(5), mat, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, sx: r, sy: len, sz: r, shadow: false });
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
  }

  // ---------- the town far away (houses, trees, hills, all baked in one go) ----------
  // o = { seed, houses: [count, rMin, rMax], trees: [count, rMin, rMax], hills: [count, r], keepOut(x, z), dim }
  function farTown(root, o) {
    const rnd = seeded(o.seed || 9);
    const bodies = [], roofs = [], doors = [], wins = [], trunks = [], crowns = [], hills = [];
    const pastel = [0xfff1dc, 0xffe2b8, 0xffd0c0, 0xd8ecff, 0xdff3c8, 0xffe8f0, 0xf1e4ff, 0xfff6c0];
    const roofC = [0xe2574c, 0x4fa3d9, 0xff9a3a, 0x7a8cff, 0x5cb85c, 0xe86a9a, 0x9a6a3c];
    const keep = (x, z) => !o.keepOut || !o.keepOut(x, z);
    const [nH, hMin, hMax] = o.houses || [0, 0, 0];
    let tries = 0;
    for (let i = 0; i < nH && tries < nH * 20; tries++) {
      const a = rnd() * TAU, d = hMin + rnd() * (hMax - hMin);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!keep(x, z)) continue;
      // not too close to another house
      if (bodies.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
      i++;
      const w = 4.5 + rnd() * 3, dd = 4 + rnd() * 2.5, h = 3.2 + rnd() * 2.6;
      const ry = Math.atan2(-x, -z); // facing the middle of the town
      const color = pastel[Math.floor(rnd() * pastel.length)];
      bodies.push({ x, z, sx: w, sy: h, sz: dd, ry, color });
      roofs.push({ x, y: h, z, sx: w * 1.12, sy: 1.6 + rnd() * 1.4, sz: dd * 1.12, ry, color: roofC[Math.floor(rnd() * roofC.length)] });
      const c = Math.cos(ry), s = Math.sin(ry);
      const at = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
      const dp = at(0, dd / 2 + 0.02);
      doors.push({ x: dp.x, y: 0, z: dp.z, sx: 0.9, sy: 1.7, sz: 0.1, ry, color: 0x9a6a3c });
      for (const sx of [-1, 1]) {
        const wp = at(sx * w * 0.28, dd / 2 + 0.03);
        wins.push({ x: wp.x, y: h * 0.45, z: wp.z, sx: 0.9, sy: 0.9, sz: 0.1, ry, color: rnd() < 0.3 ? 0xffe9a0 : 0x9fd0f0 });
      }
    }
    const [nT, tMin, tMax] = o.trees || [0, 0, 0];
    tries = 0;
    for (let i = 0; i < nT && tries < nT * 20; tries++) {
      const a = rnd() * TAU, d = tMin + rnd() * (tMax - tMin);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!keep(x, z) || bodies.some((b) => Math.hypot(b.x - x, b.z - z) < 4.5)) continue;
      i++;
      const s = 0.8 + rnd() * 0.7;
      const color = (o.treeColors || [0x5cc84a, 0x4fb043, 0x6fcf55, 0xff9ec7])[Math.floor(rnd() * (o.treeColors || [0, 0, 0, 0]).length)];
      trunks.push({ x, z, sx: 0.3 * s, sy: 2.4 * s, sz: 0.3 * s, color: 0x9a6a3c });
      crowns.push({ x, y: 3.2 * s, z, sx: 1.7 * s, sy: 1.6 * s, sz: 1.7 * s, color });
      if (rnd() < 0.6) crowns.push({ x: x + 0.5 * s, y: 4.1 * s, z: z + 0.3 * s, s: 1.1 * s, color });
    }
    const [nHill, hr] = o.hills || [0, 0];
    for (let i = 0; i < nHill; i++) {
      const a = (i / nHill) * TAU + rnd() * 0.15;
      const d = hr + rnd() * 25;
      const s = 22 + rnd() * 20;
      hills.push({ x: Math.cos(a) * d, y: -3, z: Math.sin(a) * d, sx: s * 1.7, sy: 18 + rnd() * 26, sz: s, ry: -a + PI / 2, color: (o.hillColors || [0x7cc062, 0x8fcf72])[i % 2] });
    }
    const dim = o.dim || 1;
    painted(root, bakeCopies([
      [unitBox, bodies, dim], [roofGeo, roofs, dim], [G.box(), doors.map((q) => Object.assign(q, { y: 0.85 })), dim], [G.box(), wins, dim],
      [lowCyl, trunks, dim], [G.tinySphere(), crowns, dim], [G.lowSphere(), hills, dim],
    ]));
  }

  // A cute little car shape (baked, for driving around).
  const carGeo = bakeGeo((c) => {
    put(c, G.rbox(1.5, 0.6, 2.8, 0.2), toon(0xffffff), { y: 0.55 });
    put(c, G.rbox(1.3, 0.55, 1.5, 0.2), toon(0xffffff), { y: 1.05, z: -0.15 });
    put(c, G.box(), toon(0x8fc8e8), { y: 1.05, z: -0.15, sx: 1.34, sy: 0.32, sz: 1.3 });
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.85, 0.85]) put(c, G.cyl(10), toon(0x2a2f38), { x: sx, y: 0.3, z: sz, sx: 0.3, sy: 0.2, sz: 0.3, rz: PI / 2 });
  });

  // =====================================================================
  // A wall with real window openings (for the school "dollhouse")
  // =====================================================================
  //   along:   the wall runs along "x" (back and front) or "z" (the sides)
  //   core:    where the middle of the wall is (it's 0.5 thick)
  //   inward:  +1 or -1, which side the room is on
  //   from/to: where the wall starts and ends
  //   openings: [{ c: middle, w: width, y0: bottom, y1: top, door: true/false }]
  function buildWall(g, s, along, core, inward, from, to, openings) {
    const face = core + inward * 0.25;
    const piece = (color, u0, u1, y0, y1, d, thick, r) => {
      const len = u1 - u0, h = y1 - y0;
      if (len <= 0.001 || h <= 0.001) return;
      const u = (u0 + u1) / 2, y = (y0 + y1) / 2;
      if (along === "x") block(g, color, u, y, d, len, h, thick, r);
      else block(g, color, d, y, u, thick, h, len, r);
    };
    const ops = openings.slice().sort((a, b) => a.c - b.c);
    const pad = along === "x" ? 0.5 : 0.25;
    const panelD = face + inward * 0.05, trimD = face + inward * 0.11;
    const PH = s.panelH;
    let u = from;
    const solid = (u0, u1) => {
      piece(s.wallC, u0, u1, 0, s.H, core, 0.5, 0.02);
      const p0 = Math.max(u0, from + pad), p1 = Math.min(u1, to - pad);
      piece(s.panelC, p0, p1, 0, PH, panelD, 0.12, 0.02);
      piece(s.trimC, p0, p1, PH - 0.02, PH + 0.12, trimD, 0.1, 0.03);
      piece(s.trimC, p0, p1, 0, 0.2, trimD, 0.1, 0.03);
      // a wooden rail along the top of the wall
      piece(s.topC, u0, u1, s.H - 0.02, s.H + 0.2, core, 0.62, 0.05);
    };
    for (const op of ops) {
      const a = op.c - op.w / 2, b = op.c + op.w / 2;
      solid(u, a);
      piece(s.wallC, a, b, op.y1, s.H, core, 0.5, 0.02);
      piece(s.topC, a, b, s.H - 0.02, s.H + 0.2, core, 0.62, 0.05);
      if (op.door) {
        piece(s.frameC, a, a + 0.2, 0, op.y1, core, 0.62, 0.03);
        piece(s.frameC, b - 0.2, b, 0, op.y1, core, 0.62, 0.03);
        piece(s.frameC, a, b, op.y1 - 0.1, op.y1 + 0.15, core, 0.62, 0.03);
      } else {
        piece(s.wallC, a, b, 0, op.y0, core, 0.5, 0.02);
        if (op.y0 > PH) {
          piece(s.panelC, a, b, 0, PH, panelD, 0.12, 0.02);
          piece(s.trimC, a, b, PH - 0.02, PH + 0.12, trimD, 0.1, 0.03);
        } else piece(s.panelC, a, b, 0, op.y0, panelD, 0.12, 0.02);
        piece(s.trimC, a, b, 0, 0.2, trimD, 0.1, 0.03);
        // frame: a deep sill, the top, the sides and the bars across
        piece(s.frameC, a - 0.15, b + 0.15, op.y0 - 0.1, op.y0 + 0.06, face + inward * 0.14, 0.85, 0.04);
        piece(s.frameC, a - 0.15, b + 0.15, op.y1 - 0.06, op.y1 + 0.14, core + inward * 0.05, 0.62, 0.03);
        piece(s.frameC, a - 0.15, a + 0.06, op.y0, op.y1, core + inward * 0.05, 0.62, 0.03);
        piece(s.frameC, b - 0.06, b + 0.15, op.y0, op.y1, core + inward * 0.05, 0.62, 0.03);
        if (op.w > 3) piece(s.frameC, op.c - 0.06, op.c + 0.06, op.y0, op.y1, core, 0.16, 0.02);
        if (op.y1 - op.y0 > 3.5) piece(s.frameC, a, b, op.y1 - 1.3, op.y1 - 1.18, core, 0.16, 0.02);
        put(g, new THREE.PlaneGeometry(op.w, op.y1 - op.y0), s.glass, {
          x: along === "x" ? op.c : core, y: (op.y0 + op.y1) / 2, z: along === "x" ? core : op.c,
          ry: along === "x" ? 0 : PI / 2, shadow: false, receive: false,
        });
      }
      u = b;
    }
    solid(u, to);
  }

  // =====================================================================
  // SCHOOL — a cheerful classroom
  // =====================================================================

  // the pictures for the school (posters, the blackboard, paintings...)
  function schoolAtlas() {
    return makeAtlas(1024, {
      blackboard: [1020, 330, (ctx, w, h) => {
        ctx.fillStyle = "#2f6b55"; ctx.fillRect(0, 0, w, h);
        const r = seeded(5);
        for (let i = 0; i < 45; i++) {
          ctx.fillStyle = "rgba(255,255,255," + (0.025 + r() * 0.04) + ")";
          ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 30 + r() * 90, 8 + r() * 20, r() * 3, 0, TAU); ctx.fill();
        }
        const chalk = "#f6f6ea";
        text(ctx, "Welcome, Class!", 230, 52, 50, chalk);
        ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(50, 86); ctx.quadraticCurveTo(230, 104, 410, 84); ctx.stroke();
        text(ctx, "1 + 1 = 2", 40, 140, 38, chalk, "left");
        text(ctx, "3 x 4 = 12", 40, 192, 38, chalk, "left");
        text(ctx, "7 + 5 = ?", 40, 244, 38, "#ffd36b", "left");
        text(ctx, "A  B  C", 300, 168, 44, "#9fe0ff", "left");
        text(ctx, "a  b  c", 306, 222, 38, "#ffb3d1", "left");
        // a sun
        ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(560, 80, 34, 0, TAU); ctx.stroke();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ctx.beginPath(); ctx.moveTo(560 + Math.cos(a) * 44, 80 + Math.sin(a) * 44); ctx.lineTo(560 + Math.cos(a) * 60, 80 + Math.sin(a) * 60); ctx.stroke(); }
        ctx.fillStyle = "#ffd36b"; ctx.beginPath(); ctx.arc(549, 74, 4, 0, TAU); ctx.arc(571, 74, 4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(560, 84, 14, 0.3, PI - 0.3); ctx.stroke();
        // a little house with a tree
        ctx.strokeStyle = chalk; ctx.lineWidth = 5;
        ctx.strokeRect(500, 190, 90, 70);
        ctx.beginPath(); ctx.moveTo(490, 192); ctx.lineTo(545, 145); ctx.lineTo(600, 192); ctx.stroke();
        ctx.strokeRect(532, 222, 26, 38);
        ctx.strokeStyle = "#8fe08a"; ctx.beginPath(); ctx.arc(640, 196, 28, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "#e0b080"; ctx.beginPath(); ctx.moveTo(640, 224); ctx.lineTo(640, 262); ctx.stroke();
        // a big smiling Mii face in chalk
        ctx.strokeStyle = chalk; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(800, 130, 70, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(800, 112, 74, PI * 1.08, PI * 1.92); ctx.stroke();
        ctx.fillStyle = chalk; ctx.beginPath(); ctx.arc(776, 128, 7, 0, TAU); ctx.arc(824, 128, 7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(800, 150, 28, 0.25, PI - 0.25); ctx.stroke();
        ctx.fillStyle = "#ff9ec7"; heart(ctx, 900, 50, 40);
        ctx.fillStyle = "#ffd36b"; star(ctx, 950, 180, 26); ctx.fill();
        star(ctx, 700, 60, 16); ctx.fill();
        text(ctx, "Homework: be kind!", 800, 262, 34, chalk);
        text(ctx, "+ have fun :)", 800, 304, 30, "#9fe0ff");
      }],
      alphabet: [1020, 64, (ctx, w, h) => {
        const cols = ["#ff6b6b", "#ffb84d", "#ffe15a", "#6fd36a", "#4fb7ff", "#a58cff", "#ff8ad8"];
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const cw = w / letters.length;
        for (let i = 0; i < letters.length; i++) {
          ctx.fillStyle = cols[i % cols.length];
          roundRect(ctx, i * cw + 2, 4, cw - 4, h - 8, 8); ctx.fill();
          text(ctx, letters[i] + letters[i].toLowerCase(), i * cw + cw / 2, h / 2 + 2, 26, "#ffffff");
        }
      }],
      readPoster: [200, 270, (ctx, w, h) => {
        ctx.fillStyle = "#4fb7ff"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff"; roundRect(ctx, 10, 10, w - 20, h - 20, 16); ctx.fill();
        text(ctx, "READING", w / 2, 46, 32, "#2f6f9f");
        text(ctx, "IS MAGIC!", w / 2, 82, 30, "#ff6b6b");
        // an open book with stars
        ctx.fillStyle = "#ffb84d";
        ctx.beginPath(); ctx.moveTo(30, 170); ctx.quadraticCurveTo(65, 150, 100, 172); ctx.lineTo(100, 232); ctx.quadraticCurveTo(65, 212, 30, 230); ctx.fill();
        ctx.fillStyle = "#ff8a5c";
        ctx.beginPath(); ctx.moveTo(170, 170); ctx.quadraticCurveTo(135, 150, 100, 172); ctx.lineTo(100, 232); ctx.quadraticCurveTo(135, 212, 170, 230); ctx.fill();
        ctx.fillStyle = "#ffe15a"; star(ctx, 70, 130, 16); ctx.fill(); star(ctx, 130, 118, 20); ctx.fill(); star(ctx, 100, 140, 10); ctx.fill();
      }],
      kindPoster: [200, 270, (ctx, w, h) => {
        ctx.fillStyle = "#ff8ad8"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff4fb"; roundRect(ctx, 10, 10, w - 20, h - 20, 16); ctx.fill();
        text(ctx, "BE KIND", w / 2, 50, 38, "#e0408f");
        ctx.fillStyle = "#ff6b8a"; heart(ctx, w / 2, 90, 90);
        smiley(ctx, 60, 225, 26, "#ffd9b0", "#5a3a22");
        smiley(ctx, 140, 225, 26, "#f2c49b", "#222");
      }],
      rulesPoster: [260, 300, (ctx, w, h) => {
        ctx.fillStyle = "#6fd36a"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fffef4"; roundRect(ctx, 10, 10, w - 20, h - 20, 16); ctx.fill();
        text(ctx, "CLASS RULES", w / 2, 44, 30, "#2f8f3a");
        ["1. Be kind", "2. Raise your hand", "3. Share", "4. Do your best", "5. Have fun!"].forEach((s, i) => text(ctx, s, 26, 96 + i * 42, 24, "#333", "left"));
      }],
      sciencePoster: [220, 270, (ctx, w, h) => {
        ctx.fillStyle = "#3a3f8f"; ctx.fillRect(0, 0, w, h);
        text(ctx, "SCIENCE", w / 2, 40, 34, "#ffe15a");
        text(ctx, "ROCKS!", w / 2, 76, 30, "#7fe0ff");
        ctx.strokeStyle = "#7fe0ff"; ctx.lineWidth = 5;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(w / 2, 172, 76, 26, (i * PI) / 3, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = "#ff6b8a"; ctx.beginPath(); ctx.arc(w / 2, 172, 14, 0, TAU); ctx.fill();
      }],
      calendar: [200, 200, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ff6b6b"; ctx.fillRect(0, 0, w, 44);
        text(ctx, "OCTOBER", w / 2, 24, 26, "#fff");
        for (let i = 0; i < 30; i++) {
          const cx = 16 + (i % 6) * 32, cy = 64 + Math.floor(i / 6) * 28;
          text(ctx, String(i + 1), cx + 8, cy, 16, i === 14 ? "#ff6b6b" : "#555");
        }
        ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(120 - 32 + 8, 92, 13, 0, TAU); ctx.stroke();
      }],
      drawings: [440, 220, (ctx, w, h) => {
        // a cork board covered in the class's drawings
        ctx.fillStyle = "#d9a86a"; ctx.fillRect(0, 0, w, h);
        const r = seeded(9);
        for (let i = 0; i < 200; i++) { ctx.fillStyle = "rgba(120,70,30," + (0.1 + r() * 0.15) + ")"; ctx.fillRect(r() * w, r() * h, 2, 2); }
        const paper = (x, y, pw, ph, rot, draw) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
          ctx.fillStyle = "#ffffff"; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
          draw(pw, ph);
          ctx.fillStyle = "#e23b3b"; ctx.beginPath(); ctx.arc(0, -ph / 2 + 6, 5, 0, TAU); ctx.fill();
          ctx.restore();
        };
        paper(70, 60, 110, 90, -0.08, () => { smiley(ctx, 0, 6, 28, "#ffd9b0", "#e2574c"); });
        paper(200, 64, 110, 90, 0.06, () => {
          ctx.fillStyle = "#6fd36a"; ctx.fillRect(-50, 20, 100, 20);
          ctx.fillStyle = "#ffe15a"; ctx.beginPath(); ctx.arc(30, -18, 14, 0, TAU); ctx.fill();
          ctx.fillStyle = "#ff8ad8"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-30 + i * 22, 12, 7, 0, TAU); ctx.fill(); }
        });
        paper(330, 58, 110, 90, -0.04, () => {
          ctx.fillStyle = "#4fb7ff"; ctx.fillRect(-50, 0, 100, 40);
          ctx.fillStyle = "#ff8a5c"; ctx.beginPath(); ctx.ellipse(0, -6, 26, 12, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(40, -18); ctx.lineTo(40, 6); ctx.fill();
          ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(-12, -9, 3, 0, TAU); ctx.fill();
        });
        paper(110, 160, 120, 90, 0.05, () => {
          ctx.fillStyle = "#e2574c"; ctx.fillRect(-26, -4, 52, 36);
          ctx.fillStyle = "#9a6a3c"; ctx.beginPath(); ctx.moveTo(-34, -2); ctx.lineTo(0, -32); ctx.lineTo(34, -2); ctx.fill();
          ctx.fillStyle = "#ffe15a"; ctx.fillRect(-8, 10, 16, 22);
        });
        paper(250, 162, 110, 90, -0.07, () => {
          const cols = ["#ff6b6b", "#ffb84d", "#ffe15a", "#6fd36a", "#4fb7ff", "#a58cff"];
          cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 30, 46 - i * 6, PI, TAU); ctx.stroke(); });
        });
        paper(372, 160, 100, 90, 0.08, () => { ctx.fillStyle = "#ffe15a"; star(ctx, 0, 4, 32); ctx.fill(); });
      }],
      painting1: [220, 180, (ctx, w, h) => {
        ctx.fillStyle = "#bfe6ff"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#6fd36a"; ctx.fillRect(0, h * 0.68, w, h);
        ctx.fillStyle = "#ffe15a"; ctx.beginPath(); ctx.arc(170, 46, 26, 0, TAU); ctx.fill();
        const cols = ["#ff6b8a", "#ffb84d", "#a58cff", "#ffffff"];
        for (let i = 0; i < 7; i++) {
          const x = 20 + i * 28, y = 130 + (i % 2) * 14;
          ctx.strokeStyle = "#3f9a3a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, h); ctx.stroke();
          ctx.fillStyle = cols[i % 4]; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.26) * 7, y + Math.sin(k * 1.26) * 7, 6, 0, TAU); ctx.fill(); }
          ctx.fillStyle = "#ffe15a"; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        }
      }],
      painting2: [220, 180, (ctx, w, h) => {
        ctx.fillStyle = "#fff4d6"; ctx.fillRect(0, 0, w, h);
        smiley(ctx, w / 2, 92, 58, "#ffd9b0", "#2a2a2a");
        ctx.fillStyle = "#4fb7ff"; ctx.fillRect(w / 2 - 70, 152, 140, 40);
        ctx.strokeStyle = "#ff6b8a"; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      }],
      keys: [256, 40, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        const n = 22, kw = w / n;
        ctx.fillStyle = "#c9c9c9"; for (let i = 1; i < n; i++) ctx.fillRect(i * kw - 1, 0, 2, h);
        ctx.fillStyle = "#222";
        for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) ctx.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
      }],
      petSign: [200, 60, (ctx, w, h) => {
        ctx.fillStyle = "#ffe15a"; roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill();
        text(ctx, "Mr. Nibbles", w / 2, h / 2 + 2, 30, "#7a4a12");
      }],
      readSign: [300, 64, (ctx, w, h) => {
        ctx.fillStyle = "#ff8a5c"; roundRect(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
        text(ctx, "Reading Corner", w / 2, h / 2 + 2, 34, "#ffffff");
      }],
      worldMap: [260, 160, (ctx, w, h) => {
        ctx.fillStyle = "#7fd0f5"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#7fd36a";
        const blob = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
        blob([[30, 30], [80, 24], [92, 54], [70, 70], [60, 100], [44, 70], [26, 54]]);
        blob([[66, 96], [86, 100], [80, 140], [66, 130]]);
        blob([[120, 30], [180, 24], [230, 40], [220, 70], [180, 64], [160, 80], [130, 60]]);
        blob([[128, 74], [156, 80], [150, 120], [134, 112]]);
        blob([[200, 110], [232, 112], [228, 132], [204, 130]]);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.strokeRect(2, 2, w - 4, h - 4);
      }],
      schoolSign: [400, 120, (ctx, w, h) => {
        ctx.fillStyle = "#2f6f9f"; roundRect(ctx, 2, 2, w - 4, h - 4, 22); ctx.fill();
        ctx.strokeStyle = "#ffe15a"; ctx.lineWidth = 6; roundRect(ctx, 10, 10, w - 20, h - 20, 16); ctx.stroke();
        text(ctx, "Mii Elementary", w / 2, 50, 46, "#ffffff");
        text(ctx, "SCHOOL", w / 2, 92, 28, "#ffe15a");
      }],
      flag: [160, 100, (ctx, w, h) => {
        ctx.fillStyle = "#4fb7ff"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, h / 3, w, h / 3);
        ctx.fillStyle = "#ff6b6b"; star(ctx, w / 2, h / 2, 26); ctx.fill();
      }],
      bus: [300, 60, (ctx, w, h) => {
        ctx.fillStyle = "#ffc93c"; ctx.fillRect(0, 0, w, h);
        text(ctx, "SCHOOL BUS", w / 2, h / 2 + 2, 40, "#222");
      }],
      yard: [510, 170, (ctx, w, h) => {
        // painted games on the playground tarmac
        ctx.fillStyle = "#b9b6c6"; ctx.fillRect(0, 0, w, h);
        const r = seeded(4);
        for (let i = 0; i < 300; i++) { ctx.fillStyle = "rgba(255,255,255," + r() * 0.08 + ")"; ctx.fillRect(r() * w, r() * h, 2, 2); }
        // hopscotch
        ctx.strokeStyle = "#ffe15a"; ctx.lineWidth = 3;
        const hx = 150, hy = 40;
        const sq = (x, y, n) => { ctx.strokeRect(x, y, 22, 22); text(ctx, String(n), x + 11, y + 12, 14, "#ffe15a"); };
        sq(hx, hy + 88, 1); sq(hx, hy + 66, 2); sq(hx - 11, hy + 44, 3); sq(hx + 11, hy + 44, 4); sq(hx, hy + 22, 5); sq(hx - 11, hy, 6); sq(hx + 11, hy, 7);
        // four square
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
        ctx.strokeRect(250, 50, 70, 70); ctx.beginPath(); ctx.moveTo(285, 50); ctx.lineTo(285, 120); ctx.moveTo(250, 85); ctx.lineTo(320, 85); ctx.stroke();
        ctx.fillStyle = "rgba(255,107,107,0.6)"; ctx.fillRect(252, 52, 32, 32);
        ctx.fillStyle = "rgba(79,183,255,0.6)"; ctx.fillRect(287, 87, 32, 32);
        // a big painted snail and circle
        ctx.strokeStyle = "#7fe0a0"; ctx.lineWidth = 4;
        ctx.beginPath(); for (let a = 0; a < 16; a += 0.1) ctx.lineTo(400 + Math.cos(a) * a * 3.2, 85 + Math.sin(a) * a * 3.2); ctx.stroke();
        // basketball key
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
        ctx.strokeRect(20, 0, 60, 60); ctx.beginPath(); ctx.arc(50, 60, 30, 0, PI); ctx.stroke();
      }],
      field: [512, 256, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#6fcf55" : "#7fd962"; ctx.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.beginPath(); ctx.moveTo(w / 2, 10); ctx.lineTo(w / 2, h - 10); ctx.stroke();
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 34, 0, TAU); ctx.stroke();
        ctx.strokeRect(10, h / 2 - 50, 60, 100); ctx.strokeRect(w - 70, h / 2 - 50, 60, 100);
      }],
      abcRug: [384, 256, (ctx, w, h) => {
        // a play mat of big coloured squares with letters and numbers
        const cols = ["#ff6b6b", "#ffb84d", "#ffe15a", "#6fd36a", "#4fb7ff", "#a58cff"];
        const marks = "ABC123DEF456GHI789JKL0";
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
          ctx.fillStyle = cols[(r * 2 + c) % 6]; ctx.fillRect(c * 64, r * 64, 64, 64);
          text(ctx, marks[(r * 6 + c) % marks.length], c * 64 + 32, r * 64 + 34, 40, "#ffffff");
        }
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
      }],
    }, 2048);
  }

  // a school desk with its chair (the pupil sits on the +z side, facing -z)
  function studentDesk(p, x, z, rnd) {
    const d = group(p, x, 0, z);
    const wood = 0xf2d3a0, metal = 0x8f9bb0;
    block(d, wood, 0, 1.0, 0, 1.3, 0.08, 0.85, 0.03);
    bx(d, 0x7ab8e8, 0, 0.82, -0.05, 1.18, 0.22, 0.7);
    for (const sx of [-0.58, 0.58]) for (const sz of [-0.36, 0.36]) bx(d, metal, sx, 0.47, sz, 0.06, 0.94, 0.06);
    // things on the desk: a notebook, a pencil, sometimes a pencil case or an apple
    const nb = [0xff6b6b, 0x4fb7ff, 0x6fd36a, 0xffb84d, 0xa58cff][Math.floor(rnd() * 5)];
    bx(d, nb, -0.15, 1.06, 0.05, 0.5, 0.04, 0.36, { ry: (rnd() - 0.5) * 0.4 });
    bx(d, 0xffffff, -0.15, 1.085, 0.05, 0.46, 0.012, 0.32, { ry: (rnd() - 0.5) * 0.4 });
    cylinder(d, 0xffd23f, 0.3, 1.07, 0.1, 0.022, 0.32, { rz: PI / 2, ry: 0.4, seg: 6 });
    if (rnd() < 0.5) block(d, [0xff8ad8, 0x6fd36a, 0x4fb7ff][Math.floor(rnd() * 3)], 0.38, 1.1, -0.2, 0.42, 0.12, 0.14, 0.05);
    else ball(d, 0xe23b3b, 0.4, 1.13, -0.18, 0.09);
    // the chair
    const seatC = [0xff6b6b, 0x4fb7ff, 0xffd23f, 0x6fd36a][Math.floor(rnd() * 4)];
    const c = group(d, 0, 0, 0.85);
    block(c, seatC, 0, 0.56, 0, 0.72, 0.08, 0.62, 0.04);
    block(c, seatC, 0, 1.05, 0.31, 0.72, 0.5, 0.07, 0.04);
    for (const sx of [-0.3, 0.3]) {
      for (const sz of [-0.26, 0.26]) bx(c, metal, sx, 0.28, sz, 0.05, 0.56, 0.05);
      bx(c, metal, sx, 0.82, 0.3, 0.05, 0.5, 0.05);
    }
    return d;
  }

  function buildSchool() {
    const root = new THREE.Group();
    const anim = [];
    addLights(root, { sky: 0xffffff, ground: 0xd9cfa8, hemi: 0.55, sun: 0.75, ambient: 0.34, fill: 0.35 });
    skyDome(root, 0x4aa8f2, 0xd6efff, 0xa9d98a);
    const atlas = schoolAtlas();
    const A = atlas.pic;
    const books = []; // every book in the school, drawn in one go at the end

    schoolGrounds(root, anim, atlas);

    // ---------- floor ----------
    const floorTex = planksTexture([9, 5.6], ["#efc187", "#e8b678", "#f3c991", "#e3b072"]);
    put(root, new THREE.PlaneGeometry(36.5, 22.5), toon(0xffffff, { map: floorTex }), { y: 0.005, rx: -PI / 2, shadow: false });

    // ---------- walls (each hides when the camera is behind it) ----------
    const W = { back: -11, front: 11, side: 18 };
    const WALL_H = 8;
    const style = { H: WALL_H, wallC: 0xfff1d0, panelC: 0x7fcfb0, trimC: 0xffffff, frameC: 0xffffff, topC: 0xe0a060, panelH: 1.9, glass: glassMaterial() };
    const backWall = group(root), leftWall = group(root), rightWall = group(root), frontWall = group(root);
    const backWindows = [{ c: -15.0, w: 4.2, y0: 1.3, y1: 6.3 }, { c: 8.4, w: 4.2, y0: 3.2, y1: 6.3 }, { c: 14.7, w: 4.2, y0: 1.3, y1: 6.3 }];
    const leftWindows = [{ c: -6.2, w: 4.6, y0: 1.3, y1: 6.3 }];
    const rightWindows = [{ c: -1.0, w: 3.6, y0: 1.3, y1: 6.3 }, { c: 6.3, w: 4.6, y0: 3.4, y1: 6.3 }];
    buildWall(backWall, style, "x", W.back - 0.25, 1, -18.25, 18.25, backWindows);
    buildWall(frontWall, style, "x", W.front + 0.25, -1, -18.25, 18.25, [{ c: 0, w: 3.0, y0: 0, y1: 5.0, door: true }, { c: -10, w: 5, y0: 1.6, y1: 6.2 }, { c: 10, w: 5, y0: 1.6, y1: 6.2 }]);
    buildWall(leftWall, style, "z", -W.side, 1, -11.25, 11.25, leftWindows);
    buildWall(rightWall, style, "z", W.side, -1, -11.25, 11.25, rightWindows);
    // the front doors, each with a round window and a handle
    for (const sx of [-1, 1]) {
      block(frontWall, 0xff8a5c, sx * 0.66, 2.4, W.front + 0.1, 1.28, 4.75, 0.14, 0.06);
      disc(frontWall, toon(0xcfeeff), sx * 0.66, 3.5, W.front + 0.02, 0.36, { rx: PI });
      put(frontWall, G.torus(0.36, 0.05), toon(0xffffff), { x: sx * 0.66, y: 3.5, z: W.front + 0.02 });
      block(frontWall, 0xffd23f, sx * 0.18, 2.3, W.front + 0.0, 0.1, 0.5, 0.1, 0.04);
    }
    // potted plants on the window sills
    const sillPlant = (wall, x, y, z, color) => {
      put(wall, G.taper(0.17, 0.13), toon(color), { x, y: y + 0.17, z, sy: 0.3 });
      ball(wall, 0x5cc84a, x, y + 0.45, z, 0.22);
      ball(wall, 0xff8ad8, x + 0.08, y + 0.6, z + 0.08, 0.07);
    };
    sillPlant(backWall, -16.2, 1.36, W.back + 0.32, 0xff8a5c);
    sillPlant(backWall, 13.3, 1.36, W.back + 0.32, 0x4fb7ff);
    sillPlant(leftWall, -W.side + 0.32, 1.36, -7.6, 0xffd23f);
    sillPlant(leftWall, -W.side + 0.32, 1.36, -4.8, 0xff6b6b);

    // ---------- the blackboard (back wall) ----------
    const BB = { x: -5, y: 3.45, w: 9.4, h: 3.1 };
    const bbZ = W.back + 0.25;
    block(backWall, 0xb07a45, BB.x, BB.y, bbZ + 0.04, BB.w + 0.4, BB.h + 0.4, 0.1, 0.05);
    A(backWall, "blackboard", BB.w, BB.h, { x: BB.x, y: BB.y, z: bbZ + 0.1 });
    block(backWall, 0xb07a45, BB.x, BB.y - BB.h / 2 - 0.2, bbZ + 0.2, BB.w, 0.08, 0.3, 0.02); // chalk tray
    for (let i = 0; i < 5; i++) cylinder(backWall, [0xffffff, 0xffd36b, 0xff9ec7, 0x9fe0ff, 0xffffff][i], BB.x - 3 + i * 0.25, BB.y - BB.h / 2 - 0.13, bbZ + 0.24, 0.03, 0.22, { rz: PI / 2, seg: 6 });
    block(backWall, 0x7a8ca8, BB.x + 2.5, BB.y - BB.h / 2 - 0.1, bbZ + 0.24, 0.4, 0.12, 0.16, 0.03); // board eraser
    A(backWall, "alphabet", BB.w, 0.6, { x: BB.x, y: BB.y + BB.h / 2 + 0.6, z: bbZ + 0.03 });
    // bulletin board with the calendar and drawings, and the clock above it
    block(backWall, 0xc98b4a, 4.0, 3.5, bbZ + 0.03, 3.2, 2.0, 0.06, 0.04);
    A(backWall, "calendar", 1.2, 1.2, { x: 3.2, y: 3.5, z: bbZ + 0.08, rz: 0.04 });
    A(backWall, "worldMap", 1.7, 1.05, { x: 4.75, y: 3.6, z: bbZ + 0.08, rz: -0.03 });
    const clock = group(backWall, 4.0, 5.8, bbZ + 0.05);
    cylinder(clock, 0xffffff, 0, 0, 0, 0.62, 0.1, { rx: PI / 2 });
    put(clock, G.torus(0.62, 0.08), toon(0xff6b6b), {});
    for (let i = 0; i < 12; i++) ball(clock, 0x555555, Math.sin((i / 12) * TAU) * 0.48, Math.cos((i / 12) * TAU) * 0.48, 0.06, 0.03);
    const hourHand = dynamic(group(clock, 0, 0, 0.08));
    const minHand = dynamic(group(clock, 0, 0, 0.1));
    block(hourHand, 0x333333, 0, 0.17, 0, 0.07, 0.36, 0.02, 0.02);
    block(minHand, 0x333333, 0, 0.25, 0, 0.05, 0.52, 0.02, 0.02);
    anim.push(() => {
      const now = new Date();
      hourHand.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU;
      minHand.rotation.z = -(now.getMinutes() + now.getSeconds() / 60) / 60 * TAU;
    });
    A(backWall, "sciencePoster", 1.4, 1.72, { x: 11.55, y: 4.5, z: bbZ + 0.04 });
    A(leftWall, "kindPoster", 1.5, 2.0, { x: -W.side + 0.28, y: 4.4, z: 2.2, ry: PI / 2 });
    A(leftWall, "readPoster", 1.5, 2.0, { x: -W.side + 0.28, y: 4.4, z: -1.4, ry: PI / 2 });
    A(frontWall, "rulesPoster", 2.0, 2.3, { x: -4.5, y: 4.0, z: W.front - 0.28, ry: PI });
    A(rightWall, "drawings", 3.6, 1.8, { x: W.side - 0.28, y: 4.4, z: -6.4, ry: -PI / 2 });
    A(rightWall, "readSign", 2.6, 0.55, { x: W.side - 0.28, y: 2.95, z: 6.3, ry: -PI / 2 });

    // ---------- the pupils' desks: 3 rows of 4, facing the blackboard ----------
    const RZ = [-4.6, -1.3, 2.0];
    const CX = [-9.8, -6.6, -3.4, -0.2];
    const drnd = seeded(11);
    for (const z of RZ) for (const x of CX) studentDesk(root, x, z, drnd);

    // ---------- the teacher's desk ----------
    const TD = { x: 1.0, z: -8.1 };
    const td = group(root, TD.x, 0, TD.z);
    block(td, 0xb8743a, 0, 0.55, 0, 3.0, 1.1, 1.15, 0.08);
    block(td, 0xd99a5a, 0, 1.13, 0, 3.15, 0.1, 1.3, 0.04);
    block(td, 0x9a5e2c, 0, 0.6, 0.58, 2.6, 0.7, 0.04, 0.02, { shadow: false });
    ball(td, 0xe23b3b, -1.1, 1.3, 0.25, 0.14);                                   // the apple for the teacher
    cylinder(td, 0x6b4a2a, -1.1, 1.46, 0.25, 0.015, 0.1, { seg: 5 });
    ball(td, 0x5cc84a, -1.05, 1.46, 0.25, 0.05, { sx: 1.6, sy: 0.5 });
    for (let i = 0; i < 4; i++) block(td, [0x4fb7ff, 0xff6b6b, 0x6fd36a, 0xffd23f][i], -0.45, 1.24 + i * 0.1, -0.1, 0.62, 0.09, 0.44, 0.02, { ry: i * 0.12 });
    cylinder(td, 0x6fd36a, 0.4, 1.33, 0.2, 0.1, 0.3);                              // pencil cup
    for (let i = 0; i < 4; i++) cylinder(td, [0xffd23f, 0xff6b6b, 0x4fb7ff, 0xffd23f][i], 0.4 + Math.cos(i * 1.6) * 0.04, 1.55, 0.2 + Math.sin(i * 1.6) * 0.04, 0.018, 0.35, { rz: (i - 1.5) * 0.12, seg: 6 });
    bx(td, 0xffffff, 0.95, 1.2, 0.05, 0.6, 0.03, 0.45, { ry: -0.2 });             // marking papers
    bx(td, 0xffffff, 0.97, 1.23, 0.08, 0.6, 0.03, 0.45, { ry: 0.1 });
    cylinder(td, 0xd8d8d8, 1.25, 1.2, -0.3, 0.1, 0.04);                            // the bell
    ball(td, 0xffcf3a, 1.25, 1.24, -0.3, 0.09, { sy: 0.8 });
    // the teacher's chair (behind the desk)
    const tch = group(root, TD.x, 0, TD.z - 1.15);
    block(tch, 0x2f6f9f, 0, 0.58, 0, 0.8, 0.12, 0.75, 0.06);
    block(tch, 0x2f6f9f, 0, 1.1, -0.36, 0.8, 0.9, 0.1, 0.06);
    cylinder(tch, 0x555a66, 0, 0.3, 0, 0.05, 0.5);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; bx(tch, 0x555a66, Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22, 0.45, 0.05, 0.07, { ry: -a }); }

    // ---------- the globe ----------
    const GL = { x: -12.3, z: -8.6 };
    const globeTex = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#3fa9f5"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#7fd36a";
      const blob = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
      blob([[20, 30], [60, 22], [74, 48], [56, 60], [48, 86], [34, 60], [16, 46]]);
      blob([[52, 84], [70, 90], [62, 120], [50, 110]]);
      blob([[110, 26], [170, 18], [220, 34], [210, 60], [170, 56], [150, 70], [118, 50]]);
      blob([[118, 64], [144, 70], [138, 104], [122, 96]]);
      blob([[196, 92], [226, 94], [222, 112], [198, 110]]);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 8, w, 8);
    });
    const gst = group(root, GL.x, 0, GL.z);
    cylinder(gst, 0xb07a45, 0, 0.05, 0, 0.45, 0.1);
    cylinder(gst, 0xb07a45, 0, 0.6, 0, 0.05, 1.1);
    put(gst, G.torus(0.62, 0.03), toon(0xd9a441), { y: 1.75, ry: PI / 2, rz: 0.4 });
    const globeSpin = dynamic(group(gst, 0, 1.75, 0));
    globeSpin.rotation.z = 0.4;
    const globeBall = put(globeSpin, G.sphere(), toon(0xffffff, { map: globeTex }), { s: 0.56 });
    anim.push((t) => { globeBall.rotation.y = t * 0.6; });

    // ---------- science corner (back right) ----------
    const SC = { x: 8.4, z: -10.1 };
    const sci = group(root, SC.x, 0, SC.z);
    block(sci, 0x4f8fd0, 0, 0.5, 0, 5.4, 1.0, 1.0, 0.06);
    block(sci, 0xf4f6fa, 0, 1.05, 0.02, 5.6, 0.1, 1.15, 0.03);
    for (let i = 0; i < 4; i++) {
      bx(sci, 0x3a78b8, -2.0 + i * 1.33, 0.5, 0.505, 1.2, 0.85, 0.02, { shadow: false });
      ball(sci, 0xffffff, -2.0 + i * 1.33 + 0.4, 0.75, 0.53, 0.05);
    }
    // microscope
    const mic = group(sci, -1.7, 1.1, 0.0, 0.4);
    block(mic, 0x2f3542, 0, 0.04, 0, 0.42, 0.08, 0.5, 0.03);
    block(mic, 0x2f3542, 0, 0.35, -0.16, 0.09, 0.6, 0.12, 0.03, { rx: 0.15 });
    bx(mic, 0xdfe4ea, 0, 0.26, 0.04, 0.32, 0.03, 0.3);
    cylinder(mic, 0xffffff, 0, 0.55, 0.04, 0.07, 0.4, { rx: -0.35 });
    cylinder(mic, 0x2f3542, 0, 0.78, -0.03, 0.05, 0.16, { rx: -0.35 });
    // beakers and test tubes with bright liquids (one clear glass material for all of them)
    const glassy = toon(0xd8f0ff, { transparent: true, opacity: 0.45 });
    [[-0.8, 0x6fd36a], [-0.45, 0xff8ad8], [-0.1, 0x4fb7ff]].forEach(([x, c], i) => {
      cylinder(sci, c, x, 1.18 + i * 0.03, 0.15, 0.13, 0.16 + i * 0.06);
      cylinder(sci, glassy, x, 1.28, 0.15, 0.15, 0.36);
    });
    block(sci, 0x9a6a3c, 0.6, 1.16, 0.3, 0.7, 0.06, 0.18, 0.02);
    for (let i = 0; i < 4; i++) {
      cylinder(sci, [0xff6b6b, 0xffd23f, 0x6fd36a, 0xa58cff][i], 0.36 + i * 0.16, 1.28, 0.3, 0.035, 0.14);
      cylinder(sci, glassy, 0.36 + i * 0.16, 1.36, 0.3, 0.045, 0.32);
    }
    // plant experiment: three pots, the one in the sun grew the most
    for (let i = 0; i < 3; i++) {
      const px = 1.25 + i * 0.42;
      put(sci, G.taper(0.15, 0.11), toon(0xe0784a), { x: px, y: 1.25, z: -0.1, sy: 0.26 });
      const hgt = 0.12 + i * 0.22;
      cylinder(sci, 0x4f9e35, px, 1.38 + hgt / 2, -0.1, 0.018, hgt, { seg: 5 });
      ball(sci, 0x6fd36a, px + 0.06, 1.38 + hgt, -0.1, 0.06 + i * 0.03, { sy: 0.5 });
      ball(sci, 0x6fd36a, px - 0.06, 1.33 + hgt, -0.1, 0.05 + i * 0.03, { sy: 0.5 });
      bx(sci, 0xffffff, px, 1.22, 0.06, 0.18, 0.1, 0.01, { shadow: false });
    }
    // the volcano model (it bubbles!)
    const VO = { x: SC.x + 2.25, y: 1.1, z: SC.z + 0.1 };
    block(sci, 0x6fd36a, 2.25, 1.13, 0.1, 0.9, 0.05, 0.8, 0.02);
    put(sci, G.taper(0.09, 0.4, 14), toon(0x9a6a3c), { x: 2.25, y: 1.42, z: 0.1, sy: 0.55 });
    put(sci, G.taper(0.1, 0.16, 14), toon(0xff5a3a), { x: 2.25, y: 1.62, z: 0.1, sy: 0.14 });
    for (let i = 0; i < 4; i++) put(sci, G.capsule(), toon(0xff7a2a), { x: 2.25 + Math.cos(i * 1.7) * 0.18, y: 1.5, z: 0.1 + Math.sin(i * 1.7) * 0.18, sx: 0.07, sy: 0.25, sz: 0.07, rx: Math.sin(i * 1.7) * 0.5, rz: -Math.cos(i * 1.7) * 0.5 });
    const lava = dynamic(new THREE.InstancedMesh(G.lowSphere(), glow(0xff6a2a, 0.6), 7));
    lava.frustumCulled = false;
    root.add(lava);
    const smoke = dynamic(new THREE.InstancedMesh(G.lowSphere(), toon(0xf2f2f2, { transparent: true, opacity: 0.55 }), 4));
    smoke.frustumCulled = false;
    root.add(smoke);
    const tmp = new THREE.Object3D();
    anim.push((t) => {
      for (let i = 0; i < 7; i++) {
        const k = (t * 0.8 + i / 7) % 1;
        const a = i * 2.4;
        tmp.position.set(VO.x + Math.cos(a) * k * 0.25, VO.y + 0.62 + Math.sin(k * PI) * 0.3, VO.z + Math.sin(a) * k * 0.25);
        tmp.scale.setScalar(0.05 * (1 - k * 0.6));
        tmp.updateMatrix(); lava.setMatrixAt(i, tmp.matrix);
      }
      lava.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.25 + i / 4) % 1;
        tmp.position.set(VO.x + Math.sin(t + i) * 0.1, VO.y + 0.75 + k * 1.2, VO.z);
        tmp.scale.setScalar(0.08 + k * 0.2);
        tmp.updateMatrix(); smoke.setMatrixAt(i, tmp.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
    });
    // a big leafy plant in the corner
    const bigPlant = group(root, 16.7, 0, -9.9, 0, 0.9);
    cylinder(bigPlant, 0xffffff, 0, 0.45, 0, 0.45, 0.9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      put(bigPlant, G.sphere(), toon(i % 2 ? 0x46b04a : 0x5cc84a), { x: Math.cos(a) * 0.4, y: 1.7 + (i % 3) * 0.3, z: Math.sin(a) * 0.4, sx: 0.22, sy: 0.85, sz: 0.22, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 });
    }

    // ---------- the piano (right wall) ----------
    const PN = { x: 17.15, z: -6.4 };
    const pn = group(root, PN.x, 0, PN.z, -PI / 2); // its keys face -x (into the room)
    block(pn, 0xd9473f, 0, 1.15, 0, 2.6, 2.3, 0.95, 0.1);
    block(pn, 0xb8352f, 0, 2.33, 0.05, 2.75, 0.1, 1.1, 0.04);
    block(pn, 0xd9473f, 0, 1.12, 0.62, 2.5, 0.12, 0.45, 0.04);              // the key shelf
    A(pn, "keys", 2.3, 0.36, { y: 1.185, z: 0.62, rx: -PI / 2 });
    block(pn, 0xb8352f, 0, 0.55, 0.62, 2.5, 0.06, 0.3, 0.02);
    for (const sx of [-1.15, 1.15]) block(pn, 0xb8352f, sx, 0.55, 0.62, 0.12, 1.1, 0.4, 0.03);
    bx(pn, 0xffffff, 0, 1.65, 0.49, 0.8, 0.5, 0.03, { rx: -0.2 });          // sheet music
    for (let i = 0; i < 4; i++) bx(pn, 0x333333, 0, 1.52 + i * 0.1, 0.505, 0.7, 0.012, 0.01, { rx: -0.2, shadow: false });
    ball(pn, 0xffd23f, 0.9, 2.5, 0.0, 0.14);                                // a little metronome... no, a duck
    block(pn, 0x8a5a3a, 0, 0.3, 1.35, 1.5, 0.08, 0.6, 0.04);                // bench
    block(pn, 0xff8ad8, 0, 0.6, 1.35, 1.4, 0.12, 0.55, 0.06);
    for (const sx of [-0.6, 0.6]) bx(pn, 0x8a5a3a, sx, 0.28, 1.35, 0.08, 0.56, 0.5);
    // music notes floating up from the piano
    const noteTex = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = "#ff6b8a";
      ctx.beginPath(); ctx.ellipse(22, 48, 12, 9, -0.4, 0, TAU); ctx.fill();
      ctx.fillRect(31, 10, 5, 38);
      ctx.beginPath(); ctx.moveTo(31, 10); ctx.quadraticCurveTo(50, 16, 52, 32); ctx.quadraticCurveTo(44, 22, 36, 22); ctx.fill();
    });
    const notes = dynamic(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: noteTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false }), 3));
    notes.frustumCulled = false;
    notes.castShadow = false;
    root.add(notes);
    anim.push((t) => {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.35 + i / 3) % 1;
        tmp.position.set(PN.x - 0.6 - k * 0.8, 2.6 + k * 2.2, PN.z - 0.6 + i * 0.6 + Math.sin(t * 2 + i) * 0.2);
        tmp.rotation.set(0, -PI / 2 + 0.6, Math.sin(t * 3 + i) * 0.3);
        tmp.scale.setScalar(Math.sin(k * PI) * 1.2);
        tmp.updateMatrix(); notes.setMatrixAt(i, tmp.matrix);
      }
      notes.instanceMatrix.needsUpdate = true;
    });

    // ---------- art corner: easels and a messy art table ----------
    const easel = (x, z, ry, picName) => {
      const e = group(root, x, 0, z, ry);
      const wood = 0xc98b4a;
      for (const sx of [-0.42, 0.42]) block(e, wood, sx, 1.15, 0.12, 0.07, 2.4, 0.07, 0.02, { rx: -0.1, rz: -sx * 0.25 });
      block(e, wood, 0, 1.05, -0.4, 0.07, 2.2, 0.07, 0.02, { rx: 0.35 });
      block(e, wood, 0, 0.95, 0.24, 1.1, 0.07, 0.18, 0.02);
      block(e, 0xffffff, 0, 1.58, 0.2, 1.05, 0.85, 0.05, 0.01, { rx: -0.1 });
      A(e, picName, 0.95, 0.75, { y: 1.58, z: 0.232, rx: -0.1 });
      for (let i = 0; i < 3; i++) cylinder(e, [0xff6b6b, 0x4fb7ff, 0xffd23f][i], -0.3 + i * 0.3, 1.03, 0.25, 0.06, 0.1);
      return e;
    };
    const E1 = { x: 8.4, z: -4.6, ry: -2.3 };
    const E2 = { x: 11.8, z: -3.6, ry: -0.35 };
    easel(E1.x, E1.z, E1.ry, "painting1");
    easel(E2.x, E2.z, E2.ry, "painting2");
    const AT = { x: 10.2, z: -0.4 };
    const art = group(root, AT.x, 0, AT.z, 0.1);
    block(art, 0xffd23f, 0, 0.78, 0, 2.4, 0.08, 1.2, 0.04);
    for (const sx of [-1.05, 1.05]) for (const sz of [-0.5, 0.5]) bx(art, 0x4fb7ff, sx, 0.38, sz, 0.08, 0.76, 0.08);
    bx(art, 0xffffff, -0.5, 0.83, 0.1, 0.8, 0.02, 0.6, { ry: 0.2 });
    bx(art, 0xffffff, 0.3, 0.84, -0.1, 0.7, 0.02, 0.55, { ry: -0.3 });
    ball(art, 0xff6b8a, -0.6, 0.85, 0.15, 0.1, { sy: 0.1 });
    ball(art, 0x4fb7ff, 0.4, 0.86, -0.05, 0.12, { sy: 0.1 });
    for (let i = 0; i < 6; i++) cylinder(art, [0xff6b6b, 0xffb84d, 0xffe15a, 0x6fd36a, 0x4fb7ff, 0xa58cff][i], 0.6 + (i % 3) * 0.17, 0.9, -0.3 + Math.floor(i / 3) * 0.2, 0.07, 0.14);
    block(art, 0x2f3542, -0.95, 0.87, -0.35, 0.4, 0.1, 0.25, 0.03);             // crayon box
    for (let i = 0; i < 5; i++) cylinder(art, [0xff6b6b, 0x4fb7ff, 0x6fd36a, 0xffd23f, 0xa58cff][i], -1.1 + i * 0.07, 0.98, -0.35, 0.02, 0.18, { seg: 5 });
    // a little stool on each side
    for (const sx of [-0.7, 0.7]) {
      cylinder(root, 0xff6b6b, AT.x + sx, 0.45, AT.z + 1.05, 0.25, 0.08);
      for (let i = 0; i < 3; i++) bx(root, 0x9aa3b0, AT.x + sx + Math.cos(i * 2.1) * 0.15, 0.22, AT.z + 1.05 + Math.sin(i * 2.1) * 0.15, 0.05, 0.44, 0.05);
    }

    // ---------- reading corner (front right) ----------
    const rugTex = canvasTexture(256, 256, (ctx, w, h) => {
      const cols = ["#ff6b6b", "#ffb84d", "#ffe15a", "#6fd36a", "#4fb7ff", "#a58cff", "#ffffff"];
      for (let i = 0; i < cols.length; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - i * 17, 0, TAU); ctx.fill(); }
    });
    disc(root, toon(0xffffff, { map: rugTex }), 13.4, 0.02, 6.6, 2.9);
    // tall bookshelves against the right wall
    for (const sz of [4.6, 7.8]) {
      const sh = group(root, W.side - 0.6, 0, sz, -PI / 2);
      const wood = 0xc98b4a;
      bx(sh, wood, 0, 1.2, -0.35, 3.0, 2.4, 0.06);
      for (const sx of [-1.47, 1.47]) bx(sh, wood, sx, 1.2, 0, 0.08, 2.4, 0.75);
      for (let row = 0; row < 4; row++) {
        bx(sh, wood, 0, 0.05 + row * 0.62, 0, 3.0, 0.06, 0.75);
        let x = -1.35;
        const r = seeded(row * 7 + Math.round(sz * 3));
        while (x < 1.25) {
          const bw = 0.08 + r() * 0.08, bh = 0.34 + r() * 0.16;
          if (r() < 0.08) { x += 0.2; continue; }
          // the shelf is turned to face -x, so its local x runs along world z
          books.push({ x: W.side - 0.6 + 0.02, y: 0.08 + row * 0.62 + bh / 2, z: sz - x - bw / 2, sx: 0.5, sy: bh, sz: bw,
            rx: r() < 0.1 ? 0.25 : 0, color: [0xff6b6b, 0x4fb7ff, 0x6fd36a, 0xffd23f, 0xa58cff, 0xff8ad8, 0xffffff, 0x2f6f9f][Math.floor(r() * 8)] });
          x += bw + 0.01;
        }
      }
      bx(sh, wood, 0, 2.43, 0, 3.0, 0.06, 0.78);
    }
    // a low book box on wheels
    const bcart = group(root, 15.4, 0, 9.0);
    block(bcart, 0x6fd36a, 0, 0.45, 0, 1.3, 0.7, 0.6, 0.06);
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.2, 0.2]) ball(bcart, 0x333333, sx, 0.08, sz, 0.08);
    for (let i = 0; i < 8; i++) books.push({ x: 15.4 - 0.5 + i * 0.13, y: 0.95, z: 9.0, sx: 0.09, sy: 0.4, sz: 0.4, rz: (i - 4) * 0.05, color: [0xff6b6b, 0x4fb7ff, 0xffd23f, 0xa58cff][i % 4] });
    // squishy beanbags
    const beanbag = (x, z, color) => {
      ball(root, color, x, 0.32, z, 0.7, { sy: 0.5 });
      ball(root, color, x, 0.5, z - 0.32, 0.55, { sy: 0.55, sz: 0.6 });
    };
    const BB1 = { x: 13.0, z: 7.4 };
    beanbag(BB1.x, BB1.z, 0xffd23f);
    beanbag(14.9, 4.8, 0x4fb7ff);
    beanbag(11.2, 5.2, 0xff8ad8);
    // an open book on the blue beanbag
    bx(root, 0xffffff, 14.9, 0.62, 5.0, 0.5, 0.04, 0.34, { ry: 0.3, rx: -0.1 });

    // ---------- a play mat in the middle, with building blocks ----------
    A(root, "abcRug", 6, 4, { x: 5.4, y: 0.02, z: 5.2, rx: -PI / 2 });
    const toyR = seeded(8);
    for (let i = 0; i < 7; i++) {
      const s = 0.32;
      const tx = i < 4 ? 7.6 + (i % 2) * 0.36 : 7.78, ty = i < 4 ? s / 2 + Math.floor(i / 2) * s : s / 2 + (2 + (i - 4)) * s;
      block(root, [0xff6b6b, 0x4fb7ff, 0xffd23f, 0x6fd36a, 0xa58cff, 0xff8a5c, 0xff8ad8][i], tx, ty, 6.3 + (toyR() - 0.5) * 0.05, s, s, s, 0.05, { ry: (toyR() - 0.5) * 0.3 });
    }
    block(root, 0x4fb7ff, 3.4, 0.17, 6.4, 0.34, 0.34, 0.34, 0.05, { ry: 0.5 });
    ball(root, 0xff6b6b, 3.0, 0.25, 3.9, 0.25);

    // paper bunting along the top of the walls
    const wallBunting = (wall, a, b) => painted(wall, bakeGeo((g) => {
      const line = sagLine(a, b, 0.5, 40);
      const curve = new THREE.CatmullRomCurve3(line);
      const fc = [0xff6b6b, 0xffd23f, 0x4fb7ff, 0x6fd36a, 0xff8ad8, 0xa58cff];
      const n = Math.round(a.distanceTo(b) / 0.8);
      const along = b.clone().sub(a).normalize();
      for (let i = 1; i < n; i++) {
        const p = curve.getPoint(i / n);
        const f = put(g, triangleGeo([-0.25, 0, 0, 0.25, 0, 0, 0, -0.55, 0]), toon(fc[i % fc.length]), { x: p.x, y: p.y, z: p.z });
        f.rotation.y = -Math.atan2(along.z, along.x);
      }
      cable(g, toon(0xffffff), line, 0.015);
    }));
    wallBunting(backWall, new THREE.Vector3(-17.6, 7.5, W.back + 0.4), new THREE.Vector3(-10.4, 7.5, W.back + 0.4));
    wallBunting(backWall, new THREE.Vector3(0.3, 7.5, W.back + 0.4), new THREE.Vector3(17.6, 7.5, W.back + 0.4));
    wallBunting(leftWall, new THREE.Vector3(-W.side + 0.4, 7.5, -10.6), new THREE.Vector3(-W.side + 0.4, 7.5, 10.6));
    wallBunting(rightWall, new THREE.Vector3(W.side - 0.4, 7.5, -10.6), new THREE.Vector3(W.side - 0.4, 7.5, 10.6));

    // ---------- lockers and cubbies (left wall) ----------
    const lockerC = [0xff6b6b, 0xffb84d, 0xffd23f, 0x6fd36a, 0x4fb7ff, 0xa58cff];
    for (let i = 0; i < 6; i++) {
      const lz = -0.1 + i * 1.0;
      const l = group(root, -W.side + 0.65, 0, lz, PI / 2);
      block(l, lockerC[i], 0, 1.45, 0, 0.94, 2.9, 0.8, 0.05);
      for (let k = 0; k < 4; k++) bx(l, 0x333333, 0, 2.5 + k * 0.1, 0.405, 0.5, 0.03, 0.01, { shadow: false });
      bx(l, 0xdfe4ea, 0.3, 1.5, 0.41, 0.06, 0.3, 0.04);
      bx(l, 0xffffff, 0, 2.05, 0.405, 0.3, 0.18, 0.01, { shadow: false });
      if (i % 2 === 0) ball(l, [0xff8ad8, 0xffe15a, 0x7fe0ff][i / 2], -0.2, 1.1, 0.42, 0.08, { sz: 0.2 }); // stickers
    }
    // cubbies with bags and lunch boxes, and coat hooks above
    const cub = group(root, -W.side + 0.6, 0, 7.95, PI / 2);
    block(cub, 0xf2d3a0, 0, 0.75, 0, 3.3, 1.5, 0.75, 0.05);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      bx(cub, 0x9a6a3c, -1.07 + c * 1.07, 0.42 + r * 0.66, 0.34, 0.95, 0.56, 0.1, { shadow: false });
      block(cub, [0xff6b6b, 0x4fb7ff, 0x6fd36a, 0xffd23f, 0xa58cff, 0xff8ad8][r * 3 + c], -1.07 + c * 1.07, 0.38 + r * 0.66, 0.36, 0.6, 0.4, 0.2, 0.08);
    }
    for (let i = 0; i < 4; i++) {
      const hz = -1.2 + i * 0.8;
      ball(cub, 0xdfe4ea, hz, 2.3, -0.3, 0.06);
      const bag = [0xff6b6b, 0x4fb7ff, 0xffd23f, 0x6fd36a][i];
      block(cub, bag, hz, 1.95, -0.18, 0.55, 0.65, 0.28, 0.12);
      block(cub, bag, hz, 1.8, -0.02, 0.4, 0.25, 0.08, 0.05);
    }

    // ---------- class pet: Mr. Nibbles the hamster ----------
    const PT = { x: -7.5, z: 10.1 };
    const pet = group(root, PT.x, 0, PT.z);
    block(pet, 0xc98b4a, 0, 0.45, 0, 2.2, 0.9, 0.9, 0.06);
    block(pet, 0xe0a060, 0, 0.92, 0, 2.3, 0.06, 1.0, 0.03);
    A(pet, "petSign", 0.9, 0.27, { y: 0.6, z: -0.46, ry: PI });
    // the cage: a coloured tray, wire bars and a roof
    block(pet, 0x4fb7ff, -0.2, 1.05, 0, 1.3, 0.2, 0.75, 0.05);
    bx(pet, 0xf6e7b8, -0.2, 1.16, 0, 1.2, 0.02, 0.65);
    const bars = [];
    for (let i = 0; i <= 12; i++) {
      const bxp = -0.82 + i * 0.104;
      bars.push({ x: PT.x + bxp, y: 1.5, z: PT.z - 0.36, sx: 0.012, sy: 0.7, sz: 0.012 });
      bars.push({ x: PT.x + bxp, y: 1.5, z: PT.z + 0.36, sx: 0.012, sy: 0.7, sz: 0.012 });
    }
    for (let i = 0; i <= 6; i++) for (const sx of [-0.82, 0.42]) bars.push({ x: PT.x + sx, y: 1.5, z: PT.z - 0.36 + i * 0.12, sx: 0.012, sy: 0.7, sz: 0.012 });
    scatter(root, G.cyl(5), toon(0xdfe4ea), bars);
    block(pet, 0xff6b6b, -0.2, 1.88, 0, 1.36, 0.08, 0.8, 0.04);
    // food bowl, water bottle and a little house
    cylinder(pet, 0xffd23f, 0.15, 1.2, 0.15, 0.12, 0.06);
    for (let i = 0; i < 4; i++) ball(pet, 0xc98b4a, 0.12 + (i % 2) * 0.06, 1.24, 0.12 + (i >> 1) * 0.06, 0.03);
    cylinder(pet, toon(0x9fe0ff, { transparent: true, opacity: 0.7 }), 0.35, 1.55, -0.3, 0.06, 0.4);
    put(pet, G.taper(0.25, 0.25, 4), toon(0xff8ad8), { x: -0.65, y: 1.32, z: 0.05, sy: 0.3, ry: PI / 4 });
    put(pet, G.cone(4), toon(0xff6b8a), { x: -0.65, y: 1.57, z: 0.05, s: 0.3, sy: 0.22, ry: PI / 4 });
    // the hamster wheel (spins) and the hamster (runs!)
    const wheel = dynamic(group(pet, -0.2, 1.5, 0.05));
    put(wheel, G.torus(0.28, 0.025), toon(0xa58cff), { shadow: false });
    for (let i = 0; i < 6; i++) block(wheel, 0xa58cff, Math.cos((i / 6) * TAU) * 0.14, Math.sin((i / 6) * TAU) * 0.14, 0, 0.28, 0.02, 0.02, 0.01, { rz: (i / 6) * TAU, shadow: false });
    mergeStatic(wheel);
    cylinder(pet, 0xa58cff, -0.2, 1.33, 0.05, 0.03, 0.3);
    const ham = dynamic(group(pet, -0.2, 1.27, 0.05));
    ball(ham, 0xffb766, 0, 0.1, 0, 0.12, { sx: 1.25 });
    ball(ham, 0xfff1dc, 0.05, 0.07, 0.05, 0.08);
    ball(ham, 0xffb766, 0.13, 0.15, 0, 0.08);
    ball(ham, 0xff9ec7, 0.11, 0.24, -0.06, 0.03);
    ball(ham, 0xff9ec7, 0.11, 0.24, 0.06, 0.03);
    ball(ham, 0x222222, 0.2, 0.17, -0.04, 0.015);
    ball(ham, 0x222222, 0.2, 0.17, 0.04, 0.015);
    ball(ham, 0xff9ec7, 0.21, 0.13, 0, 0.012);
    mergeStatic(ham);
    // it runs for a while, then stops for a snack
    anim.push((t) => {
      const k = t % 12;
      const running = k < 7;
      wheel.rotation.z = running ? -t * 6 : -Math.floor(t / 12) * 42;
      ham.position.set(running ? -0.2 : 0.02, 1.27 + (running ? Math.abs(Math.sin(t * 12)) * 0.03 : 0), running ? 0.05 : 0.12);
      ham.rotation.y = running ? 0 : -0.5 + Math.sin(t * 2) * 0.2;
      ham.scale.y = running ? 1 : 1 + Math.sin(t * 8) * 0.05;
    });

    // plants by the door
    for (const px of [-3.4, 3.4]) {
      cylinder(root, 0xffffff, px, 0.4, 10.0, 0.4, 0.8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        put(root, G.sphere(), toon(i % 2 ? 0x46b04a : 0x5cc84a), { x: px + Math.cos(a) * 0.3, y: 1.4 + (i % 3) * 0.25, z: 10.0 + Math.sin(a) * 0.3, sx: 0.2, sy: 0.7, sz: 0.2, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 });
      }
    }
    // a waste paper basket by the teacher's desk
    put(root, G.taper(0.3, 0.24), toon(0x4fb7ff), { x: TD.x + 2.0, y: 0.3, z: TD.z - 0.2, sy: 0.6 });
    ball(root, 0xffffff, TD.x + 2.05, 0.62, TD.z - 0.2, 0.1);

    // every book in one go
    scatter(root, G.box(), toon(0xffffff), books, true);

    // ---------- merge everything that doesn't move ----------
    const walls = [
      { group: backWall, axis: "z", at: W.back, outside: -1 },
      { group: frontWall, axis: "z", at: W.front, outside: 1 },
      { group: leftWall, axis: "x", at: -W.side, outside: -1 },
      { group: rightWall, axis: "x", at: W.side, outside: 1 },
    ];
    for (const w of walls) { mergeStatic(w.group); dynamic(w.group); }
    mergeStatic(root);

    // ---------- spots ----------
    const studyLines = [
      ["*scribble scribble*", "What's 7 + 5 again?", "I know the answer!", "Can I borrow an eraser?"],
      ["Spelling is hard...", "Psst! Pass me a note!", "*doodles in notebook*", "Is it lunchtime yet?"],
      ["I finished my homework!", "*raises hand*", "Ooh, a pop quiz?!", "My pencil broke!"],
    ];
    const studySpot = (col, row, i) => ({
      x: CX[col], z: RZ[row] + 2.0, yaw: PI, arms: "type", emoji: ["✏️", "📓", "📝"][i], activity: "studying at a desk",
      seat: { x: CX[col], z: RZ[row] + 0.85, y: 0.0 },
      lines: studyLines[i],
    });

    return {
      group: root,
      background: 0xd6efff,
      fog: [0xd6efff, 90, 300],
      cameraTilt: 0.5,
      bounds: { minX: -17.3, maxX: 17.3, minZ: -10.3, maxZ: 10 },
      water: [],
      obstacles: RZ.map((z) => ({ x: -5, z: z + 0.35, w: 11.0, d: 1.75 }))           // the rows of desks and chairs
        .concat([
          { x: BB.x, z: W.back + 0.55, w: BB.w + 0.4, d: 0.5 },                         // the blackboard's chalk tray
          { x: TD.x, z: TD.z - 0.5, w: 3.4, d: 2.4 },                                   // teacher's desk + chair
          { x: TD.x + 2.0, z: TD.z - 0.2, r: 0.35 },                                    // waste paper basket
          { x: GL.x, z: GL.z, r: 0.6 },                                                 // globe
          { x: SC.x, z: SC.z, w: 5.7, d: 1.3 },                                         // science bench
          { x: 16.7, z: -9.9, r: 0.65 },                                                // big plant
          { x: 16.45, z: PN.z, w: 2.6, d: 2.9 },                                        // piano + bench
          { x: E1.x, z: E1.z, r: 0.6 }, { x: E2.x, z: E2.z, r: 0.6 },                   // easels
          { x: AT.x, z: AT.z + 0.25, w: 2.7, d: 2.1, rot: -0.1 },                       // art table + stools
          { x: W.side - 0.6, z: 6.2, w: 1.0, d: 6.4 },                                  // bookshelves
          { x: 15.4, z: 9.0, w: 1.4, d: 0.7 },                                          // book box
          { x: BB1.x, z: BB1.z - 0.1, r: 0.65 }, { x: 14.9, z: 4.7, r: 0.65 }, { x: 11.2, z: 5.1, r: 0.65 }, // beanbags
          { x: -W.side + 0.65, z: 2.4, w: 1.0, d: 6.2 },                                // lockers
          { x: -W.side + 0.6, z: 7.95, w: 1.0, d: 3.4 },                                // cubbies
          { x: PT.x, z: PT.z, w: 2.4, d: 1.1 },                                         // hamster table
          { x: -3.4, z: 10.0, r: 0.5 }, { x: 3.4, z: 10.0, r: 0.5 },                    // plants by the door
        ]),
      spots: [
        studySpot(1, 0, 0), studySpot(2, 1, 1), studySpot(0, 2, 2),
        { x: BB.x, z: -9.45, yaw: 0, arms: "out", emoji: "👩‍🏫", activity: "teaching the class",
          lines: ["Good morning, class!", "Who knows the answer?", "Eyes on the board, please!", "Today we learn fractions!", "Great job, everyone!"] },
        { x: GL.x, z: -9.95, yaw: 0, emoji: "🌍", activity: "looking at the globe",
          lines: ["Where do I live again?", "*spins the globe*", "So much ocean!", "I want to go there someday!"] },
        { x: -15.2, z: -9.85, yaw: PI, lookUp: 0.1, emoji: "🪟", activity: "gazing out the window",
          lines: ["The playground looks fun...", "Is it break time yet?", "I can see the sports field!", "*daydreaming*"] },
        { x: SC.x - 0.3, z: -8.5, yaw: PI, arms: "type", emoji: "🔬", activity: "doing a science experiment",
          lines: ["Whoa, the volcano bubbles!", "Look at the tiny cells!", "Hypothesis: it'll explode!", "Science is awesome!"] },
        { x: E1.x + Math.sin(E1.ry) * 1.3, z: E1.z + Math.cos(E1.ry) * 1.3, yaw: E1.ry + PI, arms: "wave", emoji: "🎨", activity: "painting at an easel",
          lines: ["A little more blue...", "It's a masterpiece!", "Oops, paint on my nose!", "Happy little trees~"] },
        { x: PN.x - 2.75, z: PN.z, yaw: PI / 2, arms: "type", emoji: "🎹", activity: "playing the piano",
          lines: ["Do re mi fa so~", "♪ La la la ♪", "I practised all week!", "Chopsticks, anyone?"],
          seat: { x: PN.x - 1.4, z: PN.z, y: 0.06 } },
        { x: BB1.x, z: BB1.z + 1.5, yaw: 0, emoji: "📖", activity: "reading in the reading corner",
          lines: ["Just one more chapter...", "This book is so good!", "Shh, I'm reading.", "Once upon a time..."],
          seat: { x: BB1.x, z: BB1.z - 0.05, y: -0.12 } },
        { x: PT.x, z: PT.z - 1.5, yaw: 0, arms: "out", emoji: "🐹", activity: "feeding the class hamster",
          lines: ["Here you go, Mr. Nibbles!", "He's running so fast!", "Who's a cute hamster?", "Sunflower seeds, yum!"] },
        { x: -W.side + 2.1, z: 2.4, yaw: -PI / 2, emoji: "🎒", activity: "checking the lockers",
          lines: ["Where's my gym bag?", "Found my lunch!", "Who put a frog in here?!", "My locker is so messy..."] },
      ],
      lines: [
        "Did you do the homework?", "I love school!", "What's for lunch today?", "Let's play at break time!",
        "Shh, the teacher's coming!", "I got a gold star!", "Can I sharpen my pencil?", "School is fun!",
        "Who wants to be my partner?", "Ding ding! The bell!",
      ],
      entrance: { x: 0, z: 9.4 },
      update(t, camera) {
        anim.forEach((a) => a(t));
        // hide any wall that's between the camera and the room
        if (camera) {
          for (const w of walls) {
            const c = w.axis === "z" ? camera.position.z : camera.position.x;
            w.group.visible = (c - w.at) * w.outside < 0;
          }
        }
      },
    };
  }

  // ---------------------------------------------------------------------
  // Outside the school: the schoolyard, playground, sports field and town
  // ---------------------------------------------------------------------
  function schoolGrounds(root, anim, atlas) {
    const A = atlas.pic;
    disc(root, toon(0xffffff, { map: grassTexture([70, 70]) }), 0, -0.03, 0, 230);
    // the building's base and a pavement all round it
    block(root, 0xe6dccb, 0, -0.15, 0, 37.4, 0.3, 23.4, 0.05, { shadow: false });
    bx(root, 0xeae3d6, 0, -0.025, 0, 41, 0.01, 27, { shadow: false });

    // ----- behind the school: tarmac with painted games, playground, field -----
    A(root, "yard", 30, 10, { x: -9, y: -0.015, z: -18.5, rx: -PI / 2 });
    // basketball hoop
    const hoop = group(root, -21, 0, -23.2);
    cylinder(hoop, 0x4f5a6e, 0, 1.6, 0, 0.1, 3.2);
    block(hoop, 0xffffff, 0, 3.4, 0.3, 1.6, 1.0, 0.08, 0.03);
    bx(hoop, 0xff6b3a, 0, 3.25, 0.35, 0.6, 0.45, 0.02, { shadow: false });
    put(hoop, G.torus(0.28, 0.03), toon(0xff6b3a), { y: 3.0, z: 0.7, rx: PI / 2 });
    // playground on soft wood chips
    disc(root, toon(0xe7c48f), 14, -0.01, -21, 1, { sx: 8, sy: 6.5 });
    const PG = { x: 14, z: -21 };
    // slide
    const sl = group(root, PG.x - 3.5, 0, PG.z + 0.5);
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) cylinder(sl, 0xff6b6b, sx, 1.6, sz, 0.08, 3.2);
    block(sl, 0x4fb7ff, 0, 2.2, 0, 1.3, 0.12, 1.3, 0.04);
    put(sl, G.cone(4), toon(0xffd23f), { y: 3.6, s: 1.1, sy: 0.8, ry: PI / 4 });
    for (let i = 0; i < 6; i++) bx(sl, 0x4fb7ff, 0, 0.35 + i * 0.35, -0.95, 0.8, 0.06, 0.08);
    for (const sx of [-0.42, 0.42]) bx(sl, 0x4fb7ff, sx, 1.1, -0.95, 0.07, 2.3, 0.07);
    block(sl, 0xffd23f, 1.9, 1.2, 0, 3.2, 0.1, 0.8, 0.04, { rz: -0.6 });
    for (const sz of [-0.42, 0.42]) block(sl, 0xffb84d, 1.9, 1.35, sz, 3.2, 0.25, 0.06, 0.03, { rz: -0.6 });
    // swings (they swing!)
    const sw = group(root, PG.x + 3.0, 0, PG.z - 1.5);
    for (const sx of [-1.8, 1.8]) for (const sz of [-0.8, 0.8]) block(sw, 0x4fb7ff, sx, 1.65, sz * 0.5, 0.12, 3.5, 0.12, 0.04, { rx: -sz * 0.25 });
    cylinder(sw, 0x4fb7ff, 0, 3.3, 0, 0.08, 3.8, { rz: PI / 2 });
    [-0.85, 0.85].forEach((sx, i) => {
      const seat = movingThing(sw, sx, 3.3, 0, (g) => {
        for (const dx of [-0.25, 0.25]) cylinder(g, 0x9aa3b0, dx, -1.3, 0, 0.015, 2.6, { seg: 4 });
        block(g, [0xff6b6b, 0xffd23f][i], 0, -2.6, 0, 0.65, 0.08, 0.32, 0.03);
      });
      anim.push((t) => { seat.rotation.x = Math.sin(t * 1.9 + i * 1.7) * 0.45; });
    });
    // climbing dome
    const dome = group(root, PG.x - 0.5, 0, PG.z - 4.0);
    for (let i = 0; i < 4; i++) put(dome, G.torus(1.6, 0.05), toon([0xff6b6b, 0xffd23f, 0x6fd36a, 0x4fb7ff][i]), { ry: (i / 4) * PI });
    for (const y of [0.6, 1.2]) put(dome, G.torus(Math.sqrt(1.6 * 1.6 - y * y), 0.05), toon(0xa58cff), { y, rx: PI / 2 });
    // seesaw (goes up and down)
    cylinder(root, 0x9aa3b0, PG.x + 4.2, 0.3, PG.z + 2.8, 0.15, 0.6);
    const seesaw = movingThing(root, PG.x + 4.2, 0.6, PG.z + 2.8, (g) => {
      block(g, 0x6fd36a, 0, 0, 0, 3.4, 0.1, 0.4, 0.04);
      for (const sx of [-1.5, 1.5]) cylinder(g, 0xff6b6b, sx, 0.25, 0, 0.04, 0.45);
    });
    anim.push((t) => { seesaw.rotation.z = Math.sin(t * 1.2) * 0.22; });
    // sandbox
    block(root, 0xc98b4a, PG.x + 4.5, 0.15, PG.z - 4.0, 2.8, 0.3, 2.4, 0.06);
    bx(root, 0xf2dc9c, PG.x + 4.5, 0.27, PG.z - 4.0, 2.5, 0.06, 2.1);
    put(root, G.taper(0.15, 0.2), toon(0xff6b6b), { x: PG.x + 4.0, y: 0.4, z: PG.z - 4.2, sy: 0.25 });

    // sports field with a running track
    const F = { x: -6, z: -37 };
    const rr = (w, h, r) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.absarc(w / 2 - r, -h / 2 + r, r, -PI / 2, 0);
      s.lineTo(w / 2, h / 2 - r); s.absarc(w / 2 - r, h / 2 - r, r, 0, PI / 2);
      s.lineTo(-w / 2 + r, h / 2); s.absarc(-w / 2 + r, h / 2 - r, r, PI / 2, PI);
      s.lineTo(-w / 2, -h / 2 + r); s.absarc(-w / 2 + r, -h / 2 + r, r, PI, PI * 1.5);
      return s;
    };
    const trackShape = rr(38, 24, 11.5);
    trackShape.holes.push(rr(31, 17, 8));
    put(root, new THREE.ShapeGeometry(trackShape, 24).rotateX(-PI / 2), toon(0xe0785a), { x: F.x, y: -0.01, z: F.z, shadow: false });
    for (const k of [0.33, 0.66]) {
      const lane = rr(31 + 7 * k, 17 + 7 * k, 8 + 3.5 * k);
      lane.holes.push(rr(31 + 7 * k - 0.15, 17 + 7 * k - 0.15, 8 + 3.5 * k - 0.075));
      put(root, new THREE.ShapeGeometry(lane, 24).rotateX(-PI / 2), toon(0xffffff), { x: F.x, y: -0.005, z: F.z, shadow: false });
    }
    A(root, "field", 26, 13, { x: F.x, y: -0.012, z: F.z, rx: -PI / 2 });
    for (const side of [-1, 1]) {
      const gl = group(root, F.x + side * 12.6, 0, F.z, side > 0 ? -PI / 2 : PI / 2);
      for (const sx of [-1.6, 1.6]) cylinder(gl, 0xffffff, sx, 0.9, 0, 0.07, 1.8);
      cylinder(gl, 0xffffff, 0, 1.8, 0, 0.07, 3.2, { rz: PI / 2 });
      bx(gl, 0xdfe4ea, 0, 0.9, -0.7, 3.2, 1.8, 0.03, { shadow: false });
    }
    ball(root, 0xffffff, F.x + 2, 0.25, F.z + 1, 0.25);

    // ----- in front of the school -----
    bx(root, 0xf0dcb4, 0, -0.012, 17.5, 3.4, 0.01, 13, { shadow: false });   // path to the gate
    // flower beds along the front of the building
    const flowers = [];
    const fr = seeded(6);
    for (const cx of [-10, 10]) {
      block(root, 0xb07a45, cx, 0.18, 12.4, 13, 0.36, 0.9, 0.05);
      bx(root, 0x7a4e2c, cx, 0.37, 12.4, 12.6, 0.04, 0.7, { shadow: false });
      for (let i = 0; i < 26; i++) flowers.push({ x: cx - 6 + i * 0.48, y: 0.5, z: 12.4 + (fr() - 0.5) * 0.4, s: 0.12, color: [0xff6b8a, 0xffd23f, 0xffffff, 0xa58cff, 0xff8a5c][Math.floor(fr() * 5)] });
    }
    scatter(root, G.lowSphere(), toon(0xffffff), flowers);
    // flagpole with a waving flag
    const FP = { x: 7.5, z: 15.5 };
    cylinder(root, 0xdfe4ea, FP.x, 0.15, FP.z, 0.4, 0.3);
    cylinder(root, 0xdfe4ea, FP.x, 4.0, FP.z, 0.07, 8.0);
    ball(root, 0xffd23f, FP.x, 8.05, FP.z, 0.14);
    const flagGeo = atlas.fit("flag", new THREE.PlaneGeometry(2.2, 1.4, 10, 1));
    const flagBase = flagGeo.attributes.position.array.slice();
    const flag = dynamic(put(root, flagGeo, toon(0xffffff, { map: atlas.tex, side: THREE.DoubleSide }), { x: FP.x + 1.15, y: 7.1, z: FP.z, shadow: false }));
    anim.push((t) => {
      const pos = flagGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = flagBase[i * 3] + 1.1; // 0 at the pole
        pos.setZ(i, Math.sin(x * 2.4 - t * 4) * 0.14 * x);
        pos.setY(i, flagBase[i * 3 + 1] - x * 0.04);
      }
      pos.needsUpdate = true;
      flagGeo.computeVertexNormals();
    });
    void flag;
    // the school sign
    const sign = group(root, -7, 0, 15.6, 0.15);
    block(sign, 0xc9a07a, 0, 0.4, 0, 3.6, 0.8, 0.6, 0.08);
    block(sign, 0xffffff, 0, 1.55, 0, 3.4, 1.15, 0.14, 0.08);
    A(sign, "schoolSign", 3.2, 0.96, { y: 1.55, z: 0.08 });
    A(sign, "schoolSign", 3.2, 0.96, { y: 1.55, z: -0.08, ry: PI });
    // bike rack with bikes (one baked shape for all the bikes)
    const bikeGeo = bakeGeo((b) => {
      for (const sz of [-0.55, 0.55]) put(b, G.torus(0.32, 0.04), toon(0x333333), { y: 0.36, z: sz, ry: PI / 2 });
      put(b, G.box(), toon(0xffffff), { y: 0.6, sx: 0.06, sy: 0.06, sz: 1.0 });
      put(b, G.box(), toon(0xffffff), { y: 0.5, z: -0.2, sx: 0.06, sy: 0.4, sz: 0.06, rx: 0.4 });
      put(b, G.box(), toon(0x333333), { y: 0.82, z: -0.25, sx: 0.12, sy: 0.05, sz: 0.25 });
      put(b, G.box(), toon(0x333333), { y: 0.9, z: 0.5, sx: 0.5, sy: 0.04, sz: 0.04 });
    });
    bx(root, 0x9aa3b0, -13.5, 0.4, 15.8, 4.2, 0.06, 0.06);
    [[0xff6b6b, -15], [0x4fb7ff, -14], [0x6fd36a, -12.6]].forEach(([c, x]) => {
      const bk = put(root, bikeGeo, new THREE.MeshToonMaterial({ color: c, gradientMap, vertexColors: true }), { x, z: 15.8, shadow: true });
      void bk;
    });
    parkBench(root, 13, 16, PI);
    lampPost(root, -2.6, 23); lampPost(root, 2.6, 23);
    // a little picket fence along the front, with a gap for the gate
    const pickets = [];
    for (let x = -26; x <= 26; x += 0.45) if (Math.abs(x) > 2.3) pickets.push({ x, y: 0.5, z: 23.5, sx: 0.16, sy: 1.0, sz: 0.06 });
    scatter(root, G.box(), toon(0xffffff), pickets, true);
    for (const sx of [-1, 1]) bx(root, 0xffffff, sx * 14.2, 0.7, 23.5, 23.6, 0.1, 0.05);

    // ----- the left side: a vegetable garden and a shed -----
    const veg = [];
    for (let i = 0; i < 3; i++) {
      const gz = -5 + i * 4.2;
      block(root, 0xb07a45, -26, 0.25, gz, 5, 0.5, 1.6, 0.06);
      bx(root, 0x6b4426, -26, 0.51, gz, 4.7, 0.04, 1.35, { shadow: false });
      for (let k = 0; k < 7; k++) {
        const vx = -28.1 + k * 0.7;
        if (i === 0) veg.push({ x: vx, y: 0.75, z: gz, s: 0.3, sy: 0.25, color: 0x8fd36a });            // cabbages
        else if (i === 1) { veg.push({ x: vx, y: 0.8, z: gz, sx: 0.08, sy: 0.3, sz: 0.08, color: 0x5cc84a }); veg.push({ x: vx, y: 0.6, z: gz, s: 0.1, color: 0xff8a2a }); } // carrots
        else { veg.push({ x: vx, y: 1.0, z: gz, sx: 0.04, sy: 0.6, sz: 0.04, color: 0x8a6a3a }); veg.push({ x: vx + 0.1, y: 0.95, z: gz + 0.1, s: 0.1, color: 0xff3b3b }); veg.push({ x: vx - 0.1, y: 1.15, z: gz - 0.05, s: 0.09, color: 0xff3b3b }); } // tomatoes
      }
    }
    scatter(root, G.lowSphere(), toon(0xffffff), veg);
    const crow = group(root, -30, 0, -1);
    cylinder(crow, 0x9a6a3c, 0, 1.2, 0, 0.06, 2.4);
    cylinder(crow, 0x9a6a3c, 0, 1.8, 0, 0.05, 1.8, { rz: PI / 2 });
    block(crow, 0x4fb7ff, 0, 1.6, 0, 0.7, 0.8, 0.35, 0.1);
    ball(crow, 0xf2d38a, 0, 2.35, 0, 0.3);
    cylinder(crow, 0xe8c060, 0, 2.6, 0, 0.5, 0.05);
    put(crow, G.cone(), toon(0xe8c060), { y: 2.75, s: 0.3, sy: 0.3 });
    const shed = group(root, -27, 0, 9, 0.3);
    block(shed, 0xa8d8a0, 0, 1.2, 0, 3.2, 2.4, 2.6, 0.06);
    put(shed, G.cone(4), toon(0xe2574c), { y: 3.0, sx: 2.6, sy: 1.2, sz: 2.2, ry: PI / 4 });
    bx(shed, 0x9a6a3c, 0, 0.85, 1.31, 1.0, 1.7, 0.06);

    // ----- the right side: parking with a yellow school bus -----
    bx(root, 0x9ea3b2, 27.5, -0.02, 2, 12, 0.01, 22, { shadow: false });
    const bus = group(root, 27.5, 0, 1.5);
    block(bus, 0xffc93c, 0, 1.75, 0, 2.6, 2.4, 9.0, 0.3);
    block(bus, 0xffc93c, 0, 1.2, 5.0, 2.5, 1.4, 1.4, 0.3);
    bx(bus, 0x9fd3f0, 0, 2.35, 0, 2.64, 0.8, 8.2);
    bx(bus, 0x9fd3f0, 0, 2.35, 4.51, 2.2, 0.8, 0.04);
    for (const y of [1.3, 1.6]) bx(bus, 0x333333, 0, y, 0, 2.64, 0.08, 8.6);
    for (const sz of [-3, 3.6]) for (const sx of [-1.25, 1.25]) cylinder(bus, 0x2a2f38, sx, 0.5, sz, 0.5, 0.35, { rz: PI / 2 });
    ball(bus, glow(0xfff1b0, 0.8), -0.8, 1.2, 5.72, 0.15);
    ball(bus, glow(0xfff1b0, 0.8), 0.8, 1.2, 5.72, 0.15);
    A(bus, "bus", 3.4, 0.6, { x: -1.32, y: 2.9, z: 0, ry: -PI / 2 });
    A(bus, "bus", 3.4, 0.6, { x: 1.32, y: 2.9, z: 0, ry: PI / 2 });
    put(bus, G.cyl(8), toon(0xe23b3b), { x: -1.45, y: 1.9, z: 3.2, s: 0.35, sy: 0.04, rz: PI / 2 });
    // a couple of parked cars
    [[0xff6b6b, 24, -6], [0x6fd36a, 31, -6], [0xffffff, 31, 9]].forEach(([c, x, z]) => {
      put(root, carGeo, new THREE.MeshToonMaterial({ color: c, gradientMap, vertexColors: true }), { x, z, s: 1.1, shadow: true });
    });

    // ----- trees around the school (kept away from the walls so they don't block the view) -----
    const trees = [[-23, -15, 1.1], [-31, -26, 1.2], [22, -31, 1.1], [27, -17, 1.0], [-22, 18, 1.0], [21, 19, 1.1],
      [-33, 12, 1.2], [34, -8, 1.0], [6, -30, 0.9], [-30, -42, 1.2], [18, -44, 1.1]];
    trees.forEach(([x, z, s], i) => roundTree(root, x, z, s, i % 4 === 2 ? [0xff9ec7, 0xffc3dc] : [0x5cc84a, 0x7fdc5c], i % 5 === 1 ? 0xff4b3a : null));
    for (const [x, z] of [[-20, 13], [19.5, 14], [-25, -12], [24, -24]]) bush(root, x, z, 1, 0x4fbf47, 0xff6fa5);

    // ----- the town all around: a ring road with cars, houses, trees and hills -----
    const ROAD = 58;
    const roadTex = canvasTexture(64, 16, (ctx, w, h) => {
      ctx.fillStyle = "#8a90a2"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 7, w * 0.5, 2);
    }, [60, 1]);
    const ringGeo = new THREE.RingGeometry(ROAD - 2.5, ROAD + 2.5, 96, 1);
    // map the road picture along the ring
    const ruv = ringGeo.attributes.uv, rpos = ringGeo.attributes.position;
    for (let i = 0; i < ruv.count; i++) {
      const x = rpos.getX(i), y = rpos.getY(i);
      ruv.setXY(i, (Math.atan2(y, x) / TAU + 0.5), (Math.hypot(x, y) - (ROAD - 2.5)) / 5);
    }
    put(root, ringGeo, toon(0xffffff, { map: roadTex }), { y: -0.02, rx: -PI / 2, shadow: false, receive: false });
    const cars = farScatter(root, carGeo, paintMat, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 0, z: 0, color: [0xff6b6b, 0x4fb7ff, 0xffd23f, 0x6fd36a, 0xffffff, 0xff8a5c, 0xa58cff, 0x3fc6c6][i] })));
    dynamic(cars);
    anim.push((t) => {
      for (let i = 0; i < 8; i++) {
        const dir = i % 2 ? 1 : -1;
        const a = (i / 8) * TAU + dir * t * 0.05;
        const r = ROAD + dir * 1.2;
        tmpO.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        tmpO.rotation.set(0, -a + (dir > 0 ? PI : 0), 0);
        tmpO.scale.setScalar(1.2);
        tmpO.updateMatrix();
        cars.setMatrixAt(i, tmpO.matrix);
      }
      cars.instanceMatrix.needsUpdate = true;
    });
    const keepOut = (x, z) => (Math.abs(Math.hypot(x, z) - ROAD) < 6) ||
      (x > -30 && x < 40 && z > -50 && z < 28) || (x > -28 && x < 16 && z > -52);
    farTown(root, { seed: 21, houses: [55, 66, 115], trees: [170, 30, 125], hills: [24, 175], keepOut });
    const blocks = [];
    const br = seeded(33);
    for (let i = 0; i < 26; i++) {
      const a = br() * TAU, d = 125 + br() * 30;
      blocks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, sx: 10 + br() * 8, sy: 12 + br() * 22, sz: 10 + br() * 8, ry: a, color: [0xffe2b8, 0xbcdcff, 0xffc8dc, 0xd6c8ff, 0xf2f2f2][Math.floor(br() * 5)] });
    }
    farScatter(root, unitBox, windowMaterial({ color: 0xffffff, glass: 0x7fc0ee, lit: 0xfff1a8, w: 2.4, h: 3.4 }), blocks);
    const cloudMat = toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 });
    cloudRing(root, anim, cloudMat, { count: 12, rMin: 60, rMax: 95, yMin: 20, yMax: 32, sMin: 1.0, sMax: 1.6, speed: 0.008, seed: 4 });
    cloudRing(root, anim, cloudMat, { count: 14, rMin: 140, rMax: 200, yMin: 30, yMax: 55, sMin: 2.2, sMax: 3.4, speed: 0.004, seed: 8, start: 1 });
  }
  const tmpO = new THREE.Object3D();

  // =====================================================================
  // CONCERT STAGE — a music festival in the park at sunset
  // =====================================================================
  function stageAtlas() {
    return makeAtlas(1024, {
      backdrop: [1020, 370, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#2a1b5e"); g.addColorStop(1, "#7a2f8f");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const r = seeded(3);
        for (let i = 0; i < 70; i++) { ctx.fillStyle = "rgba(255,255,255," + (0.3 + r() * 0.7) + ")"; star(ctx, r() * w, r() * h, 2 + r() * 5); ctx.fill(); }
        // sun-burst rays behind the logo
        ctx.save(); ctx.translate(w / 2, h * 0.55);
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = i % 2 ? "rgba(255,180,90,0.22)" : "rgba(255,110,170,0.16)";
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 600, (i / 24) * TAU, ((i + 1) / 24) * TAU); ctx.fill();
        }
        ctx.restore();
        ctx.lineWidth = 14; ctx.strokeStyle = "#2a1b5e"; ctx.font = "900 150px 'Nunito', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.strokeText("MII FEST", w / 2, h * 0.47);
        const tg = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.65);
        tg.addColorStop(0, "#ffe15a"); tg.addColorStop(1, "#ff6b8a");
        ctx.fillStyle = tg; ctx.fillText("MII FEST", w / 2, h * 0.47);
        text(ctx, "★ LIVE IN THE PARK ★", w / 2, h * 0.82, 44, "#9fe0ff");
      }],
      gate: [600, 110, (ctx, w, h) => {
        ctx.fillStyle = "#ff6b8a"; roundRect(ctx, 2, 2, w - 4, h - 4, 30); ctx.fill();
        ctx.strokeStyle = "#ffe15a"; ctx.lineWidth = 6; roundRect(ctx, 12, 12, w - 24, h - 24, 22); ctx.stroke();
        text(ctx, "★ MII FEST ★", w / 2, h / 2 + 4, 64, "#ffffff");
      }],
      burger: [300, 80, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; roundRect(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
        text(ctx, "Yummy Burgers", w / 2, h / 2 + 2, 40, "#e2574c");
      }],
      menu: [160, 200, (ctx, w, h) => {
        ctx.fillStyle = "#2f3542"; ctx.fillRect(0, 0, w, h);
        text(ctx, "MENU", w / 2, 26, 28, "#ffe15a");
        ["Burger  3", "Fries  2", "Hot dog  2", "Ice cream 1"].forEach((s, i) => text(ctx, s, w / 2, 70 + i * 34, 20, "#ffffff"));
      }],
      lemonade: [300, 80, (ctx, w, h) => {
        ctx.fillStyle = "#ffe15a"; roundRect(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
        text(ctx, "Lemonade", w / 2, h / 2 + 2, 46, "#3a9a3a");
      }],
      merch: [300, 80, (ctx, w, h) => {
        ctx.fillStyle = "#a58cff"; roundRect(ctx, 2, 2, w - 4, h - 4, 18); ctx.fill();
        text(ctx, "MERCH", w / 2, h / 2 + 2, 50, "#ffffff");
      }],
      shirt: [100, 100, (ctx, w, h) => {
        ctx.fillStyle = "#2f3542"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffe15a"; star(ctx, w / 2, h / 2 - 6, 30); ctx.fill();
        text(ctx, "MII FEST", w / 2, h - 16, 16, "#ff8ad8");
      }],
      drumhead: [200, 200, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ff6b8a"; star(ctx, w / 2, h / 2 - 10, 50); ctx.fill();
        text(ctx, "THE MIIS", w / 2, h * 0.8, 26, "#2a1b5e");
      }],
      keys: [256, 40, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        const n = 22, kw = w / n;
        ctx.fillStyle = "#c9c9c9"; for (let i = 1; i < n; i++) ctx.fillRect(i * kw - 1, 0, 2, h);
        ctx.fillStyle = "#222";
        for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) ctx.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
      }],
      grill: [128, 128, (ctx, w, h) => {
        ctx.fillStyle = "#2a2a30"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#3c3c44"; for (let y = 4; y < h; y += 8) for (let x = 4 + (y % 16 ? 4 : 0); x < w; x += 8) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
      }],
      awning: [128, 64, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#ffffff" : "#ff6b6b"; ctx.fillRect(i * 16, 0, 16, h); }
      }],
      awning2: [128, 64, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#ffffff" : "#4fb7ff"; ctx.fillRect(i * 16, 0, 16, h); }
      }],
      awning3: [128, 64, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#ffe15a" : "#a58cff"; ctx.fillRect(i * 16, 0, 16, h); }
      }],
    });
  }

  function buildStage() {
    const root = new THREE.Group();
    const anim = [];
    addLights(root, { sky: 0xffc08a, ground: 0x8a7a5a, hemi: 0.58, sun: 0.95, sunColor: 0xffb06a, ambient: 0.2, fill: 0.26 });
    // make the sun low and warm: it's nearly sunset
    root.children.forEach((l) => { if (l.isDirectionalLight && l.castShadow) l.position.set(-16, 11, 12); });
    skyDome(root, 0x4b57b8, 0xffa774, 0xffd29a);
    const atlas = stageAtlas();
    const A = atlas.pic;
    const tmp = new THREE.Object3D();

    // the setting sun and its glow, low in the sky behind the city
    const sunGrp = group(root, -95, 26, -205);
    sunGrp.lookAt(0, 10, 0);
    put(sunGrp, G.circle(), new THREE.MeshBasicMaterial({ color: 0xffe7a8, fog: false, toneMapped: false }), { s: 14, shadow: false, receive: false });
    put(sunGrp, G.circle(), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.35, fog: false, depthWrite: false, toneMapped: false }), { s: 26, z: -0.5, shadow: false, receive: false });
    sunGrp.children.forEach((m) => dynamic(m));

    // ---------- ground: warm grass, a wooden dance floor and gravel paths ----------
    disc(root, toon(0xffffff, { map: grassTexture([70, 70], "#a6c955", 5) }), 0, -0.02, 0, 230);
    put(root, new THREE.PlaneGeometry(18, 7.6), toon(0xffffff, { map: planksTexture([5, 2.2], ["#c98b52", "#d29a5e", "#bd8148", "#d8a467"]) }), { y: 0.035, z: -1.4, rx: -PI / 2, shadow: false });
    bx(root, 0x9a6a3c, 0, 0.01, -1.4, 18.4, 0.04, 8.0, { shadow: false });
    const gravel = toon(0xe8d3a8);
    bx(root, gravel, 0, -0.005, 6.2, 3.0, 0.01, 9.5, { shadow: false });
    bx(root, gravel, 0, -0.004, 4.0, 30, 0.01, 2.4, { shadow: false });

    // ---------- the stage ----------
    const ST = { z0: -9.6, z1: -5.4, h: 1.0, w: 18.4 };
    const stz = (ST.z0 + ST.z1) / 2;
    block(root, 0x3a3346, 0, ST.h / 2, stz, ST.w, ST.h, ST.z1 - ST.z0, 0.06);
    bx(root, 0x5b4a6e, 0, ST.h + 0.01, stz, ST.w - 0.1, 0.02, ST.z1 - ST.z0 - 0.1, { shadow: false });
    // glowing strip along the front of the stage (changes colour)
    const ledMat = toon(0xff6b8a, { emissive: 0xff6b8a, emissiveIntensity: 0.9 });
    dynamic(bx(root, ledMat, 0, 0.82, ST.z1 + 0.01, ST.w - 0.2, 0.12, 0.04, { shadow: false }));
    anim.push((t) => { ledMat.emissive.setHSL((t * 0.08) % 1, 0.9, 0.55); ledMat.color.copy(ledMat.emissive); });
    // steps at the back corners
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const h = (3 - i) * 0.33;
      bx(root, 0x4a4058, sx * (ST.w / 2 + 0.18 + i * 0.35), h / 2, ST.z0 + 0.6, 0.35, h, 0.9);
    }
    // backdrop with the festival logo. It and the roof hide when the camera is
    // behind the stage (like the walls of the school), so you can see the band.
    const backdrop = group(root);
    A(backdrop, "backdrop", 17.6, 6.4, { x: 0, y: ST.h + 3.3, z: ST.z0 + 0.12 });
    block(backdrop, 0x2a2438, 0, ST.h + 3.3, ST.z0 + 0.02, 18.0, 6.8, 0.16, 0.04);
    // the roof: truss towers at the corners, beams across, and a curved canopy on top
    const TR = 8.4; // height of the top beams
    const trussMat = toon(0xc9ced8);
    const tower = (x, z, h) => {
      const g = group(root, x, 0, z);
      for (const dx of [-0.22, 0.22]) for (const dz of [-0.22, 0.22]) put(g, G.cyl(6), trussMat, { x: dx, y: h / 2, z: dz, sx: 0.04, sy: h, sz: 0.04 });
      for (let y = 0.3; y < h - 0.3; y += 0.6) {
        put(g, G.cyl(4), trussMat, { y: y + 0.3, z: 0.22, sx: 0.025, sy: 0.75, sz: 0.025, rz: 0.6 });
        put(g, G.cyl(4), trussMat, { y: y + 0.3, x: 0.22, sx: 0.025, sy: 0.75, sz: 0.025, rx: 0.6 });
        put(g, G.cyl(4), trussMat, { y: y + 0.3, z: -0.22, sx: 0.025, sy: 0.75, sz: 0.025, rz: -0.6 });
        put(g, G.cyl(4), trussMat, { y: y + 0.3, x: -0.22, sx: 0.025, sy: 0.75, sz: 0.025, rx: -0.6 });
      }
      bx(g, 0x2a2438, 0, 0.1, 0, 0.8, 0.2, 0.8);
    };
    const beam = (x0, z0, x1, z1, y) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      const g = group(root, (x0 + x1) / 2, y, (z0 + z1) / 2, -ang);
      for (const dy of [-0.22, 0.22]) for (const dz of [-0.22, 0.22]) put(g, G.cyl(6), trussMat, { y: dy, z: dz, sx: 0.04, sy: len, sz: 0.04, rz: PI / 2 });
      for (let k = -len / 2 + 0.3; k < len / 2 - 0.3; k += 0.6) {
        put(g, G.cyl(4), trussMat, { x: k + 0.3, z: 0.22, sx: 0.025, sy: 0.72, sz: 0.025, rz: 0.9 });
        put(g, G.cyl(4), trussMat, { x: k + 0.3, z: -0.22, sx: 0.025, sy: 0.72, sz: 0.025, rz: -0.9 });
        put(g, G.cyl(4), trussMat, { x: k + 0.3, y: -0.22, sx: 0.025, sy: 0.72, sz: 0.025, rz: PI / 2, ry: 0.9 });
      }
    };
    const PX = 9.65, PZ0 = ST.z1 + 0.15, PZ1 = ST.z0 - 0.1;
    for (const x of [-PX, PX]) for (const z of [PZ0, PZ1]) tower(x, z, TR + 0.25);
    beam(-PX, PZ0, PX, PZ0, TR);
    beam(-PX, PZ1, PX, PZ1, TR);
    for (const x of [-PX, PX]) beam(x, PZ0, x, PZ1, TR);
    const canopyR = 4.0;
    const canopy = new THREE.CylinderGeometry(canopyR, canopyR, 2 * PX + 1.2, 24, 1, true, PI / 2 - 0.75, 1.5).rotateZ(PI / 2);
    put(backdrop, canopy, toon(0xf4f0ff, { side: THREE.DoubleSide }), { y: TR + 0.25 - canopyR * Math.cos(0.75), z: stz, shadow: true });
    // ---------- the light rig: lamps on the front beam that throw coloured beams ----------
    const lamps = [];
    for (let i = 0; i < 8; i++) {
      const lx = -7.35 + i * 2.1;
      const g = group(root, lx, TR - 0.55, PZ0);
      cylinder(g, 0x2a2438, 0, 0.2, 0, 0.03, 0.4);
      put(g, G.cyl(10), toon(0x2a2438), { y: -0.15, sx: 0.22, sy: 0.45, sz: 0.22, rx: 0.5 });
      lamps.push({ x: lx, y: TR - 0.75, z: PZ0 + 0.12, i });
    }
    // the lamp lenses glow in the colour of their beam
    const lens = dynamic(new THREE.InstancedMesh(G.lowSphere(), new THREE.MeshBasicMaterial({ toneMapped: false }), lamps.length));
    lens.frustumCulled = false;
    root.add(lens);
    lamps.forEach((l, i) => { tmp.position.set(l.x, l.y - 0.02, l.z + 0.02); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(0.17); tmp.updateMatrix(); lens.setMatrixAt(i, tmp.matrix); lens.setColorAt(i, new THREE.Color(0xffffff)); });
    // see-through beams (glowing cones) and the pools of light where they land
    const beamGeo = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0);
    const SEARCH = 2;
    const beams = dynamic(new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    }), lamps.length + SEARCH));
    beams.frustumCulled = false;
    beams.castShadow = false;
    root.add(beams);
    const poolTex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.6, "rgba(255,255,255,0.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const pools = dynamic(new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2), new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), lamps.length));
    pools.frustumCulled = false;
    root.add(pools);
    const up = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3(), col = new THREE.Color();
    const aim = (idx, from, to, radius, color, mesh) => {
      dir.copy(to).sub(from);
      const len = dir.length();
      dir.normalize();
      tmp.position.copy(from);
      tmp.quaternion.setFromUnitVectors(up, dir);
      tmp.scale.set(radius, len, radius);
      tmp.updateMatrix();
      mesh.setMatrixAt(idx, tmp.matrix);
      mesh.setColorAt(idx, color);
    };
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    // search lights behind the stage sweep across the sky
    const searchAt = [new THREE.Vector3(-12.5, 0.6, -11.8), new THREE.Vector3(12.5, 0.6, -11.8)];
    for (const s of searchAt) {
      const sl = group(root, s.x, 0, s.z);
      block(sl, 0x2a2438, 0, 0.3, 0, 0.9, 0.6, 0.9, 0.1);
      cylinder(sl, 0x55606e, 0, 0.75, 0, 0.35, 0.5);
    }
    anim.push((t) => {
      const scene = Math.floor(t / 8) % 3; // the light show changes every few seconds
      lamps.forEach((l, i) => {
        const hue = scene === 0 ? (t * 0.1 + i / lamps.length) % 1 : scene === 1 ? (i % 2 ? 0.92 : 0.55) : (t * 0.25) % 1;
        col.setHSL(hue, 0.95, 0.6);
        const sweep = Math.sin(t * (scene === 2 ? 2.2 : 1.1) + i * 0.8);
        // half the lamps point at the stage, the others sweep over the crowd
        const onStage = i % 2 === 0;
        const tx = onStage ? l.x * 0.7 + sweep * 2.2 : l.x * 0.9 + sweep * 4;
        const tz = onStage ? -7 + Math.cos(t * 0.9 + i) * 1.2 : -1.5 + Math.cos(t * 0.7 + i * 1.3) * 3.5;
        const ty = onStage ? ST.h + 0.02 : 0.04;
        from.set(l.x, l.y, l.z);
        to.set(tx, ty, tz);
        aim(i, from, to, 0.9, col, beams);
        tmp.position.set(tx, ty + 0.02, tz); tmp.quaternion.identity(); tmp.scale.setScalar(1.0); tmp.updateMatrix();
        pools.setMatrixAt(i, tmp.matrix); pools.setColorAt(i, col);
        lens.setColorAt(i, col);
      });
      searchAt.forEach((s, k) => {
        const a = Math.sin(t * 0.4 + k * 2) * 0.6 + (k ? -0.35 : 0.35);
        to.set(s.x + Math.sin(a) * 40, 60, s.z - 25 + Math.cos(t * 0.3 + k) * 10);
        col.setRGB(0.35, 0.33, 0.28);
        aim(lamps.length + k, s, to, 3.2, col, beams);
      });
      beams.instanceMatrix.needsUpdate = true; beams.instanceColor.needsUpdate = true;
      pools.instanceMatrix.needsUpdate = true; pools.instanceColor.needsUpdate = true;
      lens.instanceColor.needsUpdate = true;
    });

    // ---------- the band's gear ----------
    // drum kit (stage right)
    const DR = { x: 4.6, z: -7.6 };
    const dk = group(root, DR.x, ST.h, DR.z);
    put(dk, G.cyl(20), toon(0xe23b3b), { y: 0.5, z: 0.1, sx: 0.5, sy: 0.55, sz: 0.5, rx: PI / 2 });     // bass drum
    put(dk, atlas.fit("drumhead", new THREE.CircleGeometry(0.47, 24)), atlas.mat, { y: 0.5, z: 0.385, shadow: false });
    cylinder(dk, 0xffffff, -0.6, 0.75, -0.2, 0.26, 0.2);                                                  // snare
    for (const sx of [-0.28, 0.28]) cylinder(dk, 0xe23b3b, sx, 1.1, 0.05, 0.2, 0.22, { rx: 0.35 });      // toms
    cylinder(dk, 0xe23b3b, 0.75, 0.55, -0.25, 0.28, 0.5);                                                 // floor tom
    for (const [sx, sz, h] of [[-0.95, 0.0, 1.25], [0.95, 0.1, 1.45], [-0.6, 0.35, 1.6]]) cylinder(dk, 0x9aa3b0, sx, h / 2, sz, 0.02, h);
    cylinder(dk, 0x2a2438, 0, 0.3, -0.75, 0.05, 0.6);                                                     // stool
    cylinder(dk, 0x2a2438, 0, 0.62, -0.75, 0.24, 0.1);
    // cymbals wobble when they're hit
    const cymbals = [[-0.95, 1.27, 0.0], [0.95, 1.47, 0.1], [-0.6, 1.62, 0.35]].map(([x, y, z]) => {
      const c = dynamic(group(dk, x, y, z));
      put(c, G.cyl(18), toon(0xf2c94c), { sx: 0.36, sy: 0.02, sz: 0.36 });
      return c;
    });
    anim.push((t) => cymbals.forEach((c, i) => { const k = (t * 2 + i * 0.37) % 1; c.rotation.x = Math.sin(k * 30) * 0.15 * (1 - k); c.rotation.z = 0.1 * i; }));
    // keyboard (stage left)
    const KB = { x: -4.6, z: -6.5 };
    const kb = group(root, KB.x, ST.h, KB.z);
    for (const sx of [-0.5, 0.5]) for (const r of [0.5, -0.5]) bx(kb, 0x2a2438, sx, 0.45, 0, 0.05, 1.05, 0.05, { rx: r });
    block(kb, 0x2a2438, 0, 0.95, 0, 1.6, 0.12, 0.45, 0.04);
    A(kb, "keys", 1.45, 0.26, { y: 1.015, z: 0.05, rx: -PI / 2 });
    ball(kb, glow(0x5cff8a, 1), 0.6, 1.02, -0.15, 0.025);
    ball(kb, glow(0xff5a8a, 1), 0.68, 1.02, -0.15, 0.025);
    // microphone stand (centre front)
    const MC = { x: 0, z: -5.95 };
    const mc = group(root, MC.x, ST.h, MC.z);
    cylinder(mc, 0x2a2438, 0, 0.03, 0, 0.25, 0.05);
    cylinder(mc, 0x9aa3b0, 0, 0.85, 0, 0.025, 1.7);
    cylinder(mc, 0x9aa3b0, 0, 1.75, -0.15, 0.02, 0.4, { rx: 0.9 });
    ball(mc, 0x55606e, 0, 1.86, -0.3, 0.07, { sz: 1.3 });
    // guitar amps, a guitar on a stand and monitor speakers
    for (const [ax, az] of [[7.6, -8.7], [-2.4, -9.0]]) {
      const a = group(root, ax, ST.h, az);
      block(a, 0x2a2a30, 0, 0.55, 0, 1.3, 1.1, 0.7, 0.06);
      A(a, "grill", 1.1, 0.7, { y: 0.5, z: 0.36 });
      bx(a, 0xd9c08a, 0, 1.0, 0.36, 1.1, 0.12, 0.02, { shadow: false });
      for (let k = 0; k < 5; k++) ball(a, 0xf2c94c, -0.4 + k * 0.2, 1.0, 0.38, 0.03);
    }
    const gt = group(root, 7.4, ST.h, -7.4, -0.3);
    bx(gt, 0x2a2438, 0, 0.3, 0, 0.05, 0.6, 0.3);
    ball(gt, 0x4fb7ff, 0, 0.45, 0.06, 0.28, { sy: 1.05, sz: 0.3 });
    ball(gt, 0x4fb7ff, 0, 0.78, 0.06, 0.21, { sz: 0.3 });
    ball(gt, 0x2a2438, 0, 0.62, 0.11, 0.07, { sz: 0.2 });
    bx(gt, 0x8a5a3a, 0, 1.3, 0.06, 0.07, 0.9, 0.04);
    bx(gt, 0x2a2438, 0, 1.8, 0.06, 0.12, 0.2, 0.05);
    for (const mx of [-2.2, 2.2]) block(root, 0x2a2a30, mx, ST.h + 0.25, ST.z1 - 0.45, 1.0, 0.45, 0.6, 0.06, { rx: -0.45 });
    // bubble machine at the front corner
    block(root, 0x7fe0ff, -8.2, ST.h + 0.2, ST.z1 - 0.5, 0.6, 0.4, 0.5, 0.08);

    // ---------- speaker stacks on the ground (their woofers thump to the beat) ----------
    const woofers = [];
    for (const sx of [-1, 1]) {
      const sp = group(root, sx * 10.9, 0, -6.9);
      block(sp, 0x2a2a30, 0, 0.8, 0, 1.6, 1.6, 1.3, 0.08);
      block(sp, 0x2a2a30, 0, 2.3, 0, 1.4, 1.35, 1.2, 0.08);
      block(sp, 0x2a2a30, 0, 3.4, 0, 1.2, 0.85, 1.1, 0.08);
      for (const [y, r] of [[0.8, 0.55], [2.3, 0.42], [3.4, 0.25]]) {
        put(sp, G.torus(r, 0.05), toon(0x55606e), { y, z: 0.66 });
        woofers.push({ x: sx * 10.9, y, z: -6.9 + 0.66, r });
      }
    }
    const woof = dynamic(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, PI / 2).rotateX(PI / 2), toon(0x3c3c46), woofers.length));
    woof.frustumCulled = false;
    root.add(woof);
    anim.push((t) => {
      const beat = Math.pow(Math.max(0, Math.sin(t * PI * 2.2)), 8);
      woofers.forEach((w, i) => {
        tmp.position.set(w.x, w.y, w.z - 0.02); tmp.rotation.set(0, 0, 0);
        tmp.scale.set(w.r * 0.95, w.r * 0.95, 0.15 + beat * 0.25);
        tmp.updateMatrix(); woof.setMatrixAt(i, tmp.matrix);
      });
      woof.instanceMatrix.needsUpdate = true;
    });

    // ---------- the big screen (stage right) showing a looping animation ----------
    const SCR = { x: 14.3, z: -7.6, ry: -0.45 };
    const scr = group(root, SCR.x, 0, SCR.z, SCR.ry);
    for (const sx of [-3.3, 3.3]) {
      put(scr, G.cyl(6), trussMat, { x: sx, y: 3.9, sx: 0.12, sy: 7.8, sz: 0.12 });
      bx(scr, 0x2a2438, sx, 0.1, 0, 0.8, 0.2, 0.8);
    }
    block(scr, 0x1a1a22, 0, 5.05, -0.05, 6.5, 3.8, 0.25, 0.06);
    const sc = document.createElement("canvas");
    sc.width = 320; sc.height = 180;
    const scTex = new THREE.CanvasTexture(sc);
    scTex.encoding = THREE.sRGBEncoding;
    put(scr, new THREE.PlaneGeometry(6.2, 3.5), basic(scTex), { y: 5.05, z: 0.09, shadow: false });
    const drawScreen = (t) => {
      const ctx = sc.getContext("2d");
      const w = sc.width, h = sc.height;
      const mode = Math.floor(t / 6) % 3;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "hsl(" + ((t * 30) % 360) + ",80%,35%)"); g.addColorStop(1, "hsl(" + ((t * 30 + 120) % 360) + ",80%,30%)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (mode === 0) {
        // a bouncing equaliser with the festival name
        for (let i = 0; i < 16; i++) {
          const bh = 20 + Math.abs(Math.sin(t * 5 + i * 0.7) * Math.cos(t * 3.1 + i)) * 100;
          ctx.fillStyle = "hsl(" + ((i * 22 + t * 60) % 360) + ",90%,65%)";
          roundRect(ctx, 10 + i * 19.0, h - 10 - bh, 14, bh, 4); ctx.fill();
        }
        const s = 1 + Math.sin(t * 6) * 0.06;
        ctx.save(); ctx.translate(w / 2, 46); ctx.scale(s, s);
        text(ctx, "MII FEST", 0, 0, 48, "#ffffff");
        ctx.restore();
      } else if (mode === 1) {
        // hearts floating up
        for (let i = 0; i < 9; i++) {
          const k = (t * 0.3 + i / 9) % 1;
          ctx.fillStyle = "hsl(" + (330 + i * 8) + ",90%,70%)";
          heart(ctx, 20 + i * 34 + Math.sin(t * 2 + i) * 8, h - k * (h + 40), 26);
        }
        text(ctx, "YOU ROCK!", w / 2, h / 2, 46, "#ffffff");
      } else {
        // a big smiling face singing along
        smiley(ctx, w / 2, h / 2 + 4, 60 + Math.sin(t * 8) * 4, "#ffd9b0", "#4a2a1a");
        for (let i = 0; i < 6; i++) {
          const a = t * 1.5 + (i / 6) * TAU;
          ctx.fillStyle = "#ffe15a"; star(ctx, w / 2 + Math.cos(a) * 120, h / 2 + Math.sin(a) * 60, 12); ctx.fill();
        }
        text(ctx, "SING ALONG!", w / 2, 18, 22, "#ffffff");
      }
      scTex.needsUpdate = true;
    };
    drawScreen(0);
    let nextDraw = 0;
    anim.push((t) => { if (t >= nextDraw) { nextDraw = t + 0.12; drawScreen(t); } });

    // ---------- food truck (right) ----------
    const FT = { x: 14.9, z: 2.0 };
    const ft = group(root, FT.x, 0, FT.z, -PI / 2); // its serving window faces -x
    block(ft, 0xff8a5c, 0, 1.75, 0, 5.6, 2.6, 2.5, 0.25);
    block(ft, 0xff8a5c, 3.3, 1.25, 0, 1.4, 1.6, 2.4, 0.25);
    bx(ft, 0x9fd3f0, 3.65, 1.65, 0, 0.6, 0.6, 2.2, { rz: -0.4 });
    bx(ft, 0xffffff, 0, 0.7, 0, 5.62, 0.25, 2.52);
    for (const sx of [-1.8, 1.6, 3.2]) for (const sz of [-1.2, 1.2]) cylinder(ft, 0x2a2f38, sx, 0.42, sz, 0.42, 0.3, { rx: PI / 2 });
    bx(ft, 0x3a2a1a, -0.3, 2.0, 1.26, 3.4, 1.2, 0.04, { shadow: false });       // serving window
    block(ft, 0xffffff, -0.3, 1.38, 1.45, 3.6, 0.1, 0.45, 0.03);              // counter
    A(ft, "awning", 3.8, 1.0, { x: -0.3, y: 2.95, z: 1.75, rx: -1.0 });
    A(ft, "burger", 3.0, 0.8, { x: -0.3, y: 2.75, z: 1.27 });
    A(ft, "menu", 0.8, 1.0, { x: 2.0, y: 2.0, z: 1.27 });
    for (let i = 0; i < 3; i++) {
      const b = group(ft, -1.2 + i * 0.9, 1.45, 1.5);
      ball(b, 0xe8a64a, 0, 0.12, 0, 0.16, { sy: 0.5 });
      cylinder(b, 0x7a3a1a, 0, 0.06, 0, 0.17, 0.05);
      cylinder(b, 0x6fd36a, 0, 0.03, 0, 0.18, 0.02);
      ball(b, 0xe8a64a, 0, 0.0, 0, 0.16, { sy: 0.3 });
    }
    put(ft, G.cone(8), toon(0xffe15a), { x: 1.2, y: 1.55, z: 1.5, s: 0.12, sy: 0.25, rx: PI });
    ball(ft, 0xff9ec7, 1.2, 1.72, 1.5, 0.1);
    // a little cloud of steam from the kitchen
    const steam = dynamic(new THREE.InstancedMesh(G.lowSphere(), toon(0xffffff, { transparent: true, opacity: 0.5 }), 4));
    steam.frustumCulled = false;
    root.add(steam);
    anim.push((t) => {
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.3 + i / 4) % 1;
        tmp.position.set(FT.x + 0.2, 3.2 + k * 2, FT.z + 1 + Math.sin(t + i) * 0.2);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.setScalar(0.15 + k * 0.35);
        tmp.updateMatrix(); steam.setMatrixAt(i, tmp.matrix);
      }
      steam.instanceMatrix.needsUpdate = true;
    });
    cylinder(root, 0x9aa3b0, FT.x + 0.3, 3.2, FT.z + 1.0, 0.1, 0.5);

    // ---------- lemonade stand (left) ----------
    const DS = { x: -14.9, z: 2.0 };
    const ds = group(root, DS.x, 0, DS.z, PI / 2); // faces +x
    block(ds, 0xfff1d0, 0, 0.6, 0, 2.8, 1.2, 1.0, 0.08);
    block(ds, 0xffe15a, 0, 1.25, 0.05, 3.0, 0.1, 1.2, 0.04);
    for (const sx of [-1.35, 1.35]) cylinder(ds, 0xffffff, sx, 1.9, -0.3, 0.05, 2.6);
    A(ds, "awning2", 3.2, 1.4, { y: 3.1, z: 0.2, rx: -1.1 });
    A(ds, "lemonade", 2.4, 0.64, { y: 0.7, z: 0.51 });
    for (const sx of [-0.7, 0.4]) {
      cylinder(ds, toon(0xfff27a, { transparent: true, opacity: 0.85 }), sx, 1.6, 0, 0.25, 0.6);
      cylinder(ds, 0xffffff, sx, 1.95, 0, 0.26, 0.08);
    }
    for (let i = 0; i < 6; i++) put(ds, G.taper(0.07, 0.055), toon([0xff6b8a, 0x4fb7ff, 0x6fd36a][i % 3]), { x: 0.95 + (i % 3) * 0.17, y: 1.38, z: 0.25 - Math.floor(i / 3) * 0.2, sy: 0.18 });
    ball(ds, 0xffe15a, -1.1, 1.38, 0.3, 0.1);
    ball(ds, 0xffe15a, -0.95, 1.38, 0.35, 0.1);

    // ---------- merch booth (left, by the stage) ----------
    const MB = { x: -15.0, z: -4.6 };
    const mb = group(root, MB.x, 0, MB.z, PI / 2);
    block(mb, 0xa58cff, 0, 0.5, 0.5, 3.0, 1.0, 0.8, 0.06);
    block(mb, 0xffffff, 0, 1.03, 0.5, 3.1, 0.06, 0.9, 0.03);
    for (const sx of [-1.45, 1.45]) for (const sz of [-0.5, 0.9]) cylinder(mb, 0xffffff, sx, 1.4, sz, 0.05, 2.8);
    A(mb, "awning3", 3.2, 1.6, { y: 2.9, z: 0.2, rx: -1.4 });
    A(mb, "merch", 2.2, 0.6, { y: 0.55, z: 0.91 });
    bx(mb, 0x9aa3b0, 0, 2.2, -0.4, 2.8, 0.05, 0.05);
    for (let i = 0; i < 4; i++) {
      const shirt = group(mb, -1.0 + i * 0.67, 1.75, -0.4);
      block(shirt, [0x2f3542, 0xff6b8a, 0x4fb7ff, 0xffe15a][i], 0, 0, 0, 0.5, 0.6, 0.04, 0.03);
      for (const sx of [-1, 1]) block(shirt, [0x2f3542, 0xff6b8a, 0x4fb7ff, 0xffe15a][i], sx * 0.3, 0.17, 0, 0.2, 0.2, 0.04, 0.02, { rz: sx * 0.6 });
      if (i === 0) A(shirt, "shirt", 0.32, 0.32, { z: 0.025 });
    }
    for (let i = 0; i < 3; i++) {
      ball(mb, [0xff6b6b, 0x4fb7ff, 0x6fd36a][i], -0.8 + i * 0.8, 1.1, 0.5, 0.17, { sy: 0.5 });
      bx(mb, [0xff6b6b, 0x4fb7ff, 0x6fd36a][i], -0.8 + i * 0.8, 1.08, 0.7, 0.3, 0.02, 0.15);
    }

    // ---------- benches and bleachers for the audience ----------
    const benches = [{ x: -6, z: 4.0 }, { x: 6, z: 4.0 }, { x: -6, z: 6.9 }, { x: 6, z: 6.9 }].map((b) => Object.assign(b, { ry: PI }));
    benches.forEach((b) => parkBench(root, b.x, b.z, b.ry));
    const BL = { x: 12.8, z: 8.4 };
    const tierH = [0.55, 1.05, 1.55], tierZ = [7.55, 8.4, 9.25];
    for (let i = 0; i < 3; i++) {
      block(root, [0x4fb7ff, 0xff6b8a, 0xffd23f][i], BL.x, tierH[i] - 0.06, tierZ[i], 5.6, 0.12, 0.75, 0.04);
      bx(root, 0x9aa3b0, BL.x, (tierH[i] - 0.12) / 2, tierZ[i] + 0.3, 5.4, tierH[i] - 0.12, 0.05);
      for (const sx of [-2.6, 0, 2.6]) bx(root, 0x9aa3b0, BL.x + sx, (tierH[i] - 0.12) / 2, tierZ[i], 0.08, tierH[i] - 0.12, 0.08);
    }
    bx(root, 0x9aa3b0, BL.x, 2.3, 9.7, 5.6, 0.06, 0.06);
    for (const sx of [-2.8, 2.8]) bx(root, 0x9aa3b0, BL.x + sx, 1.2, 9.7, 0.06, 2.3, 0.06);

    // ---------- the gate ----------
    const GZ = 12.6; // the gate stands just outside the venue, so it doesn't hide the crowd
    const gate = group(root, 0, 0, GZ);
    for (const sx of [-2.7, 2.7]) {
      cylinder(gate, 0xff6b8a, sx, 1.7, 0, 0.3, 3.4);
      ball(gate, 0xffe15a, sx, 3.55, 0, 0.35);
    }
    block(gate, 0xffffff, 0, 3.05, 0, 5.9, 1.0, 0.2, 0.1);
    A(gate, "gate", 5.6, 0.94, { y: 3.05, z: 0.11 });
    A(gate, "gate", 5.6, 0.94, { y: 3.05, z: -0.11, ry: PI });
    bx(root, 0xe8d3a8, 0, -0.006, GZ, 3.0, 0.01, 6, { shadow: false });
    // balloons tied to the gate posts (they bob about)
    const balloonSpots = [];
    for (const sx of [-2.7, 2.7]) for (let i = 0; i < 3; i++) balloonSpots.push({ x: sx + (i - 1) * 0.35, y: 4.3 + (i % 2) * 0.35, z: GZ, c: [0xff6b6b, 0x4fb7ff, 0xffd23f][i] });
    // a balloon seller's cart (front left)
    const BC = { x: -12.8, z: 8.2 };
    const bc = group(root, BC.x, 0, BC.z);
    block(bc, 0x4fb7ff, 0, 0.7, 0, 1.4, 0.6, 0.9, 0.08);
    for (const sx of [-0.55, 0.55]) put(bc, G.torus(0.3, 0.05), toon(0x333333), { x: sx, y: 0.3, z: 0.47 });
    cylinder(bc, 0xffffff, 0, 1.6, 0, 0.04, 1.8);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      balloonSpots.push({ x: BC.x + Math.cos(a) * 0.5, y: 3.4 + (i % 3) * 0.3, z: BC.z + Math.sin(a) * 0.5, c: [0xff6b6b, 0x4fb7ff, 0xffd23f, 0x6fd36a, 0xff8ad8, 0xa58cff, 0xff8a5c][i] });
    }
    for (const b of balloonSpots) {
      const base = b.x < -8 ? { x: BC.x, y: 2.5, z: BC.z } : { x: b.x < 0 ? -2.7 : 2.7, y: 3.6, z: GZ };
      cable(root, toon(0xffffff), [new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(b.x, b.y - 0.3, b.z)], 0.008);
    }
    const balloons = dynamic(new THREE.InstancedMesh(G.midSphere(), toon(0xffffff), balloonSpots.length));
    balloons.castShadow = true;
    balloons.frustumCulled = false;
    balloonSpots.forEach((b, i) => balloons.setColorAt(i, new THREE.Color(b.c)));
    root.add(balloons);
    anim.push((t) => {
      balloonSpots.forEach((b, i) => {
        tmp.position.set(b.x + Math.sin(t * 1.3 + i) * 0.05, b.y + Math.sin(t * 1.7 + i * 2) * 0.06, b.z);
        tmp.rotation.set(0, 0, Math.sin(t + i) * 0.1);
        tmp.scale.set(0.27, 0.33, 0.27);
        tmp.updateMatrix(); balloons.setMatrixAt(i, tmp.matrix);
      });
      balloons.instanceMatrix.needsUpdate = true;
    });

    // ---------- string lights and bunting on poles ----------
    const poles = { L0: [-11.8, -2.8], L1: [-11.8, 3.8], L2: [-9.3, 9.6], R0: [11.8, -2.8], R1: [11.8, 3.8], R2: [9.3, 9.6] };
    const PH = 5.2;
    for (const [x, z] of Object.values(poles)) {
      cylinder(root, 0x8a5a3a, x, PH / 2, z, 0.1, PH);
      ball(root, 0xffe15a, x, PH + 0.08, z, 0.14);
    }
    const P = (k) => new THREE.Vector3(poles[k][0], PH - 0.1, poles[k][1]);
    const cableMat = toon(0x3a3346);
    const bulbs = [];
    const lightLine = (a, b, sag, n) => {
      const pts = sagLine(a, b, sag, 14);
      cable(root, cableMat, pts, 0.015);
      const curve = new THREE.CatmullRomCurve3(pts);
      for (let i = 1; i < n; i++) { const p = curve.getPoint(i / n); bulbs.push({ x: p.x, y: p.y - 0.12, z: p.z }); }
    };
    lightLine(P("L0"), P("L1"), 0.6, 10); lightLine(P("L1"), P("L2"), 0.6, 10);
    lightLine(P("R0"), P("R1"), 0.6, 10); lightLine(P("R1"), P("R2"), 0.6, 10);
    lightLine(P("L1"), P("R1"), 1.2, 28);
    lightLine(P("L0"), new THREE.Vector3(-PX, TR - 0.4, PZ0), 0.5, 6); lightLine(P("R0"), new THREE.Vector3(PX, TR - 0.4, PZ0), 0.5, 6);
    const bulbMesh = dynamic(new THREE.InstancedMesh(G.tinySphere(), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length));
    bulbMesh.frustumCulled = false;
    const bulbCols = [0xffe08a, 0xff8ad8, 0x8fe0ff, 0xa8ff8a, 0xffb070].map((c) => new THREE.Color(c));
    bulbs.forEach((b, i) => { tmp.position.set(b.x, b.y, b.z); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(0.1); tmp.updateMatrix(); bulbMesh.setMatrixAt(i, tmp.matrix); bulbMesh.setColorAt(i, bulbCols[i % 5]); });
    root.add(bulbMesh);
    let twinkle = 0;
    const dimCol = new THREE.Color();
    anim.push((t) => {
      if (t < twinkle) return;
      twinkle = t + 0.25;
      bulbs.forEach((b, i) => bulbMesh.setColorAt(i, dimCol.copy(bulbCols[i % 5]).multiplyScalar(Math.random() < 0.12 ? 0.45 : 1)));
      bulbMesh.instanceColor.needsUpdate = true;
    });
    // bunting (little flags) along the front, between the gate and the poles
    const flagGeo = bakeGeo((g) => {
      const line = sagLine(P("L2"), P("R2"), 1.0, 30);
      const curve = new THREE.CatmullRomCurve3(line);
      const fc = [0xff6b6b, 0xffd23f, 0x4fb7ff, 0x6fd36a, 0xff8ad8, 0xa58cff];
      for (let i = 1; i < 30; i++) {
        const p = curve.getPoint(i / 30);
        put(g, triangleGeo([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0]), toon(fc[i % fc.length]), { x: p.x, y: p.y, z: p.z });
      }
      cable(g, toon(0xffffff), line, 0.012);
    });
    painted(root, flagGeo);
    // flags on tall poles by the stage
    for (const [fx, fz, c] of [[-12.6, -9.8, 0xff6b8a], [12.6, -10.4, 0x4fb7ff], [-16.5, 6.4, 0xffd23f]]) {
      cylinder(root, 0xffffff, fx, 3.5, fz, 0.06, 7.0);
      const f = dynamic(put(root, triangleGeo([0, 0, 0, 0, -1.0, 0, 1.6, -0.5, 0]), toon(c, { side: THREE.DoubleSide }), { x: fx, y: 6.9, z: fz, shadow: false }));
      anim.push((t) => { f.rotation.y = Math.sin(t * 2 + fx) * 0.35 - 0.3; });
    }

    // ---------- confetti and bubbles ----------
    const confN = 140;
    const conf = dynamic(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.2), toon(0xffffff, { side: THREE.DoubleSide }), confN));
    conf.frustumCulled = false;
    const cr = seeded(17);
    const confData = [];
    const confCols = [0xff6b6b, 0xffd23f, 0x4fb7ff, 0x6fd36a, 0xff8ad8, 0xa58cff, 0xffffff].map((c) => new THREE.Color(c));
    for (let i = 0; i < confN; i++) {
      confData.push({ x: (cr() - 0.5) * 18, z: -6 + cr() * 9, off: cr(), speed: 0.06 + cr() * 0.05, spin: 2 + cr() * 4 });
      conf.setColorAt(i, confCols[i % confCols.length]);
    }
    root.add(conf);
    anim.push((t) => {
      confData.forEach((c, i) => {
        const k = (t * c.speed + c.off) % 1;
        tmp.position.set(c.x + Math.sin(t * 1.3 + i) * 0.5, 9.5 - k * 9.6, c.z + Math.cos(t * 1.1 + i) * 0.4);
        tmp.rotation.set(t * c.spin + i, t * c.spin * 0.7, i);
        tmp.scale.setScalar(k > 0.985 ? 0.001 : 1);
        tmp.updateMatrix(); conf.setMatrixAt(i, tmp.matrix);
      });
      conf.instanceMatrix.needsUpdate = true;
    });
    const bubN = 18;
    const bubbles = dynamic(new THREE.InstancedMesh(G.lowSphere(), new THREE.MeshBasicMaterial({ color: 0xcff0ff, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }), bubN));
    bubbles.frustumCulled = false;
    root.add(bubbles);
    anim.push((t) => {
      for (let i = 0; i < bubN; i++) {
        const k = (t * 0.12 + i / bubN) % 1;
        tmp.position.set(-8.2 + k * 6 + Math.sin(t * 2 + i) * 0.6, ST.h + 0.5 + k * 7, ST.z1 - 0.5 + k * 3 + Math.cos(t * 1.7 + i * 2) * 0.5);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.setScalar(0.12 + (i % 3) * 0.05);
        tmp.updateMatrix(); bubbles.setMatrixAt(i, tmp.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    });

    // a few lamp posts, bins and hay bales around the edge
    lampPost(root, -16.8, -1.2, 0xffd08a); lampPost(root, 16.8, -2.6, 0xffd08a);
    for (const [hx, hz, r] of [[-16.6, 9.2, 0.3], [16.9, -0.4, -0.2]]) block(root, 0xe8c060, hx, 0.4, hz, 1.4, 0.8, 0.8, 0.12, { ry: r });
    for (const [bx0, bz0, c] of [[-10.6, 5.6, 0x6fd36a], [10.1, -1.4, 0x4fb7ff]]) {
      put(root, G.taper(0.32, 0.28), toon(c), { x: bx0, y: 0.45, z: bz0, sy: 0.9 });
      cylinder(root, 0x2a2438, bx0, 0.93, bz0, 0.34, 0.06);
    }

    // ---------- scenery all around: park trees, hills, the city and a ferris wheel ----------
    const near = [[-20, -14, 1.2], [-24, -2, 1.0], [-21, 10, 1.1], [21, -15, 1.1], [24, -3, 1.0], [22, 11, 1.2], [-8, -17, 1.0], [7, -18, 1.1], [-30, -20, 1.3], [30, 18, 1.1], [-15, 20, 1.0], [14, 21, 1.0]];
    near.forEach(([x, z, s], i) => roundTree(root, x, z, s, i % 4 === 1 ? [0xff9ec7, 0xffc3dc] : [0x5fb84a, 0x86d65e]));
    for (const [x, z] of [[-18.5, -9], [18.6, 6], [-19, 4], [19.5, -9.5]]) bush(root, x, z, 1, 0x4fbf47, 0xff6fa5);
    farTown(root, {
      seed: 5, trees: [200, 28, 90], hills: [26, 160], dim: 0.95,
      treeColors: [0x5fb84a, 0x4fa843, 0x77c95a, 0xff9ec7, 0xffb84d],
      keepOut: (x, z) => Math.abs(x) < 26 && z > -24 && z < 26,
    });
    // city skyline far behind the stage, with windows lighting up for the evening
    const sky = [];
    const kr = seeded(41);
    for (let i = 0; i < 46; i++) {
      const a = -PI / 2 + (kr() - 0.5) * 2.2, d = 120 + kr() * 45;
      const tall = kr() < 0.25;
      sky.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, sx: 7 + kr() * 8, sy: tall ? 45 + kr() * 35 : 14 + kr() * 26, sz: 7 + kr() * 8, ry: a, color: [0xd8c0e8, 0xf0c8b0, 0xc8c8e8, 0xe8d0c0, 0xb8b0d8][Math.floor(kr() * 5)] });
    }
    farScatter(root, unitBox, windowMaterial({ color: 0xffffff, glass: 0x8a7ab8, lit: 0xffe08a, litAmount: 0.4, w: 2.4, h: 3.4 }), sky);
    // a ferris wheel in the distance, slowly turning
    const FW = { x: 62, y: 0, z: -95 };
    painted(root, bakeGeo((g) => {
      for (const sz of [-1, 1]) for (const r of [0.35, -0.35]) put(g, G.box(), toon(0xffffff), { x: FW.x, y: 9, z: FW.z + sz * 1.2, sx: 0.6, sy: 19, sz: 0.6, rz: r });
    }));
    const wheel = dynamic(painted(root, bakeGeo((g) => {
      for (const sz of [-1.2, 1.2]) put(g, G.torus(14, 0.3), toon(0xffffff), { z: sz });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        put(g, G.box(), toon(0xffffff), { x: Math.cos(a) * 7, y: Math.sin(a) * 7, sx: 14, sy: 0.25, sz: 0.25, rz: a });
        put(g, G.rbox(1.6, 1.6, 2.2, 0.4), toon([0xff6b6b, 0xffd23f, 0x4fb7ff, 0x6fd36a, 0xff8ad8, 0xa58cff][i % 6]), { x: Math.cos(a) * 14, y: Math.sin(a) * 14 - 1, z: 0 });
      }
    }), { x: FW.x, y: 19, z: FW.z }));
    wheel.lookAt(0, 19, 0);
    const wheelBase = wheel.quaternion.clone();
    const spinQ = new THREE.Quaternion();
    anim.push((t) => { spinQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), t * 0.08); wheel.quaternion.copy(wheelBase).multiply(spinQ); });
    // sunset clouds, tinted pink and orange
    cloudRing(root, anim, toon(0xffc0a0, { emissive: 0xff9a7a, emissiveIntensity: 0.35 }), { count: 12, rMin: 70, rMax: 110, yMin: 22, yMax: 34, sMin: 1.1, sMax: 1.8, speed: 0.006, seed: 6 });
    cloudRing(root, anim, toon(0xffb0c8, { emissive: 0xff8ab0, emissiveIntensity: 0.3 }), { count: 12, rMin: 150, rMax: 200, yMin: 32, yMax: 58, sMin: 2.4, sMax: 3.4, speed: 0.004, seed: 13, start: 2 });
    // birds flying home
    const birds = [];
    for (let i = 0; i < 5; i++) {
      const b = movingThing(root, 0, 0, 0, (g) => {
        put(g, triangleGeo([0, 0, 0, -0.9, 0.25, -0.3, -0.9, 0.25, 0.3]), toon(0x3a3346), {});
        put(g, triangleGeo([0, 0, 0, 0.9, 0.25, -0.3, 0.9, 0.25, 0.3]), toon(0x3a3346), {});
      });
      birds.push(b);
    }
    anim.push((t) => birds.forEach((b, i) => {
      const k = ((t * 0.02 + i * 0.03) % 1);
      b.position.set(-90 + k * 180 + (i % 2) * 3, 30 + Math.sin(t + i) * 0.8 + (i % 3), -70 - i * 2.5);
      b.rotation.set(0, PI / 2, Math.sin(t * 6 + i) * 0.3);
    }));

    mergeStatic(backdrop);
    dynamic(backdrop);
    mergeStatic(root);

    // ---------- spots ----------
    const SY = ST.h; // standing on the stage
    const benchSpot = (b, activity, emoji, lines) => ({
      x: b.x, z: b.z - 1.2, yaw: PI, emoji, activity, lines,
      seat: { x: b.x, z: b.z - 0.08, y: 0.0 },
    });

    return {
      group: root,
      background: 0xffb88a,
      fog: [0xffc8a0, 95, 320],
      cameraTilt: 0.44,
      cameraTargetY: 1.6,
      bounds: { minX: -17, maxX: 17, minZ: -10.4, maxZ: 10 },
      water: [],
      obstacles: [
        { x: 0, z: stz, w: ST.w + 0.2, d: ST.z1 - ST.z0 + 0.1 },                 // the stage
        { x: -PX, z: PZ0, r: 0.4 }, { x: PX, z: PZ0, r: 0.4 },                    // roof towers
        { x: -ST.w / 2 - 0.5, z: ST.z0 + 0.6, w: 1.2, d: 1.0 }, { x: ST.w / 2 + 0.5, z: ST.z0 + 0.6, w: 1.2, d: 1.0 }, // steps
        { x: -10.9, z: -6.9, w: 1.8, d: 1.5 }, { x: 10.9, z: -6.9, w: 1.8, d: 1.5 }, // speaker stacks
        { x: SCR.x + Math.cos(SCR.ry) * 3.3, z: SCR.z - Math.sin(SCR.ry) * 3.3, r: 0.55 }, // big screen legs
        { x: SCR.x - Math.cos(SCR.ry) * 3.3, z: SCR.z + Math.sin(SCR.ry) * 3.3, r: 0.55 },
        { x: searchAt[0].x, z: searchAt[0].z, r: 0.6 }, { x: searchAt[1].x, z: searchAt[1].z, r: 0.6 },
        { x: FT.x, z: FT.z, w: 2.9, d: 6.4 },                                      // food truck
        { x: DS.x, z: DS.z, w: 1.6, d: 3.2 },                                      // lemonade stand
        { x: MB.x - 0.2, z: MB.z, w: 2.2, d: 3.4 },                                // merch booth
        { x: BL.x, z: BL.z, w: 5.8, d: 2.6 },                                      // bleachers
        { x: BC.x, z: BC.z, w: 1.6, d: 1.4 },                                      // balloon cart
        { x: -16.8, z: -1.2, r: 0.3 }, { x: 16.8, z: -2.6, r: 0.3 },               // lamps
        { x: -16.6, z: 9.2, w: 1.5, d: 1.0, rot: -0.3 }, { x: 16.9, z: -0.4, w: 1.5, d: 1.0, rot: 0.2 }, // hay bales
        { x: -10.6, z: 5.6, r: 0.4 }, { x: 10.1, z: -1.4, r: 0.4 },                // bins
        { x: -12.6, z: -9.8, r: 0.2 }, { x: 12.6, z: -10.4, r: 0.2 }, { x: -16.5, z: 6.4, r: 0.2 }, // flag poles
      ].concat(Object.values(poles).map(([x, z]) => ({ x, z, r: 0.22 })))
        .concat(benches.map((b) => ({ x: b.x, z: b.z + 0.05, w: 2.5, d: 1.0 }))),
      spots: [
        { x: MC.x, z: ST.z1 + 0.8, yaw: 0, arms: "cheer", emoji: "🎤", activity: "singing on stage",
          stand: { x: MC.x, z: MC.z - 0.5, y: SY },
          lines: ["♪ La la laaa~ ♪", "Hello, Mii Fest!", "Make some noise!", "This one's for you!", "Everybody sing along!"] },
        { x: DR.x, z: ST.z1 + 0.8, yaw: 0, arms: "drum", emoji: "🥁", activity: "playing the drums",
          seat: { x: DR.x, z: DR.z - 0.75, y: SY + 0.67 - 0.56 },
          lines: ["Ba-dum tss!", "One, two, three, four!", "Drum solo!", "*CRASH*"] },
        { x: KB.x, z: ST.z1 + 0.8, yaw: 0, arms: "type", emoji: "🎹", activity: "playing the keyboard",
          stand: { x: KB.x, z: KB.z - 0.6, y: SY },
          lines: ["♪ Plink plonk ♪", "Synth solo!", "Feel the groove!", "Which key was it again?"] },
        { x: -7.8, z: ST.z1 + 0.8, yaw: 0, arms: "out", emoji: "💃", activity: "dancing on stage",
          stand: { x: -7.6, z: -6.6, y: SY },
          lines: ["Look at my moves!", "Spin, spin, spin!", "Dance like nobody's watching!", "Woo-hoo!"] },
        { x: -2.8, z: -2.2, yaw: PI, arms: "cheer", emoji: "🙌", activity: "cheering in the crowd",
          lines: ["WOOO!", "Encore! Encore!", "Best concert ever!", "I love this song!"] },
        { x: 2.8, z: -1.2, yaw: PI, arms: "wave", emoji: "✨", activity: "waving a glow stick",
          lines: ["Wave your hands!", "So many lights!", "La la la~", "Feel the music!"] },
        { x: 10.0, z: -2.6, yaw: Math.atan2(SCR.x - 10.0, SCR.z + 2.6), lookUp: 0.35, emoji: "📺", activity: "watching the big screen",
          lines: ["I can see myself on the screen!", "Wave to the camera!", "So many hearts!", "That's huge!"] },
        benchSpot(benches[0], "enjoying the show", "🎶", ["What a great band!", "My feet needed a rest.", "Such a nice evening!"]),
        benchSpot(benches[3], "listening to the music", "🎵", ["This song is my favourite!", "*taps foot*", "What a sunset!"]),
        { x: BL.x, z: tierZ[0] - 1.2, yaw: PI, emoji: "👏", activity: "watching from the bleachers",
          seat: { x: BL.x, z: tierZ[1] - 0.05, y: tierH[1] - 0.56 },
          lines: ["Great view from up here!", "*clap clap clap*", "Bravo!", "Play another one!"] },
        { x: FT.x - 2.5, z: FT.z - 0.4, yaw: PI / 2, arms: "eat", emoji: "🍔", activity: "getting a burger",
          lines: ["One burger, please!", "Mmm, so juicy!", "Extra pickles!", "Concert food is the best!"] },
        { x: DS.x + 2.3, z: DS.z, yaw: -PI / 2, arms: "eat", emoji: "🍋", activity: "drinking lemonade",
          lines: ["So refreshing!", "Sour! But tasty!", "Ahh, perfect on a warm evening.", "Can I get a straw?"] },
        { x: MB.x + 2.1, z: MB.z, yaw: -PI / 2, emoji: "👕", activity: "browsing the merch",
          lines: ["I need that T-shirt!", "Ooh, a souvenir!", "Do you have this in my size?", "So cool!"] },
      ],
      lines: [
        "What a show!", "I love this band!", "The sunset is so pretty!", "Make some noise!",
        "Who's playing next?", "Let's dance!", "Look at the lights!", "Encore!",
        "Want some lemonade?", "Best night ever!",
      ],
      entrance: { x: 0, z: 9.3 },
      update(t, camera) {
        anim.forEach((a) => a(t));
        if (camera) backdrop.visible = camera.position.z > ST.z0 - 0.5;
      },
    };
  }

  root.World3D.addPlace({ id: "school", name: "School", icon: "🏫" }, buildSchool);
  root.World3D.addPlace({ id: "stage", name: "Concert Stage", icon: "🎤" }, buildStage);
})(typeof self !== "undefined" ? self : this);
