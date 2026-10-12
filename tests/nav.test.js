// Run with: node tests/nav.test.js
// Checks that Miis' route-finding goes around obstacles and never through water.
const assert = require("assert");
const { MiiNav } = require("../js/nav.js");

const bounds = { minX: -10, maxX: 10, minZ: -8, maxZ: 8 };
const pond = { x: 0, z: 0, rx: 4, rz: 2.5 };
const island = { x: 0, z: 0, rx: 9.5, rz: 7.5, outside: true };
const desk = { x: 5, z: 4, w: 3, d: 1.4, rot: 0.4 };
const nav = new MiiNav.Nav(bounds, [pond, island, desk]);

// Water and the sea are blocked, open grass isn't.
assert.ok(nav.isBlocked(0, 0), "middle of the pond should be blocked");
assert.ok(nav.isBlocked(9.9, 7.9), "the sea should be blocked");
assert.ok(!nav.isBlocked(-6, 0), "grass next to the pond should be open");

// A route from one side of the pond to the other must go around it.
const path = nav.findPath(-6, 0, 6, 0);
assert.ok(path && path.length >= 2, "should find a way around the pond");
let prev = { x: -6, z: 0 };
for (const p of path) {
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const x = prev.x + (p.x - prev.x) * (i / steps), z = prev.z + (p.z - prev.z) * (i / steps);
    assert.ok(!MiiNav.insideShape(pond, x, z, 0), "route goes through the pond at " + x.toFixed(2) + "," + z.toFixed(2));
    assert.ok(!MiiNav.insideShape(desk, x, z, 0), "route goes through the desk");
  }
  prev = p;
}
const last = path[path.length - 1];
assert.ok(Math.hypot(last.x - 6, last.z) < 0.5, "route should end where we asked");

// Asking to go into the water sends you to the nearest dry spot instead.
const wet = nav.findPath(-6, 0, 0, 0);
const end = wet[wet.length - 1];
assert.ok(!nav.isBlocked(end.x, end.z), "target in the pond should move to dry land");

console.log("All route-finding tests passed. Path around the pond:", path.map((p) => p.x.toFixed(1) + "," + p.z.toFixed(1)).join(" -> "));
