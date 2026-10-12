// Run with: node tests/parser.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const P = require("../js/miiParser.js");

// 1. The sample .miic file: the name must be read correctly.
const joe = P.parse(fs.readFileSync(path.join(__dirname, "..", "samples", "Joe.miic")));
assert.strictEqual(joe.name, "Joe");
assert.strictEqual(joe.approximate, true);
assert.ok(/^#[0-9a-f]{6}$/.test(joe.skin));
// Same file -> same look every time.
assert.deepStrictEqual(P.parse(fs.readFileSync(path.join(__dirname, "..", "samples", "Joe.miic"))), joe);

// 2. A hand-built Wii Mii (74 bytes, big-endian).
const wii = new Uint8Array(74);
wii[0] = 0b01000000; // female
wii[1] = 0b00001010; // favourite colour 5 (blue)
"Ann".split("").forEach((c, i) => { wii[2 + i * 2 + 1] = c.charCodeAt(0); });
wii[0x16] = 100; // height
wii[0x17] = 20;  // build
wii[0x20] = 0b00001000; // skin colour 2 (bits 12-10 of the u16)
const w = P.parse(wii);
assert.strictEqual(w.name, "Ann");
assert.strictEqual(w.gender, 1);
assert.strictEqual(w.favoriteColor, 5);
assert.strictEqual(w.height, 100);
assert.strictEqual(w.skin, P.SKIN_COLORS[2]);
assert.strictEqual(w.format, "Wii Mii");

// 3. A hand-built 3DS/Wii U FFSD Mii (96 bytes, little-endian bits).
const ffsd = new Uint8Array(96);
ffsd[0] = 3;
ffsd[0x18] = 1 | (3 << 1); // male=0? -> gender bit 1 (female), birth month 3
ffsd[0x19] = (7 << 2);     // favourite colour 7 (pink)
"Bo".split("").forEach((c, i) => { ffsd[0x1a + i * 2] = c.charCodeAt(0); });
ffsd[0x2e] = 30;
ffsd[0x32] = 12;           // hair type 12 -> style 2
ffsd[0x33] = 6;            // hair colour 6
ffsd[0x44] = 1;            // glasses type 1
const f = P.parse(ffsd);
assert.strictEqual(f.name, "Bo");
assert.strictEqual(f.gender, 1);
assert.strictEqual(f.favoriteColor, 7);
assert.strictEqual(f.height, 30);
assert.strictEqual(f.hairStyle, 2);
assert.strictEqual(f.hairColor, P.HAIR_COLORS[6]);
assert.strictEqual(f.glasses, 1);
assert.strictEqual(f.format, "3DS / Wii U Mii");

// 4. Junk is rejected.
assert.throws(() => P.parse(new Uint8Array(5)));

console.log("All parser tests passed. Joe:", joe.format, joe.name);
