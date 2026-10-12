/*
 * miiModel.js
 * Loads a full-body Mii .glb (as exported by Mii Creator), makes copies of it,
 * recolours it, and moves its bones so it can walk, wave, dance and so on.
 *
 * The .glb has a skeleton (bones) but no built-in animations, so all the
 * movement is done here in code by rotating bones a little every frame.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------
  // Reading the Mii's info (name, favourite colour...) from the .glb file.
  // This part doesn't need Three.js, so it also runs in Node for tests.
  // ---------------------------------------------------------------------
  const FAVORITE_COLORS = [
    { name: "red", hex: "#d21e14" },
    { name: "orange", hex: "#ff6e19" },
    { name: "yellow", hex: "#ffd820" },
    { name: "light green", hex: "#78d220" },
    { name: "green", hex: "#007830" },
    { name: "blue", hex: "#0a48b4" },
    { name: "light blue", hex: "#3caade" },
    { name: "pink", hex: "#f55a7d" },
    { name: "purple", hex: "#7328ad" },
    { name: "brown", hex: "#483818" },
    { name: "white", hex: "#e0e0e0" },
    { name: "black", hex: "#181814" },
  ];

  // A .glb file is: a 12-byte header, then a JSON chunk, then a binary chunk.
  function readGlbJson(bytes) {
    if (bytes.length < 20) throw new Error("file is too small");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== "glTF") throw new Error("not a .glb file");
    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== 0x4e4f534a) throw new Error("the .glb is missing its JSON part");
    const jsonBytes = bytes.subarray(20, 20 + jsonLength);
    return JSON.parse(new TextDecoder().decode(jsonBytes));
  }

  function readInfo(bytes, fileName) {
    const json = readGlbJson(bytes);
    const extras = (json.asset && json.asset.extras) || {};
    const add = extras.additionalInfo || {};
    const hasSkeleton = Array.isArray(json.skins) && json.skins.length > 0;
    let name = typeof add.name === "string" && add.name.trim() ? add.name.trim() : null;
    if (!name && fileName) name = fileName.replace(/\.glb$/i, "").replace(/[_-].*$/, "") || "Mii";
    const fav = Number.isInteger(add.favoriteColor) && add.favoriteColor >= 0 && add.favoriteColor < 12 ? add.favoriteColor : 0;
    return {
      name: name || "Mii",
      creator: add.creator || "",
      gender: add.gender === 1 ? 1 : 0,
      favoriteColor: fav,
      favoriteColorName: FAVORITE_COLORS[fav].name,
      height: typeof add.height === "number" ? add.height : 64,
      build: typeof add.build === "number" ? add.build : 64,
      hasSkeleton,
      generator: (json.asset && json.asset.generator) || "",
      fromMiiCreator: !!extras.miiData,
    };
  }

  const api = { readGlbJson, readInfo, FAVORITE_COLORS };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  // ---------------------------------------------------------------------
  // Everything below needs Three.js (browser only).
  // ---------------------------------------------------------------------
  const THREE = root.THREE;
  // Treat colours like "#ff0000" as normal screen colours (so they don't look washed out).
  THREE.ColorManagement.legacyMode = false;

  // Colours used in Mii Creator's textures, so we can swap them for others.
  const SOURCE = {
    skin: [0xff, 0xd3, 0xad],
    hair: [0x40, 0x20, 0x10],
    shirt: [0x19, 0x1f, 0x40],
    pants: [0x40, 0x46, 0x4e],
    eyes: [0x0a, 0x4a, 0x35],
  };

  function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  }

  function srgbColor(hex) {
    return new THREE.Color(hex); // converted to the renderer's colour space automatically
  }

  // Loads a .glb from its bytes. Returns a "template" we can make copies of.
  function loadTemplate(arrayBuffer, fileName) {
    const bytes = new Uint8Array(arrayBuffer);
    const info = readInfo(bytes, fileName);
    return new Promise((resolve, reject) => {
      new THREE.GLTFLoader().parse(arrayBuffer, "", (gltf) => {
        const scene = gltf.scene;
        // Measure the model so every Mii stands on the ground at the same size.
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const height = box.max.y - box.min.y;
        if (!isFinite(height) || height <= 0) { reject(new Error("the model is empty")); return; }
        resolve({ scene, info, height, groundY: box.min.y, source: detectSourceColors(scene) });
      }, (err) => reject(new Error("couldn't read the 3D model (" + (err && err.message || err) + ")")));
    });
  }

  // Every Mii has different colours, so find this model's own skin, hair and
  // clothes colours first. Those are the colours we replace when recolouring.
  function dominantColor(tex) {
    if (!tex || !tex.image) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const ctx = c.getContext("2d");
    ctx.drawImage(tex.image, 0, 0, 48, 48);
    const px = ctx.getImageData(0, 0, 48, 48).data;
    const counts = new Map();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;
      const key = (px[i] >> 3) + "," + (px[i + 1] >> 3) + "," + (px[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = null, bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    if (!best) return null;
    // look up the exact colour of one pixel in the winning bucket
    for (let i = 0; i < px.length; i += 4) {
      if ((px[i] >> 3) + "," + (px[i + 1] >> 3) + "," + (px[i + 2] >> 3) === best) return [px[i], px[i + 1], px[i + 2]];
    }
    return null;
  }

  function colorToRgb255(color) {
    const c = color.clone().convertLinearToSRGB();
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  }

  function near(a, b, tol) {
    return a && b && (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < tol;
  }

  function detectSourceColors(scene) {
    const src = Object.assign({}, SOURCE);
    const shirtVotes = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      const mname = (m.name || "").toLowerCase();
      if (mname === "nose") src.skin = colorToRgb255(m.color);
      if (mname === "hair") src.hair = colorToRgb255(m.color);
      if (/^clothes/i.test(o.name) && m.map) {
        const dom = dominantColor(m.map);
        if (/pants|bottom|skirt/i.test(o.name)) src.pants = dom || src.pants;
        else if (dom) shirtVotes.push(dom);
      }
    });
    const tops = shirtVotes.filter((c) => !near(c, src.skin, 2400));
    if (tops.length) src.shirt = tops[0];
    return src;
  }

  // ---- recolouring textures ----
  function recolorTexture(tex, swaps) {
    if (!tex || !tex.image || !swaps.length) return tex;
    const img = tex.image;
    const w = img.width, h = img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    let changed = false;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      for (const s of swaps) {
        if (s.skip) continue;
        const dr = px[i] - s.from[0], dg = px[i + 1] - s.from[1], db = px[i + 2] - s.from[2];
        if (dr * dr + dg * dg + db * db < s.tol) {
          // keep any shading by scaling the new colour the same way
          const k = (px[i] + px[i + 1] + px[i + 2] + 1) / (s.from[0] + s.from[1] + s.from[2] + 1);
          px[i] = Math.min(255, s.to[0] * k);
          px[i + 1] = Math.min(255, s.to[1] * k);
          px[i + 2] = Math.min(255, s.to[2] * k);
          changed = true;
          break;
        }
      }
    }
    if (!changed) return tex;
    ctx.putImageData(data, 0, 0);
    // Note: texture.clone() shares the picture with the original, so give the
    // copy its own picture (otherwise every Mii would change colour together).
    const out = tex.clone();
    out.source = new THREE.Source(canvas);
    out.needsUpdate = true;
    return out;
  }

  // Applies a look ({ skin, hair, shirt, pants, eyes, beard }) to a Mii copy.
  // Materials are always copied, so each Mii can be changed without affecting the others.
  function applyLook(object, look, source) {
    look = look || {};
    const src = source || SOURCE;
    const tol = 2400;
    // Each swap: replace colour `from` with `to`. `faceOnly` swaps only touch the
    // face texture (so removing a beard doesn't also remove the eyebrows).
    const swaps = [];
    if (look.skin) swaps.push({ from: src.skin, to: hexToRgb(look.skin), tol });
    if (look.beard === false) swaps.push({ from: src.hair, to: hexToRgb(look.skin || rgbToHex(src.skin)), tol, faceOnly: true });
    if (look.hair) swaps.push({ from: src.hair, to: hexToRgb(look.hair), tol });
    if (look.shirt) {
      const dark = src.shirt.map((v) => v * 0.5);
      swaps.push({ from: src.shirt, to: hexToRgb(look.shirt), tol });
      swaps.push({ from: dark, to: hexToRgb(look.shirt).map((v) => v * 0.55), tol: 600 });
    }
    if (look.pants) swaps.push({ from: src.pants, to: hexToRgb(look.pants), tol });
    if (look.eyes) swaps.push({ from: src.eyes, to: hexToRgb(look.eyes), tol: 3000 });

    const cache = new Map();
    object.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const newMats = mats.map((m) => {
        if (cache.has(m)) return cache.get(m);
        const c = m.clone();
        const name = (m.name || "").toLowerCase();
        const isFace = name === "faceline";
        // a beard-removal swap must come first on the face, and be skipped elsewhere
        const list = swaps.map((s) => Object.assign({}, s, { skip: s.faceOnly && !isFace }))
          .sort((a, b) => (b.faceOnly ? 1 : 0) - (a.faceOnly ? 1 : 0));
        if (c.map) c.map = recolorTexture(c.map, list);
        if (name === "hair" && look.hair) c.color = srgbColor(look.hair);
        if (name === "nose" && look.skin) c.color = srgbColor(look.skin);
        cache.set(m, c);
        return c;
      });
      o.material = Array.isArray(o.material) ? newMats : newMats[0];
    });
  }

  // ---- making a copy that can move on its own ----
  const BONES = ["Spine_1", "Spine_2", "Head", "Arm_1_L", "Arm_2_L", "Arm_1_R", "Arm_2_R",
    "Leg_1_L", "Leg_2_L", "Leg_1_R", "Leg_2_R", "Waist"];

  function createInstance(template, look) {
    const object = THREE.SkeletonUtils.clone(template.scene);
    applyLook(object, look, template.source);
    object.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned meshes can be culled wrongly when animated
      }
    });

    // Put the feet on the ground and make the Mii about 1.8 units tall.
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    const s = 1.8 / template.height;
    inner.scale.setScalar(s);
    inner.position.y = -template.groundY * s;
    inner.add(object);
    holder.add(inner);

    // Remember each bone's resting rotation, plus which way its parent faces,
    // so we can rotate bones using simple directions (forward, sideways, up).
    object.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    object.getWorldQuaternion(rootInv).invert();
    const bones = {};
    object.traverse((o) => {
      if (BONES.includes(o.name) && !bones[o.name]) {
        const parentQ = new THREE.Quaternion();
        if (o.parent) o.parent.getWorldQuaternion(parentQ);
        parentQ.premultiply(rootInv);
        bones[o.name] = { bone: o, rest: o.quaternion.clone(), parentQ, parentQInv: parentQ.clone().invert() };
      }
    });

    return { holder, inner, object, rig: new Rig(bones) };
  }

  // ---- posing ----
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();

  class Rig {
    constructor(bones) {
      this.bones = bones;
    }

    // Rotates a bone by (x, y, z) radians measured in the Mii's own space:
    // x = tip forward/back, y = turn left/right, z = tilt sideways.
    set(name, x, y, z) {
      const b = this.bones[name];
      if (!b) return;
      tmpE.set(x || 0, y || 0, z || 0, "XYZ");
      tmpQ.setFromEuler(tmpE);
      // local = parent⁻¹ · R · parent · rest
      b.bone.quaternion.copy(b.parentQInv).multiply(tmpQ).multiply(b.parentQ).multiply(b.rest);
    }

    /*
     * p = {
     *   t, walk (0..1 how much walking), phase (walk cycle),
     *   arms: "down" | "wave" | "up" | "cheer" | "out" | "type" | "held",
     *   lookYaw, nod, dance, sit
     * }
     */
    pose(p) {
      const t = p.t || 0;
      const w = p.walk || 0;
      const ph = p.phase || 0;
      const swing = Math.sin(ph) * 0.6 * w;

      // legs: forward swing is a negative X rotation
      let legL = -swing, legR = swing;
      let kneeL = Math.max(0, Math.sin(ph + Math.PI)) * 0.7 * w;
      let kneeR = Math.max(0, Math.sin(ph)) * 0.7 * w;
      if (p.held) {
        legL = Math.sin(t * 9) * 0.35; legR = -legL;
        kneeL = kneeR = 0.2;
      }
      if (p.sit) {
        legL = legR = -1.45;
        kneeL = kneeR = 1.45;
      }
      this.set("Leg_1_L", legL, 0, 0);
      this.set("Leg_1_R", legR, 0, 0);
      this.set("Leg_2_L", kneeL, 0, 0);
      this.set("Leg_2_R", kneeR, 0, 0);

      // arms: left arm raises outward with +Z, right arm with -Z
      let aL = { x: swing * 0.9, z: 0.05 }, aR = { x: -swing * 0.9, z: -0.05 };
      let elbowL = 0, elbowR = 0;
      switch (p.arms) {
        case "wave":
          aR = { x: 0, z: -2.6 + Math.sin(t * 12) * 0.35 };
          elbowR = 0;
          break;
        case "up":
          aL = { x: 0, z: 2.9 }; aR = { x: 0, z: -2.9 };
          break;
        case "cheer":
          aL = { x: 0, z: 2.5 + Math.sin(t * 10) * 0.3 };
          aR = { x: 0, z: -2.5 - Math.sin(t * 10 + 1) * 0.3 };
          break;
        case "out":
          aL = { x: Math.sin(t * 8) * 0.4, z: 1.2 + Math.sin(t * 8) * 0.4 };
          aR = { x: -Math.sin(t * 8) * 0.4, z: -1.2 - Math.sin(t * 8 + 2) * 0.4 };
          break;
        case "type":
          aL = { x: -0.9, z: 0.15 }; aR = { x: -0.9, z: -0.15 };
          elbowL = elbowR = -0.6 + Math.sin(t * 18) * 0.12;
          break;
        case "held":
          aL = { x: Math.sin(t * 8) * 0.3, z: 1.0 + Math.sin(t * 8) * 0.3 };
          aR = { x: -Math.sin(t * 8) * 0.3, z: -1.0 - Math.sin(t * 8 + 1) * 0.3 };
          break;
      }
      this.set("Arm_1_L", aL.x, 0, aL.z);
      this.set("Arm_1_R", aR.x, 0, aR.z);
      this.set("Arm_2_L", elbowL, 0, 0);
      this.set("Arm_2_R", elbowR, 0, 0);

      // body: a little bounce from side to side when walking or dancing
      const sway = p.dance ? Math.sin(t * 8) * 0.18 : Math.sin(ph) * 0.05 * w;
      this.set("Spine_1", w * 0.05, 0, sway);
      // head: look around, nod, laugh
      const laugh = p.laugh ? Math.sin(t * 18) * 0.08 : 0;
      this.set("Head", (p.nod || 0) + laugh - (p.lookUp || 0), p.lookYaw || 0, p.dance ? -sway * 0.8 : Math.sin(t * 0.7) * 0.03);
    }
  }

  // ---- small portrait pictures for the side panel ----
  let portraitRenderer = null;
  function portrait(template, look, size) {
    size = size || 96;
    try {
      if (!portraitRenderer) {
        portraitRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        portraitRenderer.outputEncoding = THREE.sRGBEncoding;
      }
      portraitRenderer.setSize(size, size, false);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 0.7);
      sun.position.set(1, 2, 3);
      scene.add(sun);
      const inst = createInstance(template, look);
      scene.add(inst.holder);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(0, 1.35, 2.3);
      cam.lookAt(0, 1.28, 0);
      portraitRenderer.render(scene, cam);
      const url = portraitRenderer.domElement.toDataURL("image/png");
      disposeObject(inst.holder);
      return url;
    } catch (e) {
      console.warn("portrait failed", e);
      return "";
    }
  }

  function disposeObject(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && m.map.image instanceof HTMLCanvasElement) m.map.dispose();
        m.dispose();
      }
    });
  }

  root.MiiModel = Object.assign(api, { loadTemplate, createInstance, applyLook, portrait, disposeObject, srgbColor, rgbToHex });
})(typeof self !== "undefined" ? self : this);
