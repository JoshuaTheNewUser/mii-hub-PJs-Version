/*
 * miiParser.js
 * Turns the bytes of a Mii file into a simple "look" object the hub can draw.
 *
 * Supported:
 *  - Wii Mii (.mii / .rcd)                      74 bytes, big-endian
 *  - 3DS / Wii U Mii (.ffsd / .cfsd / .3dsmii)  92-96 bytes, little-endian
 *  - Older Mii Creator files (.miic v1-v3)      104-108 bytes (FFSD + extras)
 *  - Anything else (e.g. newer .miic layouts):  the name is read from the
 *    file, and the look is generated from the file's bytes so it is always
 *    the same for the same file. These are marked `approximate: true`.
 */
(function (root) {
  "use strict";

  // ---------- Colour palettes (taken from the official Mii colour tables) ----------
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
  const SKIN_COLORS = ["#ffd3ad", "#ffb669", "#de7942", "#ffaa8c", "#ad5129", "#632c18"];
  const HAIR_COLORS = ["#1e1a18", "#402011", "#5c1812", "#7c3a14", "#787878", "#4e3e10", "#84581c", "#d0a04a"];
  const EYE_COLORS = ["#000000", "#787878", "#663c2c", "#605e30", "#4870a0", "#387058"];
  const MOUTH_COLORS = ["#d65a3c", "#ff2828", "#ff8c8c", "#a04030", "#000000"];
  const GLASSES_COLORS = ["#000000", "#603a00", "#a01818", "#1838a0", "#a87c00", "#707070"];

  const HAIR_STYLE_COUNT = 10; // how many hair shapes the renderer knows
  const EYE_STYLE_COUNT = 4;

  // ---------- Small helpers ----------
  function pick(arr, i) {
    return arr[((i % arr.length) + arr.length) % arr.length];
  }

  // Reads bits in little-endian order (3DS / Wii U / Switch files).
  function LEBitReader(bytes, byteOffset) {
    let bit = byteOffset * 8;
    return {
      read(n) {
        let v = 0;
        for (let i = 0; i < n; i++, bit++) {
          v |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i;
        }
        return v >>> 0;
      },
      skip(n) { bit += n; },
      align() { bit = Math.ceil(bit / 8) * 8; },
      seek(byte) { bit = byte * 8; },
    };
  }

  // Reads bits in big-endian order (Wii files).
  function BEBitReader(bytes, byteOffset) {
    let bit = byteOffset * 8;
    return {
      read(n) {
        let v = 0;
        for (let i = 0; i < n; i++, bit++) {
          v = (v << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
        }
        return v >>> 0;
      },
      seek(byte) { bit = byte * 8; },
    };
  }

  function utf16(bytes, offset, length, littleEndian) {
    let s = "";
    for (let i = 0; i + 1 < length; i += 2) {
      const code = littleEndian
        ? bytes[offset + i] | (bytes[offset + i + 1] << 8)
        : (bytes[offset + i] << 8) | bytes[offset + i + 1];
      if (code === 0) break;
      s += String.fromCharCode(code);
    }
    return s.trim();
  }

  // Simple 32-bit hash so the same file always produces the same "random" look.
  function hashBytes(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function seededRandom(seed) {
    let s = seed || 1;
    return function () {
      s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 7), 61 | s) ^ s;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Finds the first readable UTF-16LE name in an unknown file.
  function isLatin(code) {
    return (code >= 0x20 && code <= 0x7e) || (code >= 0xc0 && code <= 0x24f);
  }
  function isAsian(code) {
    return (code >= 0x3040 && code <= 0x30ff) || // Japanese kana
      (code >= 0x4e00 && code <= 0x9fff) ||      // Chinese / Japanese kanji
      (code >= 0xac00 && code <= 0xd7a3);        // Korean
  }

  function findUtf16Name(bytes) {
    // First look for a normal Latin name, then for Japanese/Chinese/Korean ones.
    // Single stray characters are usually random ID bytes, so names need 2+ characters
    // on the first passes.
    const passes = [
      { allowed: isLatin, minLen: 2 },
      { allowed: (c) => isLatin(c) || isAsian(c), minLen: 2 },
      { allowed: (c) => isLatin(c) || isAsian(c), minLen: 1 },
    ];
    for (const { allowed, minLen } of passes) {
      for (let start = 0; start + 4 < bytes.length; start += 2) {
        let s = "";
        for (let i = start; i + 1 < bytes.length && s.length < 10; i += 2) {
          const code = bytes[i] | (bytes[i + 1] << 8);
          if (!allowed(code)) break;
          s += String.fromCharCode(code);
        }
        const end = start + s.length * 2;
        const next = end + 1 < bytes.length ? bytes[end] | (bytes[end + 1] << 8) : 0;
        // A real name is followed by a 0x0000 terminator and has a letter or number in it.
        if (s.trim().length >= minLen && next === 0 && /[A-Za-z0-9À-￯]/.test(s)) {
          return s.trim();
        }
      }
    }
    return null;
  }

  // Turns the many official hair styles into the shapes our renderer can draw.
  function hairStyleFromType(type, maxType) {
    if (maxType && type >= maxType) type = type % maxType;
    return type % HAIR_STYLE_COUNT;
  }

  function baseLook() {
    return {
      name: "Mii",
      creator: "",
      gender: 0,
      favoriteColor: 0,
      height: 64,
      build: 64,
      skin: SKIN_COLORS[0],
      hairStyle: 0,
      hairColor: HAIR_COLORS[0],
      hairFlip: false,
      eyeStyle: 0,
      eyeColor: EYE_COLORS[0],
      browColor: HAIR_COLORS[0],
      browStyle: 0,
      mouthColor: MOUTH_COLORS[0],
      glasses: 0, // 0 none, 1 glasses, 2 sunglasses
      glassesColor: GLASSES_COLORS[0],
      beard: false,
      mustache: false,
      facialHairColor: HAIR_COLORS[0],
      mole: false,
      format: "unknown",
      approximate: false,
    };
  }

  // ---------- Wii (74 bytes, big-endian) ----------
  function parseWii(bytes) {
    const look = baseLook();
    const r = BEBitReader(bytes, 0);
    r.read(1); // invalid flag
    look.gender = r.read(1);
    r.read(4); // birth month
    r.read(5); // birth day
    look.favoriteColor = Math.min(r.read(4), 11);
    look.name = utf16(bytes, 0x02, 20, false) || "Mii";
    look.height = bytes[0x16];
    look.build = bytes[0x17];

    r.seek(0x20);
    r.read(3); // face shape
    look.skin = pick(SKIN_COLORS, r.read(3));

    r.seek(0x22);
    const hairType = r.read(7);
    look.hairColor = pick(HAIR_COLORS, r.read(3));
    look.hairFlip = r.read(1) === 1;
    look.hairStyle = hairStyleFromType(hairType);

    r.seek(0x24);
    const browType = r.read(5);
    r.read(1); r.read(4); r.read(6);
    look.browColor = pick(HAIR_COLORS, r.read(3));
    look.browStyle = browType % 3;

    r.seek(0x28);
    const eyeType = r.read(6);
    r.read(2); r.read(3); r.read(5);
    look.eyeColor = pick(EYE_COLORS, r.read(3));
    look.eyeStyle = eyeType % EYE_STYLE_COUNT;

    r.seek(0x2e);
    r.read(5);
    look.mouthColor = pick(MOUTH_COLORS, r.read(2));

    r.seek(0x30);
    const glassesType = r.read(4);
    look.glassesColor = pick(GLASSES_COLORS, r.read(3));
    look.glasses = glassesType === 0 ? 0 : glassesType >= 6 ? 2 : 1;

    r.seek(0x32);
    look.mustache = r.read(2) > 0;
    look.beard = r.read(2) > 0;
    look.facialHairColor = pick(HAIR_COLORS, r.read(3));

    r.seek(0x34);
    look.mole = r.read(1) === 1;

    look.creator = utf16(bytes, 0x36, 20, false);
    look.format = "Wii Mii";
    return look;
  }

  // ---------- 3DS / Wii U (FFSD/CFSD), plus older Mii Creator extras ----------
  function parseFFSD(bytes) {
    const look = baseLook();
    const r = LEBitReader(bytes, 0x18);
    look.gender = r.read(1);
    r.read(4); // birth month
    r.read(5); // birth day
    look.favoriteColor = Math.min(r.read(4), 11);
    look.name = utf16(bytes, 0x1a, 20, true) || "Mii";
    look.height = bytes[0x2e];
    look.build = bytes[0x2f];

    r.seek(0x30);
    r.read(1); // sharing flag
    r.read(4); // face type
    look.skin = pick(SKIN_COLORS, r.read(3));

    look.hairStyle = hairStyleFromType(bytes[0x32]);
    r.seek(0x33);
    look.hairColor = pick(HAIR_COLORS, r.read(3));
    look.hairFlip = r.read(1) === 1;

    r.seek(0x34);
    const eyeType = r.read(6);
    look.eyeColor = pick(EYE_COLORS, r.read(3));
    look.eyeStyle = eyeType % EYE_STYLE_COUNT;

    r.seek(0x38);
    const browType = r.read(5);
    look.browColor = pick(HAIR_COLORS, r.read(3));
    look.browStyle = browType % 3;

    r.seek(0x3e);
    r.read(6);
    look.mouthColor = pick(MOUTH_COLORS, r.read(3));
    r.seek(0x40);
    r.read(5);
    look.mustache = r.read(3) > 0;

    r.seek(0x42);
    look.beard = r.read(3) > 0;
    look.facialHairColor = pick(HAIR_COLORS, r.read(3));

    r.seek(0x44);
    const glassesType = r.read(4);
    look.glassesColor = pick(GLASSES_COLORS, r.read(3));
    look.glasses = glassesType === 0 ? 0 : glassesType >= 6 ? 2 : 1;

    r.seek(0x46);
    look.mole = r.read(1) === 1;

    if (bytes.length >= 0x48 + 20) look.creator = utf16(bytes, 0x48, 20, true);
    look.format = bytes.length > 0x60 ? "Mii Creator (.miic, classic)" : "3DS / Wii U Mii";
    return look;
  }

  // ---------- Unknown layouts (newer .miic etc.) ----------
  function parseUnknown(bytes) {
    const look = baseLook();
    const rand = seededRandom(hashBytes(bytes));
    const r = (n) => Math.floor(rand() * n);

    look.name = findUtf16Name(bytes) || "Mii";
    look.gender = r(2);
    look.favoriteColor = r(FAVORITE_COLORS.length);
    look.height = 40 + r(60);
    look.build = 40 + r(60);
    look.skin = pick(SKIN_COLORS, r(SKIN_COLORS.length));
    look.hairStyle = r(HAIR_STYLE_COUNT);
    look.hairColor = pick(HAIR_COLORS, r(HAIR_COLORS.length));
    look.hairFlip = r(2) === 1;
    look.eyeStyle = r(EYE_STYLE_COUNT);
    look.eyeColor = pick(EYE_COLORS, r(EYE_COLORS.length));
    look.browColor = look.hairColor;
    look.browStyle = r(3);
    look.mouthColor = MOUTH_COLORS[0];
    look.glasses = r(5) === 0 ? 1 : 0;
    look.glassesColor = pick(GLASSES_COLORS, r(GLASSES_COLORS.length));
    look.facialHairColor = look.hairColor;
    look.format = bytes.length === 140 ? "Mii Creator (.miic, new)" : "Unknown Mii format";
    look.approximate = true;
    return look;
  }

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data && data.buffer instanceof ArrayBuffer) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new Error("Mii data must be bytes");
  }

  function parse(data) {
    const bytes = toBytes(data);
    if (bytes.length < 20) throw new Error("This file is too small to be a Mii.");

    let look;
    if (bytes.length === 74) look = parseWii(bytes);
    else if (bytes.length >= 92 && bytes.length <= 108 && bytes[0] <= 3) look = parseFFSD(bytes);
    else look = parseUnknown(bytes);

    look.shirt = FAVORITE_COLORS[look.favoriteColor].hex;
    look.favoriteColorName = FAVORITE_COLORS[look.favoriteColor].name;
    return look;
  }

  const api = {
    parse,
    hashBytes,
    seededRandom,
    FAVORITE_COLORS,
    SKIN_COLORS,
    HAIR_COLORS,
    EYE_COLORS,
    MOUTH_COLORS,
    GLASSES_COLORS,
    HAIR_STYLE_COUNT,
    EYE_STYLE_COUNT,
    baseLook,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MiiParser = api;
})(typeof self !== "undefined" ? self : this);
