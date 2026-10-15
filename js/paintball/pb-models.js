/*
 * pb-models.js
 * Procedural weapon models + first-person viewmodel animation for the Paintball mini-game.
 *   - "AK": an AK-47 silhouette dressed as a modern paintball marker (hopper, air-tank stock,
 *     ported barrel, anodised accent parts).
 *   - Butterfly knife (balisong) with two handles that really rotate around their own pivot pins.
 *   - Chunky Mii-style arms (coloured sleeves + mitten hands with a thumb).
 * Everything is built from merged, vertex-coloured BufferGeometry (few draw calls), no assets.
 * Classic script: uses the global THREE (r147) and exposes window.PBModels.
 *
 * Viewmodel space = camera space (x right, y up, looking down -Z). The viewmodel group carries
 * its OWN lights (hemisphere + key + rim) unless opts.lights === false.
 */
(function (root) {
  "use strict";
  var THREE = root.THREE;
  var PI = Math.PI, TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------------------------
  // Small math / geometry helpers
  // ---------------------------------------------------------------------------------------------
  var _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

  function mtx(px, py, pz, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, "XYZ");
    _q.setFromEuler(_e);
    if (sx === undefined) sx = 1;
    if (sy === undefined) sy = sx;
    if (sz === undefined) sz = sx;
    return new THREE.Matrix4().compose(new THREE.Vector3(px || 0, py || 0, pz || 0), _q.clone(), new THREE.Vector3(sx, sy, sz));
  }

  function lin(hex) { // configurable sRGB hex -> linear working colour (renderer outputs sRGB)
    var c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
  }
  function shade(c, k) { return c.clone().multiplyScalar(k); }
  function mix(a, b, t) { return a.clone().lerp(b, t); }

  // Builder: collects geometry parts (with a vertex colour each) and merges them into one geometry.
  function Builder() { this.parts = []; this.off = new THREE.Matrix4(); }
  Builder.prototype.add = function (geo, color, m) {
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    var full = new THREE.Matrix4();
    if (m) full.multiplyMatrices(this.off, m); else full.copy(this.off);
    g.applyMatrix4(full);
    var pos = g.attributes.position.array, nor = g.attributes.normal.array;
    var n = pos.length / 3;
    var P = new Float32Array(pos), N = new Float32Array(nor);
    if (full.determinant() < 0) { // mirrored: fix winding
      for (var t = 0; t < n; t += 3) {
        for (var k = 0; k < 3; k++) {
          var a = (t + 1) * 3 + k, b = (t + 2) * 3 + k, tmp;
          tmp = P[a]; P[a] = P[b]; P[b] = tmp;
          tmp = N[a]; N[a] = N[b]; N[b] = tmp;
        }
      }
    }
    var C = new Float32Array(n * 3);
    var col = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (var i = 0; i < n; i++) { C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b; }
    this.parts.push({ p: P, n: N, c: C });
    g.dispose();
    if (geo !== g && geo.userData && geo.userData.temp) geo.dispose();
    return this;
  };
  Builder.prototype.geometry = function () {
    var total = 0, i;
    for (i = 0; i < this.parts.length; i++) total += this.parts[i].p.length;
    var P = new Float32Array(total), N = new Float32Array(total), C = new Float32Array(total), o = 0;
    for (i = 0; i < this.parts.length; i++) {
      P.set(this.parts[i].p, o); N.set(this.parts[i].n, o); C.set(this.parts[i].c, o);
      o += this.parts[i].p.length;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(N, 3));
    g.setAttribute("color", new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    return g;
  };
  Builder.prototype.mesh = function (mat) {
    var m = new THREE.Mesh(this.geometry(), mat);
    m.frustumCulled = false;
    return m;
  };
  function withOffset(b, x, y, z) { b.off = new THREE.Matrix4().makeTranslation(-x, -y, -z); return b; }

  // Geometry primitives -------------------------------------------------------------------------
  function roundRectShape(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // Rounded box: w (x) * h (y) * d (z), corner radius cr in xy, bevel b on the z faces. Centred.
  function rbox(w, h, d, cr, b) {
    b = b === undefined ? Math.min(w, h, d) * 0.12 : b;
    var s = roundRectShape(Math.max(w - 2 * b, 1e-4), Math.max(h - 2 * b, 1e-4), Math.max(cr - b, 0));
    var g = new THREE.ExtrudeGeometry(s, { depth: Math.max(d - 2 * b, 1e-4), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  }
  // Side profile extrusion: pts = [[z,y],...] outline in the gun's side view, extruded across x (width).
  function sideShape(pts, width, bevel, holes) {
    bevel = bevel === undefined ? 0.002 : bevel;
    var s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    if (holes) for (var h = 0; h < holes.length; h++) s.holes.push(holes[h]);
    var depth = Math.max(width - 2 * bevel, 1e-4);
    var g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 2, curveSegments: 6 });
    g.rotateY(-PI / 2); // shape x -> +z, extrusion -> -x
    g.translate(depth / 2, 0, 0);
    return g;
  }
  function shapeSide(shape, width, bevel) { // same as sideShape for a prepared THREE.Shape
    bevel = bevel || 0;
    var depth = Math.max(width - 2 * bevel, 1e-4);
    var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 2, curveSegments: 10 });
    g.rotateY(-PI / 2);
    g.translate(depth / 2, 0, 0);
    return g;
  }
  function circlePath(cx, cy, r, seg) {
    var p = new THREE.Path(); seg = seg || 12;
    for (var i = 0; i <= seg; i++) {
      var a = -i / seg * TAU; // clockwise for holes
      if (i === 0) p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return p;
  }
  function slotPath(x0, x1, cy, r) { // stadium-shaped hole (clockwise)
    var p = new THREE.Path(), seg = 6, i, a;
    p.moveTo(x0, cy + r);
    for (i = 0; i <= seg; i++) { a = PI / 2 + i / seg * PI; p.lineTo(x0 + Math.cos(a) * r, cy + Math.sin(a) * r); }
    p.lineTo(x1, cy - r);
    for (i = 0; i <= seg; i++) { a = -PI / 2 + i / seg * PI; p.lineTo(x1 + Math.cos(a) * r, cy + Math.sin(a) * r); }
    p.lineTo(x0, cy + r);
    // reverse to clockwise
    var pts = p.getPoints(), q = new THREE.Path();
    pts.reverse(); q.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) q.lineTo(pts[i].x, pts[i].y);
    return q;
  }
  function cylZ(r1, r2, len, seg, open) { // along z, centred
    var g = new THREE.CylinderGeometry(r2, r1, len, seg || 16, 1, !!open);
    g.rotateX(PI / 2); // top (r2) goes to +z
    return g;
  }
  function cylY(r1, r2, len, seg) { return new THREE.CylinderGeometry(r2, r1, len, seg || 16); }
  function cylX(r, len, seg) { var g = new THREE.CylinderGeometry(r, r, len, seg || 12); g.rotateZ(PI / 2); return g; }
  function sph(r, ws, hs) { return new THREE.SphereGeometry(r, ws || 14, hs || 10); }
  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

  // ---------------------------------------------------------------------------------------------
  // Shared procedural environment map (gives metal & gloss something to reflect, no assets)
  // ---------------------------------------------------------------------------------------------
  var _env = null;
  function envMap() {
    if (_env) return _env;
    if (typeof document === "undefined") return null;
    var faces = [], S = 64;
    for (var f = 0; f < 6; f++) {
      var c = document.createElement("canvas"); c.width = c.height = S;
      var g = c.getContext("2d");
      if (f === 2) { // +Y sky
        var rg = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.7);
        rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.4, "#e6eef8"); rg.addColorStop(1, "#b9c6d6");
        g.fillStyle = rg; g.fillRect(0, 0, S, S);
      } else if (f === 3) { // -Y floor
        g.fillStyle = "#3a3734"; g.fillRect(0, 0, S, S);
      } else {
        var lg = g.createLinearGradient(0, 0, 0, S);
        lg.addColorStop(0, "#d7e2ee"); lg.addColorStop(0.47, "#9aa6b2"); lg.addColorStop(0.53, "#5d5a55"); lg.addColorStop(1, "#2f2c29");
        g.fillStyle = lg; g.fillRect(0, 0, S, S);
        // soft boxes
        g.fillStyle = "rgba(255,255,255,0.95)";
        if (f === 0 || f === 4) g.fillRect(S * 0.15, S * 0.12, S * 0.3, S * 0.18);
        if (f === 1) g.fillRect(S * 0.55, S * 0.1, S * 0.25, S * 0.12);
      }
      faces.push(c);
    }
    _env = new THREE.CubeTexture(faces);
    _env.needsUpdate = true;
    return _env;
  }

  function stdMat(o) {
    var m = new THREE.MeshStandardMaterial({
      vertexColors: o.vc !== false, color: o.color || 0xffffff,
      roughness: o.rough === undefined ? 0.5 : o.rough, metalness: o.metal || 0,
      envMap: o.env === false ? null : envMap(), envMapIntensity: o.envI === undefined ? 0.9 : o.envI,
      transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity,
      depthWrite: o.transparent ? false : true, side: o.side || THREE.FrontSide
    });
    return m;
  }

  // ---------------------------------------------------------------------------------------------
  // AK paintball marker geometry.  Gun space: origin = top of the pistol grip (centre), barrel -Z.
  // ---------------------------------------------------------------------------------------------
  var AK = {
    magPivot: new THREE.Vector3(0, -0.006, -0.142),
    boltPos: new THREE.Vector3(0.024, 0.036, -0.152),
    hopperPos: new THREE.Vector3(0, 0.07, -0.035),
    muzzle: new THREE.Vector3(0, 0.012, -0.62)
  };

  function akPalette(accent) {
    var A = lin(accent);
    return {
      accent: A, accentD: shade(A, 0.55), accentL: mix(A, new THREE.Color(1, 1, 1), 0.25),
      dark: new THREE.Color(0.035, 0.037, 0.042), dark2: new THREE.Color(0.075, 0.078, 0.085),
      grey: new THREE.Color(0.22, 0.23, 0.25), steel: new THREE.Color(0.6, 0.62, 0.65),
      white: new THREE.Color(0.9, 0.9, 0.9), black: new THREE.Color(0.01, 0.01, 0.012),
      ball: mix(A, new THREE.Color(1, 0.85, 0.1), 0.0)
    };
  }

  // B = { poly, metal, mag, bolt, hopper, shell, balls } (any can be the same builder)
  function buildAK(B, pal) {
    var poly = B.poly, metal = B.metal, i;
    // ---- receiver (stamped AK shape) ----
    poly.add(sideShape([[0.088, 0.0], [0.088, 0.046], [0.078, 0.058], [-0.196, 0.058], [-0.212, 0.05], [-0.212, -0.004], [-0.17, -0.004], [-0.162, -0.016], [-0.072, -0.016], [-0.066, -0.002], [0.088, 0.0]], 0.040, 0.0025), pal.dark2);
    // dust cover (rounded, ribbed) on top
    var dc = new THREE.CylinderGeometry(0.0195, 0.0195, 0.25, 18, 1, false, PI / 2, PI);
    dc.rotateX(PI / 2);
    metal.add(dc, pal.grey, mtx(0, 0.052, -0.06));
    for (i = 0; i < 3; i++) metal.add(new THREE.TorusGeometry(0.0196, 0.0016, 4, 12, PI), pal.dark, mtx(0, 0.052, 0.04 - i * 0.012, 0, 0, 0));
    metal.add(rbox(0.036, 0.012, 0.02, 0.004, 0.002), pal.grey, mtx(0, 0.06, 0.07)); // rear lip
    // trunnion rivets + side rail plate (left side) + accent stripe
    for (i = 0; i < 4; i++) {
      metal.add(cylX(0.0028, 0.043, 8), pal.steel, mtx(0, 0.014 + (i % 2) * 0.022, -0.2 + Math.floor(i / 2) * 0.012));
      metal.add(cylX(0.0028, 0.043, 8), pal.steel, mtx(0, 0.008 + (i % 2) * 0.022, 0.06 + Math.floor(i / 2) * 0.012));
    }
    poly.add(rbox(0.006, 0.026, 0.12, 0.004, 0.0015), pal.dark, mtx(-0.021, 0.024, -0.03));
    poly.add(box(0.003, 0.006, 0.28), pal.accent, mtx(-0.0205, 0.044, -0.06));
    poly.add(box(0.003, 0.006, 0.28), pal.accent, mtx(0.0205, 0.044, -0.06));
    // ejection port + selector lever (right side)
    poly.add(box(0.004, 0.02, 0.07), pal.black, mtx(0.019, 0.036, -0.09));
    metal.add(sideShape([[0.06, 0.03], [0.065, 0.034], [-0.13, 0.03], [-0.125, 0.026]], 0.004, 0.0008), pal.steel, mtx(0.023, -0.002, 0));
    metal.add(sideShape([[-0.13, 0.028], [-0.142, 0.012], [-0.136, 0.01], [-0.124, 0.027]], 0.004, 0.0008), pal.steel, mtx(0.023, 0, 0));
    // ---- trigger guard + trigger ----
    poly.add(sideShape([[-0.072, -0.016], [-0.072, -0.034], [-0.062, -0.044], [0.0, -0.044], [0.008, -0.036], [0.004, -0.02], [-0.0, -0.022], [-0.002, -0.036], [-0.06, -0.036], [-0.064, -0.028], [-0.064, -0.016]], 0.012, 0.0012), pal.dark);
    metal.add(sideShape([[-0.03, -0.004], [-0.036, -0.016], [-0.04, -0.03], [-0.034, -0.034], [-0.031, -0.022], [-0.024, -0.004]], 0.006, 0.001), pal.accentL);
    // ---- pistol grip (accent rubber) ----
    poly.add(sideShape([[0.022, 0.0], [-0.022, 0.0], [-0.012, -0.03], [-0.002, -0.06], [0.004, -0.098], [0.016, -0.112], [0.042, -0.108], [0.046, -0.094], [0.036, -0.05], [0.028, -0.02]], 0.034, 0.005), pal.accent);
    for (i = 0; i < 4; i++) poly.add(rbox(0.036, 0.0035, 0.012, 0.0015, 0.0008), pal.accentD, mtx(0, -0.035 - i * 0.017, 0.033 + i * 0.0045 - 0.004, 0.33));
    // ---- lower handguard (accent) with grooves and M-LOK slots ----
    poly.add(sideShape([[-0.212, -0.006], [-0.212, 0.034], [-0.395, 0.034], [-0.405, 0.024], [-0.405, -0.0], [-0.39, -0.024], [-0.235, -0.024], [-0.222, -0.012]], 0.052, 0.006), pal.accent);
    for (i = 0; i < 3; i++) {
      poly.add(rbox(0.0035, 0.012, 0.03, 0.005, 0.001), pal.dark, mtx(-0.0262, 0.004, -0.255 - i * 0.045));
      poly.add(rbox(0.0035, 0.012, 0.03, 0.005, 0.001), pal.dark, mtx(0.0262, 0.004, -0.255 - i * 0.045));
    }
    poly.add(rbox(0.054, 0.004, 0.005, 0.002, 0.001), pal.dark, mtx(0, -0.018, -0.3));
    metal.add(rbox(0.05, 0.03, 0.012, 0.006, 0.002), pal.dark2, mtx(0, 0.01, -0.408)); // handguard retainer
    // ---- gas tube + upper handguard ----
    metal.add(cylZ(0.0105, 0.0105, 0.27, 14), pal.grey, mtx(0, 0.052, -0.33));
    poly.add(sideShape([[-0.2, 0.038], [-0.2, 0.066], [-0.205, 0.072], [-0.36, 0.072], [-0.37, 0.06], [-0.37, 0.038]], 0.034, 0.006), pal.accent);
    for (i = 0; i < 4; i++) poly.add(rbox(0.036, 0.003, 0.012, 0.0015, 0.0008), pal.accentD, mtx(0, 0.074, -0.23 - i * 0.035));
    // gas block + front sight
    metal.add(sideShape([[-0.44, -0.012], [-0.44, 0.062], [-0.47, 0.062], [-0.475, 0.04], [-0.475, -0.012]], 0.03, 0.002), pal.dark2);
    metal.add(sideShape([[-0.505, -0.014], [-0.505, 0.03], [-0.512, 0.078], [-0.53, 0.078], [-0.536, 0.03], [-0.536, -0.014]], 0.026, 0.002), pal.dark2);
    metal.add(cylY(0.0018, 0.0018, 0.028, 6), pal.steel, mtx(0, 0.072, -0.521));
    // ---- rear sight block + leaf ----
    metal.add(sideShape([[-0.19, 0.056], [-0.19, 0.074], [-0.2, 0.08], [-0.232, 0.08], [-0.24, 0.07], [-0.24, 0.056]], 0.034, 0.002), pal.dark2);
    metal.add(sideShape([[-0.2, 0.078], [-0.21, 0.087], [-0.29, 0.082], [-0.29, 0.078]], 0.022, 0.0008), pal.grey);
    metal.add(rbox(0.024, 0.008, 0.008, 0.002, 0.001), pal.accentL, mtx(0, 0.084, -0.255));
    // ---- barrel: thick paintball barrel with ported tip and slanted brake ----
    metal.add(cylZ(0.0145, 0.0145, 0.3, 20), pal.grey, mtx(0, 0.012, -0.36));
    metal.add(cylZ(0.0165, 0.0165, 0.012, 20), pal.dark, mtx(0, 0.012, -0.42));
    metal.add(cylZ(0.016, 0.0155, 0.07, 20), pal.accent, mtx(0, 0.012, -0.545)); // ported tip
    for (i = 0; i < 4; i++) {
      for (var k = 0; k < 6; k++) {
        var ang = k / 6 * TAU + (i % 2) * 0.5;
        poly.add(cylY(0.0028, 0.0028, 0.004, 8), pal.black, mtx(Math.cos(ang) * 0.0155, 0.012 + Math.sin(ang) * 0.0155, -0.52 - i * 0.016, 0, 0, ang - PI / 2));
      }
    }
    var brake = cylZ(0.019, 0.019, 0.045, 20);
    var bp = brake.attributes.position;
    for (i = 0; i < bp.count; i++) if (bp.getZ(i) < 0) bp.setZ(i, bp.getZ(i) - 0.012 + bp.getY(i) * 0.6); // slanted front
    brake.computeVertexNormals();
    metal.add(brake, pal.dark2, mtx(0, 0.012, -0.598));
    metal.add(cylZ(0.0115, 0.0115, 0.002, 16), pal.black, mtx(0, 0.012, -0.633)); // bore shadow
    metal.add(rbox(0.005, 0.012, 0.022, 0.002, 0.001), pal.black, mtx(0, 0.03, -0.6)); // brake port slot
    // ---- stock: skeleton frame (accent) + compressed-air tank (as the stock) ----
    poly.add(sideShape([[0.086, 0.048], [0.12, 0.044], [0.3, 0.012], [0.33, 0.012], [0.33, 0.0], [0.3, 0.0], [0.12, 0.03], [0.086, 0.03]], 0.02, 0.003), pal.accent);
    poly.add(sideShape([[0.31, 0.02], [0.345, 0.024], [0.348, -0.072], [0.31, -0.07]], 0.046, 0.006), pal.dark); // butt pad
    var tankAxis = new THREE.Vector3(0, -0.035, 0.205);
    var tilt = -0.11;
    var tankM = function (x, y, z) { return new THREE.Matrix4().compose(new THREE.Vector3(x || 0, (y || 0) - 0.032, z || 0.205), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(1, 1, 1)); };
    metal.add(cylZ(0.034, 0.034, 0.17, 24), pal.steel, tankM());
    var cap = sph(0.034, 24, 12); cap.scale(1, 1, 0.55);
    metal.add(cap, pal.steel, tankM(0, 0, 0.29));
    for (i = 0; i < 2; i++) metal.add(cylZ(0.0352, 0.0352, 0.012, 24), pal.accent, tankM(0, 0, 0.15 + i * 0.1));
    metal.add(cylZ(0.022, 0.03, 0.02, 20), pal.grey, tankM(0, 0, 0.11)); // regulator
    metal.add(cylZ(0.02, 0.02, 0.03, 16), pal.dark2, tankM(0, 0.0, 0.088)); // ASA adapter
    metal.add(cylX(0.011, 0.012, 16), pal.steel, tankM(-0.018, 0.02, 0.112)); // gauge
    poly.add(cylX(0.009, 0.0125, 16), pal.white, tankM(-0.0185, 0.02, 0.112));
    poly.add(box(0.001, 0.008, 0.0012), pal.black, tankM(-0.025, 0.022, 0.112).multiply(mtx(0, 0, 0, 0.8)));
    // stock-to-receiver plate
    poly.add(rbox(0.036, 0.05, 0.016, 0.006, 0.002), pal.dark2, mtx(0, 0.022, 0.09));

    // ---- magazine (banana mag) – built relative to the mag pivot ----
    var mag = B.mag, sh = [], s, N = 10;
    for (i = 0; i <= N; i++) { s = i / N; sh.push([-0.074 - 0.085 * Math.pow(s, 1.5), -0.006 - 0.2 * s]); }
    for (i = N; i >= 0; i--) { s = i / N; sh.push([-0.142 - 0.105 * Math.pow(s, 1.35), -0.006 - 0.19 * s]); }
    mag.add(sideShape(sh, 0.028, 0.0035), pal.dark2);
    for (i = 1; i < N; i += 2) { // side ribs
      s = i / N;
      var zr = -0.074 - 0.085 * Math.pow(s, 1.5), zf = -0.142 - 0.105 * Math.pow(s, 1.35), yy = -0.006 - 0.195 * s;
      var ln = Math.abs(zf - zr) - 0.012, ang2 = Math.atan2(0.01, Math.abs(zf - zr)) * 0;
      mag.add(rbox(0.031, 0.006, ln, 0.002, 0.001), pal.accent, mtx(0, yy, (zr + zf) / 2, -0.08 - s * 0.35 + ang2));
    }
    mag.add(rbox(0.034, 0.012, 0.06, 0.004, 0.002), pal.accent, mtx(0, -0.198, -0.205, -0.5)); // floor plate
    mag.add(box(0.026, 0.006, 0.065), pal.dark, mtx(0, 0.0, -0.108)); // feed lips

    // ---- charging handle (relative to boltPos) ----
    B.bolt.add(cylX(0.0055, 0.022, 10), pal.steel, mtx(AK.boltPos.x + 0.008, AK.boltPos.y, AK.boltPos.z));
    B.bolt.add(sph(0.0075, 12, 8), pal.accent, mtx(AK.boltPos.x + 0.021, AK.boltPos.y, AK.boltPos.z));
    B.bolt.add(box(0.004, 0.012, 0.05), pal.steel, mtx(AK.boltPos.x - 0.003, AK.boltPos.y, AK.boltPos.z + 0.022));

    // ---- hopper (relative to hopperPos) ----
    var H = AK.hopperPos, hx = H.x, hy = H.y, hz = H.z;
    var hs = B.hopper, ballsB = B.balls, shellB = B.shell;
    hs.add(cylY(0.017, 0.019, 0.04, 16), pal.accent, mtx(hx, hy + 0.018, hz)); // feed neck
    hs.add(cylY(0.021, 0.021, 0.012, 16), pal.dark, mtx(hx, hy + 0.005, hz)); // clamp
    hs.add(box(0.006, 0.01, 0.012), pal.steel, mtx(hx + 0.022, hy + 0.005, hz));
    var cy = hy + 0.078;
    var low = new THREE.SphereGeometry(1, 28, 10, 0, TAU, PI / 2, PI / 2);
    hs.add(low, pal.accent, mtx(hx, cy, hz, 0, 0, 0, 0.064, 0.04, 0.1));
    hs.add(new THREE.TorusGeometry(1, 0.075, 6, 32), pal.dark, mtx(hx, cy, hz, PI / 2, 0, 0, 0.066, 0.102, 0.07)); // rim
    var top = new THREE.SphereGeometry(1, 28, 10, 0, TAU, 0, PI / 2);
    shellB.add(top, pal.accentL, mtx(hx, cy, hz, 0, 0, 0, 0.062, 0.058, 0.098));
    // top ridge / lid + rear vents
    hs.add(rbox(0.024, 0.014, 0.17, 0.006, 0.004), pal.accent, mtx(hx, cy + 0.052, hz - 0.004, 0.0));
    hs.add(rbox(0.03, 0.01, 0.04, 0.004, 0.002), pal.dark, mtx(hx, cy + 0.048, hz + 0.075, -0.75));
    hs.add(rbox(0.03, 0.01, 0.04, 0.004, 0.002), pal.dark, mtx(hx, cy + 0.048, hz - 0.083, 0.75));
    for (i = 0; i < 3; i++) {
      hs.add(rbox(0.004, 0.006, 0.05, 0.002, 0.001), pal.dark, mtx(hx - 0.064, cy - 0.012 - i * 0.012, hz, 0, 0, 0.2 + i * 0.25));
      hs.add(rbox(0.004, 0.006, 0.05, 0.002, 0.001), pal.dark, mtx(hx + 0.064, cy - 0.012 - i * 0.012, hz, 0, 0, -0.2 - i * 0.25));
    }
    // paintballs inside the hopper + a couple in the neck
    var rb = 0.0088, ballGeo = sph(rb, 10, 8), seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (var bx = -2; bx <= 2; bx++) for (var by = 0; by <= 3; by++) for (var bz = -4; bz <= 4; bz++) {
      var px = bx * 0.019 + (by % 2) * 0.008, pyb = by * 0.016 - 0.024, pz = bz * 0.019 + (by % 2) * 0.008;
      var ex = px / 0.054, ey = pyb / 0.042, ez = pz / 0.088;
      if (ex * ex + ey * ey + ez * ez > 1) continue;
      if (pyb > 0.025) continue;
      var bc = rnd() < 0.85 ? pal.ball : mix(pal.ball, new THREE.Color(1, 1, 1), 0.4);
      ballsB.add(ballGeo, bc, mtx(hx + px, cy + pyb, hz + pz, rnd() * 3, rnd() * 3, 0));
    }
    ballsB.add(ballGeo, pal.ball, mtx(hx, hy + 0.028, hz));
  }

  // ---------------------------------------------------------------------------------------------
  // Butterfly knife geometry. Knife frame: tang centre at origin, blade forward (-Z), spine +Y.
  // Pins along X: safe handle (A) pin at +PIN, bite handle (B) pin at -PIN.
  // ---------------------------------------------------------------------------------------------
  var PIN = 0.0072, H_LEN = 0.128, H_H = 0.0158, PLATE_X = 0.0034, PLATE_T = 0.0019;

  function knifePalette(accent) {
    var A = lin(accent || "#ff3fa4");
    return { accent: A, accentD: shade(A, 0.5), steel: new THREE.Color(0.78, 0.8, 0.83), steelD: new THREE.Color(0.4, 0.42, 0.45), dark: new THREE.Color(0.03, 0.03, 0.035), gold: new THREE.Color(0.85, 0.6, 0.25) };
  }

  function buildBlade(b, pal) {
    // blade outline in (u forward, v up)
    var s = new THREE.Shape();
    s.moveTo(-0.008, 0.006);
    s.quadraticCurveTo(-0.011, 0.0, -0.008, -0.006);
    s.lineTo(-0.004, -0.0115);
    s.lineTo(0.012, -0.0115);
    s.quadraticCurveTo(0.014, -0.0075, 0.018, -0.0075); // choil/kicker notch
    s.lineTo(0.02, -0.011);
    s.lineTo(0.06, -0.0115);
    s.quadraticCurveTo(0.094, -0.011, 0.112, 0.004); // belly to tip
    s.quadraticCurveTo(0.095, 0.006, 0.075, 0.0115); // clip point
    s.lineTo(0.004, 0.0115);
    s.quadraticCurveTo(-0.004, 0.0115, -0.008, 0.006);
    s.holes.push(circlePath(0.03, 0.002, 0.0032, 14));
    var g = new THREE.ExtrudeGeometry(s, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0009, bevelSegments: 1, curveSegments: 10 });
    g.rotateY(PI / 2); // u -> -z, extrusion -> +x
    g.translate(-0.0008, 0, 0);
    b.add(g, pal.steel);
    // fuller/grind line (darker strip on both faces)
    b.add(box(0.0032, 0.0016, 0.05), pal.steelD, mtx(0, 0.0065, -0.045));
    // tang pins
    b.add(cylX(0.0022, 0.0095, 10), pal.steel, mtx(0, PIN, 0));
    b.add(cylX(0.0022, 0.0095, 10), pal.steel, mtx(0, -PIN, 0));
    b.add(cylX(0.0013, 0.009, 8), pal.dark, mtx(0, 0, 0.004)); // tang stop pin
  }

  // Handle built relative to its own pin (pin at origin), extending to +Z when open.
  function buildHandle(b, pal, isBite) {
    var s = new THREE.Shape(), L = H_LEN, h = H_H / 2;
    s.moveTo(-0.006, -h + 0.002);
    s.quadraticCurveTo(-0.009, 0, -0.006, h - 0.002);
    s.lineTo(L - 0.006, h);
    s.quadraticCurveTo(L + 0.002, h, L + 0.002, 0);
    s.quadraticCurveTo(L + 0.002, -h, L - 0.006, -h);
    s.lineTo(-0.006, -h + 0.002);
    // skeleton holes
    s.holes.push(circlePath(0.0, 0.0, 0.0024, 10));
    var x0 = 0.014;
    for (var i = 0; i < 4; i++) {
      var a = x0 + i * 0.027;
      s.holes.push(slotPath(a, a + 0.016, 0.0, 0.0034));
    }
    var col = pal.accent;
    var plate = shapeSide(s, PLATE_T, 0.0004);
    b.add(plate, col, mtx(PLATE_X, 0, 0));
    b.add(plate, col, mtx(-PLATE_X, 0, 0));
    // spacers (between plates), pommel and screws
    b.add(rbox(PLATE_X * 2, H_H * 0.62, 0.006, 0.002, 0.0005), pal.dark, mtx(0, 0, L - 0.003));
    b.add(rbox(PLATE_X * 2, 0.004, 0.012, 0.0015, 0.0005), pal.dark, mtx(0, isBite ? -h + 0.002 : h - 0.002, 0.007));
    for (var k = 0; k < 3; k++) b.add(cylX(0.0016, PLATE_X * 2 + PLATE_T * 2 + 0.001, 8), pal.steelD, mtx(0, 0, 0.026 + k * 0.03 + 0.008));
    b.add(cylX(0.0028, PLATE_X * 2 + PLATE_T * 2 + 0.0012, 12), pal.gold, mtx(0, 0, 0)); // pivot screw heads
    if (isBite) { // latch at the end of the bite handle
      b.add(rbox(0.0028, 0.0036, 0.03, 0.0012, 0.0004), pal.steel, mtx(0, -h - 0.0012, L - 0.008, 0.06));
      b.add(cylX(0.0016, PLATE_X * 2 + PLATE_T * 2 + 0.001, 8), pal.steel, mtx(0, -h + 0.001, L - 0.002));
    }
  }

  // Knife rig: returns { root (=held safe handle frame), bladeNode, handleBNode, set(a,b) }
  function makeBalisong(accent, mats) {
    var pal = knifePalette(accent);
    var rootK = new THREE.Group();
    var bA = new Builder(); buildHandle(bA, pal, false);
    var bB = new Builder(); buildHandle(bB, pal, true);
    var bl = new Builder(); buildBlade(bl, pal);
    var handleA = bA.mesh(mats.metal); handleA.position.set(0, PIN, 0); rootK.add(handleA);
    var bladeNode = new THREE.Group(); bladeNode.position.set(0, PIN, 0); rootK.add(bladeNode);
    var blade = bl.mesh(mats.steel); blade.position.set(0, -PIN, 0); bladeNode.add(blade);
    var bNode = new THREE.Group(); bNode.position.set(0, -2 * PIN, 0); bladeNode.add(bNode);
    var handleB = bB.mesh(mats.metal); bNode.add(handleB);
    return {
      root: rootK,
      set: function (a, b) { bladeNode.rotation.x = a; bNode.rotation.x = b; },
      meshes: [handleA, blade, handleB]
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Mii mitten hand. Hand space: gripped object axis = +Y through origin, palm/back of hand on
  // the +X side, fingers wrap around the front (-Z) to -X, thumb wraps around the back (+Z).
  // ---------------------------------------------------------------------------------------------
  function buildHand(b, skin, R, mirror) {
    var M = mirror ? new THREE.Matrix4().makeScale(-1, 1, 1) : new THREE.Matrix4();
    var add = function (g, c, m) { b.add(g, c, new THREE.Matrix4().multiplyMatrices(M, m || new THREE.Matrix4())); };
    var sk = skin, skD = shade(skin, 0.8);
    var w = 2 * R + 0.024, d = 2 * R + 0.044, fz = -R - 0.006;
    // fist body: the grip passes through it (back of the hand on +X, knuckles at the front -Z)
    add(rbox(w, 0.07, d, 0.016, 0.011), sk, mtx(0.004, -0.006, fz + d / 2 + 0.002));
    // finger rolls at the front, wrapping onto the -X (fingertip) side
    for (var i = 0; i < 4; i++) {
      var y = 0.022 - i * 0.0175, r = i === 0 ? 0.0102 : 0.0095 - i * 0.0004;
      var cap = new THREE.CapsuleGeometry(r, w - 0.016, 4, 10);
      add(cap, sk, mtx(0.002, y, fz + 0.002, 0, 0, PI / 2));
      add(new THREE.CapsuleGeometry(r * 0.95, d * 0.42, 4, 10), sk, mtx(-w / 2 + 0.004, y, fz + d * 0.25, PI / 2, 0, 0));
      if (i < 3) add(new THREE.CylinderGeometry(0.0016, 0.0016, w - 0.01, 6), skD, mtx(0.002, y - 0.0088, fz - r * 0.55, 0, 0, PI / 2));
    }
    // thumb: lies along the -X side at the top, tip pointing forward
    var th = new THREE.CapsuleGeometry(0.0105, 0.03, 4, 10);
    add(th, sk, mtx(-w / 2 - 0.002, 0.03, fz + d * 0.42, PI / 2 + 0.25, 0.25, 0));
    add(sph(0.016, 12, 10), sk, mtx(-w / 2 + 0.008, 0.024, fz + d * 0.75, 0, 0, 0, 1, 0.9, 1.1)); // thumb base
    // knuckle highlights on the back of the hand
    for (var k = 0; k < 4; k++) add(sph(0.0062, 8, 6), shade(skin, 1.04), mtx(w / 2 - 0.003, 0.022 - k * 0.0175, fz + 0.01, 0, 0, 0, 0.7, 1, 1));
    // wrist (towards +Z, slightly down) – the sleeve cuff covers its end
    add(new THREE.CapsuleGeometry(0.022, 0.03, 4, 12), sk, mtx(0.004, -0.012, fz + d + 0.012, PI / 2, 0, 0, 1.05, 1, 0.9));
  }
  var WRIST = function (R) { return new THREE.Vector3(0.004, -0.012, R + 0.06); };

  function buildSleeve(b, col) {
    // along +Y from 0 (wrist) to 0.6, cuff at the wrist end
    b.add(cylY(0.031, 0.04, 0.6, 18), col, mtx(0, 0.31, 0));
    b.add(cylY(0.034, 0.035, 0.04, 18), shade(col, 0.72), mtx(0, 0.022, 0));
    b.add(new THREE.TorusGeometry(0.034, 0.0045, 6, 18), shade(col, 0.6), mtx(0, 0.002, 0, PI / 2));
    b.add(cylY(0.03, 0.03, 0.004, 18), shade(col, 0.4), mtx(0, -0.0, 0));
  }

  // ---------------------------------------------------------------------------------------------
  // Keyframe helpers
  // ---------------------------------------------------------------------------------------------
  var EASE = {
    s: function (u) { return u * u * (3 - 2 * u); },
    l: function (u) { return u; },
    o: function (u) { return 1 - (1 - u) * (1 - u) * (1 - u); },
    i: function (u) { return u * u * u; },
    b: function (u) { var c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); } // back-out
  };
  // keys: [[t, v, ease?], ...]
  function K(keys) {
    return function (t) {
      if (t <= keys[0][0]) return keys[0][1];
      for (var i = 0; i < keys.length - 1; i++) {
        var a = keys[i], b = keys[i + 1];
        if (t < b[0]) {
          var u = (t - a[0]) / Math.max(b[0] - a[0], 1e-6);
          return a[1] + (b[1] - a[1]) * (EASE[b[2] || "s"])(u);
        }
      }
      return keys[keys.length - 1][1];
    };
  }
  // scale times of a key list
  function KS(keys, f, off) { return keys.map(function (k) { return [k[0] * f + (off || 0), k[1], k[2]]; }); }

  function Spring(k, damp) { this.x = 0; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k) * damp; }
  Spring.prototype.step = function (dt, target) {
    target = target || 0;
    var n = Math.ceil(dt / (1 / 240));
    var h = dt / Math.max(n, 1);
    for (var i = 0; i < n; i++) {
      var a = -this.k * (this.x - target) - this.c * this.v;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  };

  // ---------------------------------------------------------------------------------------------
  // Textures: paint splats + muzzle puff
  // ---------------------------------------------------------------------------------------------
  function seeded(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function drawSplat(g, S, rnd, color) {
    g.fillStyle = color;
    var cx = S / 2, cy = S / 2, R = S * (0.2 + rnd() * 0.05), i, a, r;
    // main blob: noisy polygon with lobes
    var N = 48, lobes = [];
    for (i = 0; i < 9; i++) lobes.push({ a: rnd() * TAU, w: 0.15 + rnd() * 0.3, h: 0.15 + rnd() * 0.5 });
    g.beginPath();
    for (i = 0; i <= N; i++) {
      a = i / N * TAU; r = R * (0.85 + rnd() * 0.12);
      for (var l = 0; l < lobes.length; l++) {
        var d = Math.atan2(Math.sin(a - lobes[l].a), Math.cos(a - lobes[l].a));
        r += R * lobes[l].h * Math.exp(-(d * d) / (lobes[l].w * lobes[l].w * 0.25));
      }
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    // streaks / tendrils
    for (i = 0; i < 7; i++) {
      a = rnd() * TAU; var len = R * (1.1 + rnd() * 0.9), w = R * (0.06 + rnd() * 0.08);
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.beginPath(); g.moveTo(R * 0.5, -w); g.quadraticCurveTo(len, -w * 0.4, len + w, 0); g.quadraticCurveTo(len, w * 0.4, R * 0.5, w); g.fill();
      g.beginPath(); g.arc(len + w * 0.6, 0, w * 1.3, 0, TAU); g.fill();
      g.restore();
    }
    // droplets
    for (i = 0; i < 26; i++) {
      a = rnd() * TAU; r = R * (1.15 + rnd() * 1.0); var dr = S * (0.004 + rnd() * rnd() * 0.022);
      if (cx + Math.cos(a) * r + dr > S - 2 || cx + Math.cos(a) * r - dr < 2) r *= 0.8;
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dr, 0, TAU); g.fill();
    }
  }

  var _splats = null;
  function splatTextures() {
    if (_splats) return _splats;
    _splats = [];
    if (typeof document === "undefined") return _splats;
    for (var k = 0; k < 4; k++) {
      var c = document.createElement("canvas"); c.width = c.height = 256;
      var g = c.getContext("2d");
      drawSplat(g, 256, seeded(1234 + k * 977), "#ffffff");
      // subtle inner shading in alpha (thicker paint in the middle)
      var t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      _splats.push(t);
    }
    return _splats;
  }

  function puffTexture(accentHex) {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var g = c.getContext("2d");
    var rnd = seeded(99);
    g.globalAlpha = 0.95;
    drawSplat(g, 128, rnd, accentHex);
    g.globalCompositeOperation = "source-atop";
    var rg = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.28, "rgba(255,255,255,0.75)"); rg.addColorStop(0.6, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function paintBallMaterial(color) {
    return new THREE.MeshPhongMaterial({ color: lin(color || "#ff3fa4"), shininess: 120, specular: new THREE.Color(0.55, 0.55, 0.55), emissive: lin(color || "#ff3fa4").multiplyScalar(0.12) });
  }

  // ---------------------------------------------------------------------------------------------
  // World (third-person) models
  // ---------------------------------------------------------------------------------------------
  function createWorldGun(accent) {
    var pal = akPalette(accent || "#ff3fa4");
    var poly = new Builder(), metal = new Builder(), shell = new Builder();
    buildAK({ poly: poly, metal: metal, mag: poly, bolt: metal, hopper: poly, shell: shell, balls: poly }, pal);
    var g = new THREE.Group();
    var inner = new THREE.Group(); inner.rotation.y = PI; g.add(inner); // barrel -> +Z
    inner.add(poly.mesh(stdMat({ rough: 0.55, metal: 0.05, envI: 0.6 })));
    inner.add(metal.mesh(stdMat({ rough: 0.32, metal: 0.65 })));
    var sm = stdMat({ rough: 0.08, metal: 0, transparent: true, opacity: 0.42, envI: 1.4 });
    inner.add(shell.mesh(sm));
    g.name = "PBWorldGun";
    g.userData.muzzle = new THREE.Vector3(-AK.muzzle.x, AK.muzzle.y, -AK.muzzle.z);
    return g;
  }

  function createWorldKnife(accent) {
    var mats = { metal: stdMat({ rough: 0.3, metal: 0.7 }), steel: stdMat({ rough: 0.18, metal: 0.95, envI: 1.2 }) };
    var k = makeBalisong(accent || "#ff3fa4", mats);
    var g = new THREE.Group();
    var inner = new THREE.Group(); inner.rotation.y = PI; inner.position.z = 0.06; // grip centre at origin
    inner.add(k.root); g.add(inner);
    k.set(0, 0);
    g.userData.setOpen = function (open) { if (open) k.set(0, 0); else k.set(PI, PI); };
    g.name = "PBWorldKnife";
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // First-person viewmodel
  // ---------------------------------------------------------------------------------------------
  function createViewmodel(opts) {
    opts = opts || {};
    var accentHex = opts.accent || "#ff3fa4";
    var sleeveCol = lin(opts.sleeve || "#2b7cff"), skinCol = lin(opts.skin || "#f2c7a5");
    var pal = akPalette(accentHex);
    var disposables = [];

    var group = new THREE.Group(); group.name = "PBViewmodel";
    if (opts.lights !== false) {
      var hemi = new THREE.HemisphereLight(0xeef4ff, 0x4a4038, 0.6);
      var key = new THREE.DirectionalLight(0xfff6ea, 1.0); key.position.set(0.6, 1.2, 0.5);
      var rim = new THREE.DirectionalLight(0xbfd8ff, 0.55); rim.position.set(-1.0, 0.4, -0.8);
      key.target.position.set(0, 0, -0.3); rim.target.position.set(0, 0, -0.3);
      group.add(hemi, key, key.target, rim, rim.target);
    }
    var swayRoot = new THREE.Group(); group.add(swayRoot);

    // materials
    var M = {
      poly: stdMat({ rough: 0.55, metal: 0.05, envI: 0.6 }),
      metal: stdMat({ rough: 0.3, metal: 0.65 }),
      shell: stdMat({ rough: 0.06, metal: 0, transparent: true, opacity: 0.4, envI: 1.5 }),
      balls: stdMat({ rough: 0.12, metal: 0, envI: 1.0 }),
      skin: stdMat({ rough: 0.7, metal: 0, envI: 0.25 }),
      sleeve: stdMat({ rough: 0.9, metal: 0, envI: 0.15 }),
      kmetal: stdMat({ rough: 0.28, metal: 0.7 }),
      ksteel: stdMat({ rough: 0.16, metal: 0.95, envI: 1.25 })
    };
    for (var mk in M) disposables.push(M[mk]);

    // ------------------------------------------------------------------ AK rig
    var akRoot = new THREE.Group(); swayRoot.add(akRoot);
    var akGun = new THREE.Group(); akRoot.add(akGun);
    var bPoly = new Builder(), bMetal = new Builder();
    var bMag = withOffset(new Builder(), AK.magPivot.x, AK.magPivot.y, AK.magPivot.z);
    var bBolt = withOffset(new Builder(), AK.boltPos.x, AK.boltPos.y, AK.boltPos.z);
    var bHop = withOffset(new Builder(), AK.hopperPos.x, AK.hopperPos.y, AK.hopperPos.z);
    var bShell = withOffset(new Builder(), AK.hopperPos.x, AK.hopperPos.y, AK.hopperPos.z);
    var bBalls = withOffset(new Builder(), AK.hopperPos.x, AK.hopperPos.y, AK.hopperPos.z);
    buildAK({ poly: bPoly, metal: bMetal, mag: bMag, bolt: bBolt, hopper: bHop, shell: bShell, balls: bBalls }, pal);
    akGun.add(bPoly.mesh(M.poly), bMetal.mesh(M.metal));
    var magMesh = bMag.mesh(M.poly); magMesh.position.copy(AK.magPivot); akGun.add(magMesh);
    var boltMesh = bBolt.mesh(M.metal); boltMesh.position.copy(AK.boltPos); akGun.add(boltMesh);
    var hopper = new THREE.Group(); hopper.position.copy(AK.hopperPos); akGun.add(hopper);
    var shellMesh = bShell.mesh(M.shell); shellMesh.renderOrder = 2;
    hopper.add(bHop.mesh(M.poly), bBalls.mesh(M.balls), shellMesh);
    var muzzleNode = new THREE.Object3D(); muzzleNode.position.copy(AK.muzzle); akGun.add(muzzleNode);
    // muzzle paint puff
    var puffTex = puffTexture(accentHex); disposables.push(puffTex);
    var puffMat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 });
    disposables.push(puffMat);
    var puff = new THREE.Sprite(puffMat); puff.position.copy(AK.muzzle).add(new THREE.Vector3(0, 0, -0.04)); puff.visible = false; puff.renderOrder = 3;
    akGun.add(puff);

    // hands for the AK
    var HR = 0.02;
    var bRH = new Builder(); buildHand(bRH, skinCol, HR, false);
    var bLH = new Builder(); buildHand(bLH, skinCol, 0.026, true);
    var rHandAK = bRH.mesh(M.skin), lHandAK = bLH.mesh(M.skin);
    akGun.add(rHandAK, lHandAK);
    // right hand on the pistol grip
    (function () {
      var up = new THREE.Vector3(0, 0.1, -0.034).normalize();
      var X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3().crossVectors(X, up);
      rHandAK.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, up, Z));
      rHandAK.position.set(0.0, -0.05, 0.014);
    })();
    // left-hand poses (in gun space)
    var LH_GUARD = { p: new THREE.Vector3(0.0, 0.0, -0.31), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0))) };
    LH_GUARD.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.35, 0)));
    var LH_MAG_LOCAL = { p: new THREE.Vector3(0, -0.075, -0.05), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)) };
    var LH_BOLT = { p: new THREE.Vector3(0.05, 0.05, -0.15), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.6, 1.9)) };

    // ------------------------------------------------------------------ knife rig
    var knRoot = new THREE.Group(); swayRoot.add(knRoot);
    var knHandFrame = new THREE.Group(); knRoot.add(knHandFrame); // hand + knife
    var bKH = new Builder(); buildHand(bKH, skinCol, 0.017, false);
    var kHand = bKH.mesh(M.skin);
    // hand axis Y -> knife -Z, palm +X -> knife +X
    kHand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
    kHand.position.set(0, 0, 0.1);
    knHandFrame.add(kHand);
    var knFree = new THREE.Group(); knHandFrame.add(knFree); // knife relative to hand (tricks/aerials)
    var bali = makeBalisong(accentHex, { metal: M.kmetal, steel: M.ksteel });
    knFree.add(bali.root);
    bali.root.scale.setScalar(1.45);

    // ------------------------------------------------------------------ sleeves
    var bS = new Builder(); buildSleeve(bS, sleeveCol);
    var sGeo = bS.geometry();
    var sleeveR = new THREE.Mesh(sGeo, M.sleeve), sleeveL = new THREE.Mesh(sGeo, M.sleeve);
    sleeveR.frustumCulled = sleeveL.frustumCulled = false;
    swayRoot.add(sleeveR, sleeveL);
    var wristR_AK = new THREE.Object3D(); wristR_AK.position.copy(WRIST(HR)); rHandAK.add(wristR_AK);
    var wristL_AK = new THREE.Object3D(); wristL_AK.position.copy(WRIST(0.026)).multiply(new THREE.Vector3(-1, 1, 1)); lHandAK.add(wristL_AK);
    var wristR_K = new THREE.Object3D(); wristR_K.position.copy(WRIST(0.017)); kHand.add(wristR_K);
    var SHOULDER_RK = new THREE.Vector3(0.55, -0.55, -0.12), SHOULDER_R = new THREE.Vector3(0.3, -0.7, -0.05), SHOULDER_L = new THREE.Vector3(-0.2, -0.4, 0.12);

    // ------------------------------------------------------------------ poses
    var AK_BASE = { p: new THREE.Vector3(0.2, -0.17, -0.43), r: new THREE.Euler(0.03, 0.2, 0.02) };
    var KN_BASE = { p: new THREE.Vector3(0.235, -0.115, -0.45), r: new THREE.Euler(0.5, 0.48, PI * 0.75) };
    akRoot.position.copy(AK_BASE.p); akRoot.rotation.copy(AK_BASE.r);

    // channel lists
    var AK_CH = ["px", "py", "pz", "rx", "ry", "rz", "magY", "magZ", "magRX", "lhW", "lbW", "bolt", "lhX", "lhY", "lhZ"];
    var KN_CH = ["px", "py", "pz", "rx", "ry", "rz", "a", "b", "kx", "ky", "kz", "krx", "kry", "krz"];

    function akReloadAction(empty) {
      var f = empty ? 0.72 : 1.0; // magazine part time scale
      var ch = {
        rx: K(KS([[0, 0], [0.22, 0.12], [0.5, 0.18], [0.95, 0.1], [1.35, 0.16], [1.47, 0.24, "o"], [1.62, 0.1], [2.0, 0.04], [2.43 / f, 0]], f)),
        rz: K(KS([[0, 0], [0.25, 0.55], [1.3, 0.5], [1.48, 0.6, "o"], [1.75, 0.35], [2.2, 0.05], [2.43 / f, 0]], f)),
        ry: K(KS([[0, 0], [0.25, 0.12], [1.3, 0.12], [1.9, 0.02], [2.43 / f, 0]], f)),
        py: K(KS([[0, 0], [0.25, 0.02], [0.5, 0.035], [0.9, 0.04], [1.46, 0.03], [1.5, 0.042, "o"], [1.7, 0.02], [2.43 / f, 0]], f)),
        px: K(KS([[0, 0], [0.25, -0.03], [1.5, -0.035], [2.1, -0.005], [2.43 / f, 0]], f)),
        pz: K(KS([[0, 0], [0.25, 0.02], [1.6, 0.02], [2.43 / f, 0]], f)),
        magRX: K(KS([[0, 0], [0.3, 0], [0.45, 0.32, "o"], [0.7, 0.4], [0.82, 0.1], [1.12, 0.35], [1.32, 0.3], [1.45, 0.0, "o"]], f)),
        magY: K(KS([[0, 0], [0.38, 0], [0.5, -0.03, "i"], [0.78, -0.45, "i"], [0.82, -0.5], [0.95, -0.45], [1.18, -0.06, "o"], [1.32, -0.012], [1.45, 0, "o"]], f)),
        magZ: K(KS([[0, 0], [0.4, 0], [0.78, 0.05], [0.95, 0.05], [1.2, -0.01], [1.45, 0]], f)),
        lhW: K(KS([[0, 0], [0.32, 1, "o"], [1.48, 1], [1.62, 0]], f)),
        lhY: K(KS([[0, 0], [1.4, 0], [1.48, -0.02, "o"], [1.62, 0]], f)),
        lbW: K([[0, 0], [1, 0]]), bolt: K([[0, 0], [1, 0]])
      };
      if (empty) {
        var b0 = 1.66;
        ch.lbW = K([[0, 0], [b0, 0], [b0 + 0.2, 1, "o"], [b0 + 0.5, 1], [b0 + 0.68, 0]]);
        ch.bolt = K([[0, 0], [b0 + 0.22, 0], [b0 + 0.34, 1, "o"], [b0 + 0.4, 1], [b0 + 0.44, 0, "i"]]);
        ch.rz = K(KS([[0, 0], [0.25, 0.55], [1.3, 0.5], [1.48, 0.6, "o"], [1.62, 0.3]], f).concat([[b0 + 0.15, -0.35], [b0 + 0.45, -0.4], [b0 + 0.5, -0.32, "o"], [2.43, 0]]));
        ch.py = K(KS([[0, 0], [0.25, 0.02], [0.5, 0.035], [0.9, 0.04], [1.46, 0.03], [1.5, 0.042, "o"], [1.7, 0.02]], f).concat([[b0 + 0.3, 0.03], [b0 + 0.44, 0.04, "o"], [2.43, 0]]));
        ch.px = K(KS([[0, 0], [0.25, -0.03], [1.5, -0.035]], f).concat([[b0 + 0.3, -0.05], [2.43, 0]]));
        ch.rx = K(KS([[0, 0], [0.22, 0.12], [0.5, 0.18], [0.95, 0.1], [1.35, 0.16], [1.47, 0.24, "o"], [1.62, 0.1]], f).concat([[b0 + 0.3, 0.12], [b0 + 0.45, 0.16, "o"], [2.43, 0]]));
      }
      return { name: "reload", dur: 2.43, ch: ch };
    }

    function akDrawAction() {
      return {
        name: "draw", dur: 1.0, ch: {
          py: K([[0, -0.24], [0.42, 0.006, "o"], [0.55, 0]]),
          pz: K([[0, 0.05], [0.42, 0, "o"]]),
          rx: K([[0, -0.9], [0.42, 0.04, "o"], [0.55, 0], [0.7, 0.03], [0.82, 0.07, "o"], [1.0, 0]]),
          ry: K([[0, 0.3], [0.45, 0, "o"]]),
          rz: K([[0, 0.6], [0.45, 0, "o"], [0.6, -0.32], [0.84, -0.36], [1.0, 0]]),
          lbW: K([[0, 0], [0.45, 0], [0.62, 1, "o"], [0.84, 1], [1.0, 0]]),
          bolt: K([[0, 0], [0.64, 0], [0.74, 1, "o"], [0.8, 1], [0.84, 0, "i"]]),
          px: K([[0, 0.03], [0.45, 0, "o"], [0.62, -0.02], [1.0, 0]])
        }
      };
    }

    function akInspectAction() {
      var D = 4.6;
      return {
        name: "inspect", dur: D, ch: {
          px: K([[0, 0], [0.6, -0.07], [1.9, -0.075], [2.5, -0.04], [3.7, -0.05], [D, 0]]),
          py: K([[0, 0], [0.6, 0.045], [1.9, 0.05], [2.5, 0.03], [3.7, 0.035], [D, 0]]),
          pz: K([[0, 0], [0.6, 0.02], [1.9, 0.02], [2.5, -0.02], [3.7, -0.02], [D, 0]]),
          ry: K([[0, 0], [0.6, 0.85], [1.9, 0.95], [2.5, -0.25], [3.7, -0.32], [D, 0]]),
          rz: K([[0, 0], [0.6, 0.25], [1.9, 0.35], [2.5, -0.95], [3.7, -1.05], [D, 0]]),
          rx: K([[0, 0], [0.6, 0.1], [1.9, 0.05], [2.5, 0.25], [3.7, 0.2], [D, 0]])
        }
      };
    }

    function knDrawAction() {
      return {
        name: "draw", dur: 1.0, ch: {
          py: K([[0, -0.2], [0.25, -0.02, "o"], [0.75, 0.01], [1.0, 0]]),
          px: K([[0, 0.04], [0.25, 0], [0.5, -0.02], [1.0, 0]]),
          rx: K([[0, -0.9], [0.25, 0.2, "o"], [0.45, -0.25], [0.75, 0.15], [1.0, 0]]),
          rz: K([[0, -0.5], [0.25, 0.35], [0.5, -0.3], [0.75, 0.15], [1.0, 0]]),
          ry: K([[0, 0.2], [0.3, -0.25], [0.75, 0.1], [1.0, 0]]),
          a: K([[0, PI], [0.2, PI], [0.46, 0, "o"]]),
          b: K([[0, PI], [0.42, PI], [0.74, TAU, "o"], [1.0, TAU]])
        }
      };
    }

    function knSlashAction(alt) {
      var s = alt ? -1 : 1;
      if (!alt) return {
        name: "slash", dur: 0.4, ch: {
          px: K([[0, 0], [0.06, 0.03], [0.18, -0.17, "o"], [0.4, 0]]),
          py: K([[0, 0], [0.06, 0.035], [0.18, -0.03, "o"], [0.4, 0]]),
          pz: K([[0, 0], [0.06, 0.02], [0.18, -0.07, "o"], [0.4, 0]]),
          ry: K([[0, 0], [0.06, -0.35], [0.18, 0.75, "o"], [0.4, 0]]),
          rz: K([[0, 0], [0.06, -0.5], [0.18, 0.95, "o"], [0.4, 0]]),
          rx: K([[0, 0], [0.06, 0.15], [0.18, -0.35, "o"], [0.4, 0]])
        }
      };
      return {
        name: "slash", dur: 0.4, ch: {
          px: K([[0, 0], [0.07, -0.1], [0.19, 0.06, "o"], [0.4, 0]]),
          py: K([[0, 0], [0.07, 0.06], [0.19, -0.06, "o"], [0.4, 0]]),
          pz: K([[0, 0], [0.07, -0.02], [0.19, -0.05, "o"], [0.4, 0]]),
          ry: K([[0, 0], [0.07, 0.55], [0.19, -0.6, "o"], [0.4, 0]]),
          rz: K([[0, 0], [0.07, 1.1], [0.19, -0.75, "o"], [0.4, 0]]),
          rx: K([[0, 0], [0.07, 0.25], [0.19, -0.45, "o"], [0.4, 0]])
        }
      };
    }

    function knStabAction() {
      return {
        name: "stab", dur: 1.0, ch: {
          pz: K([[0, 0], [0.28, 0.06], [0.42, -0.2, "o"], [0.58, -0.19], [1.0, 0]]),
          px: K([[0, 0], [0.28, 0.02], [0.42, -0.1, "o"], [0.58, -0.1], [1.0, 0]]),
          py: K([[0, 0], [0.28, 0.05], [0.42, 0.05, "o"], [0.58, 0.04], [1.0, 0]]),
          rx: K([[0, 0], [0.28, 0.45], [0.42, -0.12, "o"], [0.58, -0.1], [1.0, 0]]),
          ry: K([[0, 0], [0.28, 0.1], [0.42, -0.32, "o"], [0.58, -0.3], [1.0, 0]]),
          rz: K([[0, 0], [0.28, -0.9], [0.42, -1.25, "o"], [0.58, -1.2], [1.0, 0]])
        }
      };
    }

    function knInspectAction() {
      var D = 3.6;
      return {
        name: "inspect", dur: D, ch: {
          px: K([[0, 0], [0.35, -0.07], [2.2, -0.06], [2.95, -0.07], [3.25, -0.06], [D, 0]]),
          py: K([[0, 0], [0.35, 0.05], [2.2, 0.05], [2.95, 0.03], [D, 0]]),
          pz: K([[0, 0], [0.35, -0.01], [D, 0]]),
          ry: K([[0, 0], [0.35, 0.65], [1.4, 0.75], [2.2, 0.5], [3.0, 0.6], [D, 0]]),
          rz: K([[0, 0], [0.35, 0.65], [0.7, 0.45], [1.0, 0.7], [1.4, 0.55], [2.2, 0.75], [3.0, 0.5], [D, 0]]),
          rx: K([[0, 0], [0.35, 0.25], [1.4, 0.3], [2.2, 0.15], [2.3, 0.35], [3.0, 0.1], [D, 0]]),
          // fan: handle B spins twice around its pin, then rollover of blade + B around pin A
          b: K([[0, 0], [0.35, 0], [0.95, -TAU, "l"], [1.45, -2 * TAU, "o"], [2.2, -2 * TAU], [2.45, -2 * TAU - PI, "o"], [2.75, -3 * TAU, "o"], [D, -3 * TAU]]),
          a: K([[0, 0], [1.45, 0], [2.05, TAU, "s"], [D, TAU]]),
          // aerial: knife leaves the hand and spins once in the air
          ky: K([[0, 0], [2.2, 0], [2.48, 0.09, "o"], [2.75, 0, "i"], [D, 0]]),
          kz: K([[0, 0], [2.2, 0], [2.48, -0.02, "o"], [2.75, 0, "i"]]),
          krx: K([[0, 0], [2.2, 0], [2.75, -TAU, "l"], [D, -TAU]])
        }
      };
    }

    // ------------------------------------------------------------------ state
    var weapon = "ak";
    var action = null, actT = 0, snap = null, snapT = 1;
    var cur = {}; // last evaluated channel values
    var kickZ = new Spring(520, 0.62), kickR = new Spring(520, 0.55), kickRoll = new Spring(380, 0.5), kickX = new Spring(420, 0.6);
    var hopX = new Spring(170, 0.18), hopZ = new Spring(170, 0.18), hopY = new Spring(300, 0.3);
    var landS = new Spring(140, 0.45), dryS = new Spring(900, 0.6);
    var sm = { sx: 0, sy: 0, crouch: 0, air: 0, speed: 0, rollLag: 0 };
    var puffT = 1, time = 0, recoilHeat = 0;

    function channels() { return weapon === "ak" ? AK_CH : KN_CH; }
    function startAction(a) {
      // snapshot current values for a smooth blend into the new action
      snap = {}; var chs = channels();
      for (var i = 0; i < chs.length; i++) snap[chs[i]] = cur[chs[i]] || 0;
      snapT = 0;
      action = a; actT = 0;
    }
    function cancelAction() { if (action) startAction(null); }
    function evalChannels(dt) {
      var chs = channels(), out = {};
      if (action) {
        actT += dt;
        if (actT >= action.dur) { action = null; }
      }
      for (var i = 0; i < chs.length; i++) {
        var c = chs[i], v = 0;
        if (action && action.ch[c]) v = action.ch[c](actT);
        out[c] = v;
      }
      if (snap && snapT < 1) {
        snapT = Math.min(1, snapT + dt / 0.14);
        var w = EASE.s(snapT);
        for (var j = 0; j < chs.length; j++) {
          var cc = chs[j];
          var sv = snap[cc] || 0;
          if (cc === "a" || cc === "b") { // angles: blend the short way
            var d = out[cc] - sv; d = Math.atan2(Math.sin(d), Math.cos(d)); out[cc] = sv + d * w;
            continue;
          }
          if (cc === "magY" && Math.abs(sv - out[cc]) > 0.2) continue; // mag offscreen: no visible blend
          out[cc] = sv + (out[cc] - sv) * w;
        }
      }
      cur = out;
      return out;
    }

    var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpQ2 = new THREE.Quaternion(), tmpP2 = new THREE.Vector3();
    var magQ = new THREE.Quaternion(), magP = new THREE.Vector3();

    function placeSleeve(sleeve, wristObj, shoulder) {
      // wrist position in swayRoot space
      wristObj.updateWorldMatrix(true, false);
      tmpM.copy(swayRoot.matrixWorld).invert().multiply(wristObj.matrixWorld);
      tmpP.setFromMatrixPosition(tmpM);
      sleeve.position.copy(tmpP);
      _v.copy(shoulder).sub(tmpP).normalize();
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    }

    function updateAK(dt, c) {
      akRoot.position.set(AK_BASE.p.x + c.px, AK_BASE.p.y + c.py, AK_BASE.p.z + c.pz);
      akRoot.rotation.set(AK_BASE.r.x + c.rx, AK_BASE.r.y + c.ry, AK_BASE.r.z + c.rz);
      // recoil springs
      var kz = kickZ.step(dt), kr = kickR.step(dt), kroll = kickRoll.step(dt), kx = kickX.step(dt), dz = dryS.step(dt);
      recoilHeat = Math.max(0, recoilHeat - dt * 2.5);
      akGun.position.set(kx * 0.004, kr * 0.006 + recoilHeat * 0.004, kz * 0.032 + dz * 0.004);
      akGun.rotation.set(kr * 0.07 + recoilHeat * 0.02, kx * 0.02, kroll * 0.05);
      // hopper jiggle
      hopper.rotation.set(hopX.step(dt) * 0.12, 0, hopZ.step(dt) * 0.12);
      hopper.position.y = AK.hopperPos.y + hopY.step(dt) * 0.004;
      // mag
      magMesh.position.set(AK.magPivot.x, AK.magPivot.y + c.magY, AK.magPivot.z + c.magZ);
      magMesh.rotation.set(c.magRX, 0, 0);
      magMesh.visible = c.magY > -0.44;
      // bolt
      boltMesh.position.set(AK.boltPos.x, AK.boltPos.y, AK.boltPos.z + c.bolt * 0.105);
      // left hand: guard pose -> mag pose -> bolt pose
      var p = tmpP.copy(LH_GUARD.p), q = tmpQ.copy(LH_GUARD.q);
      if (c.lhW > 0.001) {
        magQ.copy(magMesh.quaternion);
        magP.copy(LH_MAG_LOCAL.p).applyQuaternion(magQ).add(magMesh.position);
        tmpQ2.copy(magQ).multiply(LH_MAG_LOCAL.q);
        p.lerp(magP, c.lhW); q.slerp(tmpQ2, c.lhW);
      }
      if (c.lbW > 0.001) {
        tmpP2.copy(LH_BOLT.p); tmpP2.z += c.bolt * 0.105;
        p.lerp(tmpP2, c.lbW); q.slerp(LH_BOLT.q, c.lbW);
      }
      lHandAK.position.set(p.x + c.lhX, p.y + c.lhY, p.z + c.lhZ);
      lHandAK.quaternion.copy(q);
      // muzzle puff
      if (puffT < 1) {
        puffT += dt / 0.075;
        puff.visible = puffT < 1;
        var u = Math.min(puffT, 1);
        puffMat.opacity = (1 - u) * (1 - u);
        var sc = 0.05 + u * 0.09;
        puff.scale.set(sc, sc, sc);
        puff.position.z = AK.muzzle.z - 0.03 - u * 0.05;
      }
    }

    function updateKnife(dt, c) {
      knRoot.position.set(KN_BASE.p.x + c.px, KN_BASE.p.y + c.py, KN_BASE.p.z + c.pz);
      knRoot.rotation.set(KN_BASE.r.x + c.rx, KN_BASE.r.y + c.ry, KN_BASE.r.z + c.rz);
      bali.set(c.a, c.b);
      knFree.position.set(c.kx, c.ky, c.kz);
      knFree.rotation.set(c.krx, c.kry, c.krz);
    }

    function update(dt, s) {
      s = s || {};
      dt = Math.min(Math.max(dt || 0, 0), 0.05);
      time = s.t !== undefined ? s.t : time + dt;
      var speed = Math.max(0, Math.min(1, s.speed || 0)), phase = s.phase || 0;
      // smoothed inputs
      var kS = 1 - Math.exp(-dt * 10);
      sm.sx += ((s.swayX || 0) - sm.sx) * kS;
      sm.sy += ((s.swayY || 0) - sm.sy) * kS;
      sm.crouch += ((s.crouch || 0) - sm.crouch) * (1 - Math.exp(-dt * 8));
      sm.air += ((s.airborne ? 1 : 0) - sm.air) * (1 - Math.exp(-dt * 7));
      sm.speed += (speed - sm.speed) * (1 - Math.exp(-dt * 6));
      if (s.landed) { landS.v -= 2.4 + sm.air; }
      var land = landS.step(dt);
      var sp = sm.speed * (1 - sm.air);
      // bob + breathing
      var bobX = Math.sin(phase) * 0.0085 * sp;
      var bobY = -Math.abs(Math.cos(phase)) * 0.009 * sp + 0.0045 * sp;
      var bR = Math.sin(phase) * 0.018 * sp;
      var br = Math.sin(time * 1.7) * 0.0016, br2 = Math.sin(time * 0.9 + 1.3) * 0.0012;
      var swX = Math.max(-1, Math.min(1, sm.sx / 60)), swY = Math.max(-1, Math.min(1, sm.sy / 60));
      swayRoot.position.set(
        bobX + br2 - swX * 0.014 - sm.crouch * 0.006,
        bobY + br + swY * 0.01 - sm.crouch * 0.012 + land * 0.012 + sm.air * 0.008,
        sm.crouch * 0.012 - Math.abs(swX) * 0.004
      );
      swayRoot.rotation.set(
        br * 0.6 - swY * 0.04 + sm.air * 0.06 + land * 0.05,
        -swX * 0.05,
        bR - swX * 0.05 - sm.crouch * 0.04
      );
      var c = evalChannels(dt);
      akRoot.visible = weapon === "ak";
      knRoot.visible = weapon === "knife";
      if (weapon === "ak") updateAK(dt, c); else updateKnife(dt, c);
      // sleeves follow the wrists
      swayRoot.updateMatrixWorld(true);
      if (weapon === "ak") {
        placeSleeve(sleeveR, wristR_AK, SHOULDER_R);
        placeSleeve(sleeveL, wristL_AK, SHOULDER_L);
        sleeveL.visible = true;
      } else {
        placeSleeve(sleeveR, wristR_K, SHOULDER_RK);
        sleeveL.visible = false;
      }
    }

    var api = {
      group: group,
      setWeapon: function (w) {
        weapon = w === "knife" ? "knife" : "ak";
        cur = {}; snap = null; snapT = 1;
        action = null;
        puffT = 1; puff.visible = false;
        startAction(weapon === "ak" ? akDrawAction() : knDrawAction());
        snapT = 1; // no blend on draw
        update(0, {});
      },
      fire: function () {
        if (weapon !== "ak") return;
        if (action && action.name === "inspect") cancelAction();
        kickZ.v += 9 + Math.random() * 2;
        kickR.v += 7 + Math.random() * 3;
        kickRoll.v += (Math.random() - 0.5) * 12;
        kickX.v += (Math.random() - 0.5) * 6;
        hopX.v += 2.5 + Math.random(); hopZ.v += (Math.random() - 0.5) * 5; hopY.v += 3;
        recoilHeat = Math.min(1, recoilHeat + 0.25);
        puffT = 0; puff.visible = true; puffMat.rotation = Math.random() * TAU;
      },
      dryFire: function () {
        if (weapon !== "ak") return;
        if (action && action.name === "inspect") cancelAction();
        dryS.v += 4;
      },
      reload: function (empty) {
        if (weapon !== "ak") return;
        startAction(akReloadAction(!!empty));
      },
      slash: function (alt) {
        if (weapon !== "knife") return;
        startAction(knSlashAction(alt ? 1 : 0));
      },
      stab: function () {
        if (weapon !== "knife") return;
        startAction(knStabAction());
      },
      inspect: function () {
        if (action && action.name !== "inspect") return; // don't interrupt draw/reload/attacks
        if (action && action.name === "inspect" && actT < action.dur * 0.5) return;
        startAction(weapon === "ak" ? akInspectAction() : knInspectAction());
      },
      update: update,
      muzzle: function (target) {
        target = target || new THREE.Vector3();
        group.updateMatrixWorld(true);
        // muzzle position expressed in the group's parent space (= camera space)
        tmpM.copy(group.matrixWorld).invert().multiply(muzzleNode.matrixWorld);
        target.setFromMatrixPosition(tmpM).applyMatrix4(group.matrix);
        return target;
      },
      _tune: { AK_BASE: AK_BASE, KN_BASE: KN_BASE, SHOULDER_R: SHOULDER_R, SHOULDER_RK: SHOULDER_RK, SHOULDER_L: SHOULDER_L, LH_GUARD: LH_GUARD, LH_MAG_LOCAL: LH_MAG_LOCAL, LH_BOLT: LH_BOLT, kHand: kHand, bali: bali, rHandAK: rHandAK, lHandAK: lHandAK },
      current: function () { return { weapon: weapon, action: action ? action.name : null, t: actT }; },
      dispose: function () {
        group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
        for (var i = 0; i < disposables.length; i++) disposables[i].dispose();
        if (group.parent) group.parent.remove(group);
      }
    };
    api.setWeapon("ak");
    action = null; // start idle; the lead calls setWeapon() to play the draw
    update(0, {});
    return api;
  }

  root.PBModels = {
    createViewmodel: createViewmodel,
    createWorldGun: createWorldGun,
    createWorldKnife: createWorldKnife,
    splatTextures: splatTextures,
    paintBallMaterial: paintBallMaterial
  };
})(typeof window !== "undefined" ? window : this);
