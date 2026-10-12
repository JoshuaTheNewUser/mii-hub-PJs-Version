// Run with: node tests/glb.test.js
// Checks that the Mii's info is read correctly from a Mii Creator .glb file.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const M = require("../js/miiModel.js");

const joeBytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "samples", "Joe.glb")));
const joe = M.readInfo(joeBytes, "Joe_all_body.glb");
assert.strictEqual(joe.name, "Joe");
assert.strictEqual(joe.favoriteColor, 8);
assert.strictEqual(joe.favoriteColorName, "purple");
assert.strictEqual(joe.height, 107);
assert.strictEqual(joe.hasSkeleton, true);
assert.strictEqual(joe.fromMiiCreator, true);

// The embedded copy used by the web page must match the sample file.
const embedded = fs.readFileSync(path.join(__dirname, "..", "js", "sampleGlb.js"), "utf8").match(/base64: "([^"]+)"/)[1];
assert.ok(Buffer.from(embedded, "base64").equals(Buffer.from(joeBytes)), "js/sampleGlb.js is out of date");

// A .glb without Mii info falls back to the file name.
const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" } }).padEnd(32, " "));
const header = Buffer.alloc(20);
header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const plain = M.readInfo(new Uint8Array(Buffer.concat([header, json])), "Bob_body.glb");
assert.strictEqual(plain.name, "Bob");
assert.strictEqual(plain.hasSkeleton, false);

// Old .miic files and other junk are rejected.
assert.throws(() => M.readInfo(new Uint8Array(140), "Joe.miic"), /not a \.glb/);

console.log("All .glb tests passed:", joe.name, "-", joe.generator);
