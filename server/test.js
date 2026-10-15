// Tests for the Paintball server: rooms, hits, kills, respawns, winning. Run: npm test (in this folder)
process.env.COUNTDOWN_MS = "50";
process.env.RESPAWN_MS = "300";
const assert = require("assert");
const WebSocket = require("ws");
const S = require("./paintball-server.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client(port) {
  return new Promise((resolve) => {
    const ws = new WebSocket("ws://localhost:" + port);
    const c = { ws, msgs: [], send: (m) => ws.send(JSON.stringify(m)) };
    c.last = (t) => c.msgs.filter((m) => m.t === t).pop();
    c.all = (t) => c.msgs.filter((m) => m.t === t);
    ws.on("message", (d) => c.msgs.push(JSON.parse(d.toString())));
    ws.on("open", () => resolve(c));
  });
}

(async () => {
  await new Promise((r) => S.server.listen(0, r));
  const port = S.server.address().port;
  const a = await client(port), b = await client(port);
  a.send({ t: "hello", v: 1, name: "Ann", color: "#ff3fa4", mii: { kind: "demo", look: { shirt: "#ff0000" } } });
  b.send({ t: "hello", v: 1, name: "Bob<script>", color: "#ff3fa4", mii: { kind: "glb", b64: Buffer.from("glTF....").toString("base64"), fileName: "bob.glb" } });
  await wait(100);
  const aId = a.last("welcome").id, bId = b.last("welcome").id;
  assert(aId && bId && aId !== bId, "welcome");

  // wrong version is refused
  const c = await client(port);
  c.send({ t: "hello", v: 999, name: "Old" });
  await wait(50);
  assert(c.last("err"), "version check");
  c.ws.close();

  // rooms
  a.send({ t: "create", name: "Shipment" });
  await wait(80);
  const roomId = a.last("room").room.id;
  assert(b.last("rooms").rooms.some((r) => r.id === roomId), "room listed");
  b.send({ t: "join", room: roomId });
  await wait(80);
  const room = a.last("room").room;
  assert.strictEqual(room.players.length, 2);
  assert(room.players.find((p) => p.id === bId).name === "Bobscript", "names are cleaned");
  // they get each other's Miis, and different paint colours
  assert(a.last("mii").id === bId && a.last("mii").mii.kind === "glb", "A got B's Mii");
  assert(b.last("mii").id === aId && b.last("mii").mii.look.shirt === "#ff0000", "B got A's Mii");
  assert.notStrictEqual(room.players[0].color, room.players[1].color, "different colours");

  // only the host can start
  b.send({ t: "start" });
  await wait(50);
  assert(!b.last("start"), "non-host can't start");
  a.send({ t: "start" });
  await wait(120);
  assert(a.last("start") && b.last("start"), "match started");
  a.send({ t: "spawn", x: 0, z: 10, yaw: 0 });
  b.send({ t: "spawn", x: 0, z: -10, yaw: 3 });
  await wait(60);
  assert.strictEqual(a.all("spawn").length, 2, "both spawned");

  // movement is passed on
  a.send({ t: "st", s: [1, 0, 2, 0, 0, 0, 0, 0, 9] });
  await wait(40);
  assert.deepStrictEqual(b.last("st").s, [1, 0, 2, 0, 0, 0, 0, 0, 9]);

  // believable hits only
  a.send({ t: "hit", v: bId, z: "head", d: 999, w: "ak" });   // too much damage
  a.send({ t: "hit", v: bId, z: "nose", d: 36, w: "ak" });    // no such zone
  a.send({ t: "hit", v: aId, z: "chest", d: 36, w: "ak" });   // yourself
  await wait(50);
  assert(!b.last("dmg"), "fake hits ignored");
  a.send({ t: "hit", v: bId, z: "chest", d: 36, w: "ak" });
  a.send({ t: "hit", v: bId, z: "chest", d: 36, w: "ak" });   // faster than the gun can fire
  await wait(50);
  assert.strictEqual(b.all("dmg").length, 1, "fire rate checked");
  assert.strictEqual(b.last("dmg").hp, 64);
  await wait(100);
  a.send({ t: "hit", v: bId, z: "head", d: 143, w: "ak" });
  await wait(60);
  const k = b.last("kill");
  assert(k && k.v === bId && k.by === aId && k.h === 1 && k.scores[aId] === 1, "headshot kill");

  // respawning too early is refused, on time is fine
  b.send({ t: "spawn", x: 5, z: 5, yaw: 0 });
  await wait(30);
  assert.strictEqual(a.all("spawn").length, 2, "too early: not yet");
  await wait(320);
  assert.strictEqual(a.all("spawn").length, 3, "...but let in when it's allowed");

  // first to 20 wins
  for (let i = 1; i < 20; i++) {
    a.send({ t: "hit", v: bId, z: "head", d: 143, w: "ak" });
    await wait(330);
    b.send({ t: "spawn", x: 5, z: 5, yaw: 0 });
    await wait(30);
  }
  await wait(80);
  const over = a.last("over");
  assert(over && over.winner === aId && over.scores[aId] === 20, "A wins at 20");

  // someone joining mid-match is told who's already playing
  a.send({ t: "start" });
  await wait(120);
  a.send({ t: "spawn", x: 1, z: 2, yaw: 0 });
  a.send({ t: "st", s: [3, 0, 4, 0, 0, 1.5, 0, 0, 9] });
  await wait(60);
  const d = await client(port);
  d.send({ t: "hello", v: 1, name: "Dee", color: "#00ff00", mii: { kind: "demo" } });
  await wait(50);
  d.send({ t: "join", room: roomId });
  await wait(100);
  assert(d.last("start") && d.last("start").late, "late start");
  const sp = d.all("spawn").find((m) => m.id === aId);
  assert(sp && sp.x === 3 && sp.z === 4 && sp.yaw === 1.5, "late joiner sees who's alive");
  d.ws.close();
  await wait(50);

  // leaving
  b.ws.close();
  await wait(80);
  assert(a.last("bye") && a.last("bye").id === bId, "bye");
  a.ws.close();
  await wait(50);
  assert.strictEqual(S.rooms.size, 0, "empty room removed");
  console.log("All Paintball server tests passed.");
  S.wss.close(); S.server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
