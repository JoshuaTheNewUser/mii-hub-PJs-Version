// Tests for the Paintball rules (movement, weapons, hit boxes). Run: node tests/paintball.test.js
const assert = require("assert");
require("../js/paintball/pb-engine.js");
const E = globalThis.PBEngine;
const T = 1 / 128;

const map = {
  boxes: [
    { x: 0, z: -5, hw: 2, hd: 0.5, rot: 0, y0: 0, y1: 2.6, mat: "metal" },   // a wall ahead
    { x: 4, z: 0, hw: 0.5, hd: 0.5, rot: 0, y0: 0, y1: 0.4, mat: "wood" },    // a step
    { x: -4, z: 0, hw: 0.7, hd: 1.5, rot: 0, y0: 0, y1: 1.2, mat: "wood" }, // a crate
    { x: 8, z: 8, hw: 1.5, hd: 0.4, rot: 0.6, y0: 0, y1: 2.6, mat: "metal" }, // a turned container wall
  ],
  cyls: [{ x: 6, z: -3, r: 0.3, y0: 0, y1: 0.9 }],
  bounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 15 },
};
const world = new E.World(map);
const run = (m, secs, inp) => { for (let i = 0; i < secs / T; i++) m.step(T, Object.assign({ fwd: 0, side: 0, yaw: 0, maxSpeed: E.CFG.speedAK }, inp)); };

// top speed with the AK and with the knife
let m = new E.Mover(world); m.place(0, 10);
run(m, 1.5, { side: 1 });
assert(Math.abs(m.speed2d() - 215 * E.U) < 0.05, "AK top speed " + m.speed2d());
m.place(0, 10); run(m, 1.5, { side: 1, maxSpeed: E.CFG.speedKnife });
assert(Math.abs(m.speed2d() - 250 * E.U) < 0.05, "knife top speed");
// walking and crouching
m.place(0, 10); run(m, 1.5, { side: 1, walk: true });
assert(Math.abs(m.speed2d() - 215 * 0.52 * E.U) < 0.05, "walk speed");
// stopping from full speed takes a fraction of a second (counter-strafe is faster)
m.place(0, 10); run(m, 1.5, { side: 1 });
let t = 0; while (m.speed2d() > 215 * 0.34 * E.U) { m.step(T, { fwd: 0, side: 0, yaw: 0, maxSpeed: E.CFG.speedAK }); t += T; }
let t2 = 0; m.place(0, 10); run(m, 1.5, { side: 1 });
while (m.speed2d() > 215 * 0.34 * E.U) { m.step(T, { fwd: 0, side: -1, yaw: 0, maxSpeed: E.CFG.speedAK }); t2 += T; }
assert(t > 0.08 && t < 0.3 && t2 < t, "stopping " + t.toFixed(3) + " counter-strafe " + t2.toFixed(3));

// jump height ~1.72 m (the map is 1.25x bigger than real Shipment)
m.place(0, 10);
let top = 0; m.step(T, { jump: true, yaw: 0, maxSpeed: 5 }); for (let i = 0; i < 128; i++) { m.step(T, { yaw: 0, maxSpeed: 5 }); top = Math.max(top, m.pos.y); }
assert(Math.abs(top - 1.72) < 0.05 && m.onGround, "jump apex " + top);

// walls stop you
m.place(0, -2); run(m, 1, { fwd: 1 });
assert(m.pos.z > -4.5 + E.CFG.radius - 0.02 && m.pos.z < -4.0, "wall stop " + m.pos.z);
// you walk up a low step but not onto a crate...
m.place(2.5, 0);
let maxY = 0; for (let i = 0; i < 128; i++) { m.step(T, { side: 1, yaw: 0, maxSpeed: E.CFG.speedAK }); maxY = Math.max(maxY, m.pos.y); }
assert(Math.abs(maxY - 0.4) < 0.01 && m.pos.y === 0 && m.pos.x > 5, "stepped up and down " + maxY);
m.place(-2, 0); run(m, 1, { side: -1, yaw: 0 });
assert(m.pos.y === 0 && m.pos.x > -3.2, "crate blocks " + m.pos.x);
// ...but you can jump onto it
m.place(-2, 0); run(m, 0.25, { side: -1 }); m.step(T, { side: -1, jump: true, yaw: 0, maxSpeed: E.CFG.speedAK }); run(m, 1, { side: -1 });
assert(Math.abs(m.pos.y - 1.2) < 0.01, "jumped onto crate " + m.pos.y);
// you never end up inside a turned box, whichever way you run into it
for (let a = 0; a < 16; a++) {
  const ang = (a / 16) * Math.PI * 2;
  m.place(8 + Math.sin(ang) * 3, 8 + Math.cos(ang) * 3);
  for (let i = 0; i < 128; i++) {
    m.step(T, { fwd: 1, yaw: ang, maxSpeed: E.CFG.speedKnife });
    assert(!world.circleHitsBox(world.boxes[3], m.pos.x, m.pos.z, E.CFG.radius - 0.01), "inside turned box at angle " + a);
  }
}
// the classic: crouch-jump from a barrel onto a container (both 1.25x size, like the game's map)
{
  const K = 1.25;
  const w2 = new E.World({ boxes: [{ x: 0, z: -3, hw: 2, hd: 1.2, rot: 0, y0: 0, y1: 2.59 * K }], cyls: [{ x: 0, z: -1, r: 0.3 * K, y0: 0, y1: 0.9 * K }], bounds: map.bounds });
  const c = new E.Mover(w2); c.place(0, -0.8); c.pos.y = 0.9 * K; // on the barrel, a step's run-up
  for (let i = 0; i < 8; i++) c.step(T, { fwd: 1, yaw: 0, maxSpeed: E.CFG.speedAK });
  c.step(T, { fwd: 1, yaw: 0, jump: true, duck: true, maxSpeed: E.CFG.speedAK });
  for (let i = 0; i < 200; i++) c.step(T, { fwd: 1, yaw: 0, duck: true, maxSpeed: E.CFG.speedAK });
  assert(Math.abs(c.pos.y - 2.59 * K) < 0.01, "barrel to container crouch-jump " + c.pos.y);
  // ...but not straight from the ground
  c.place(0, 0.5);
  c.step(T, { fwd: 1, yaw: 0, jump: true, duck: true, maxSpeed: E.CFG.speedAK });
  for (let i = 0; i < 200; i++) c.step(T, { fwd: 1, yaw: 0, duck: true, maxSpeed: E.CFG.speedAK });
  assert(c.pos.y < 2, "can't jump onto a container from the ground");
}
// crouching makes you shorter
m.place(0, 10); run(m, 0.5, { duck: true });
assert(m.duck === 1 && m.height() < 1.6, "crouch");

// bullets hit walls, drums and the ground
let h = world.ray({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, 50);
assert(h && Math.abs(h.t - 4.5) < 1e-6 && h.nz === 1, "wall hit");
h = world.ray({ x: 6, y: 0.5, z: 0 }, { x: 0, y: 0, z: -1 }, 50);
assert(h && Math.abs(h.t - 2.7) < 1e-6, "drum hit");
h = world.ray({ x: 0, y: 1.5, z: 10 }, { x: 0, y: -1, z: 0 }, 50);
assert(h && h.mat === "ground" && Math.abs(h.t - 1.5) < 1e-9, "ground hit");

// damage: one headshot kills, chest needs 3, legs need 4
assert(E.damageFor("head", 10) >= 100);
assert(E.damageFor("chest", 10) * 2 < 100 && E.damageFor("chest", 10) * 3 >= 100);
assert(E.damageFor("leg", 10) * 3 < 100 && E.damageFor("leg", 10) * 4 >= 100);

// the AWP: one shot to the head, chest or stomach; not the legs
assert(E.damageFor("head", 20, "awp") >= 100 && E.damageFor("chest", 20, "awp") >= 100 && E.damageFor("stomach", 20, "awp") >= 100);
assert(E.damageFor("leg", 20, "awp") < 100, "AWP leg shot doesn't kill");
{
  const aw = new E.Arms("awp");
  const mv = new E.Mover(world); mv.place(0, 10);
  assert(aw.weapon === "awp" && aw.ammo === 10 && aw.reserve === 30, "AWP mag");
  const noScope = E.inaccuracy(mv, aw);
  aw.zoom = 1;
  const scoped = E.inaccuracy(mv, aw);
  assert(noScope > 0.05 && scoped < 0.003, "AWP: no-scope " + noScope + " vs scoped " + scoped);
  assert(Math.abs(aw.maxSpeed() - 100 * E.U) < 1e-9, "scoped speed");
  aw.zoom = 0;
  assert(Math.abs(aw.maxSpeed() - 200 * E.U) < 1e-9, "AWP speed");
  aw.weapon = "knife";
  assert(aw.maxSpeed() === E.CFG.speedKnife);
}

// hit boxes
const boxes = E.bodyBoxes({ x: 0, y: 0, z: -10 }, E.CFG.eyeStand, 0);
let hb = E.rayHitboxes({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, boxes, 50);
assert(hb && hb.zone === "head", "head hitbox");
hb = E.rayHitboxes({ x: 0, y: 0.8, z: 0 }, { x: 0, y: 0, z: -1 }, boxes, 50);
assert(hb && hb.zone === "stomach", "stomach hitbox " + (hb && hb.zone));
hb = E.rayHitboxes({ x: 0, y: 0.3, z: 0 }, { x: 0, y: 0, z: -1 }, boxes, 50);
assert(hb && hb.zone === "leg", "leg hitbox " + (hb && hb.zone));

// accuracy: standing still is accurate, running isn't, the first bullets of a spray go where you aim
m.place(0, 10);
const arms = new E.Arms();
assert(E.inaccuracy(m, arms) < 0.008, "standing accurate");
run(m, 1.5, { side: 1 });
assert(E.inaccuracy(m, arms) > 0.15, "running inaccurate");
m.place(0, 10);
const f = { mover: m, arms, yaw: 0, pitch: 0 };
let maxOff = 0;
for (let i = 0; i < 3; i++) {
  const d = E.shotDirection(f, i * 0.1);
  maxOff = Math.max(maxOff, Math.acos(-d.z));
  for (let k = 0; k < 13; k++) E.updateArms(arms, m, T, i * 0.1 + k * T);
}
assert(maxOff < 0.03, "first bullets accurate " + maxOff);
for (let i = 3; i < 12; i++) { E.shotDirection(f, i * 0.1); for (let k = 0; k < 13; k++) E.updateArms(arms, m, T, i * 0.1 + k * T); }
assert(arms.recY > 6, "spray climbs " + arms.recY);
// recoil settles after letting go
for (let k = 0; k < 128; k++) E.updateArms(arms, m, T, 2 + k * T);
assert(arms.recY < 0.5 && arms.recoilIdx < 1, "recoil resets");

console.log("All paintball tests passed. Stop " + (t * 1000).toFixed(0) + " ms, counter-strafe " + (t2 * 1000).toFixed(0) + " ms, jump " + top.toFixed(2) + " m, AK head " + E.damageFor("head", 10) + " / chest " + E.damageFor("chest", 10));
