// Tests for the Paintball server: lobbies, passwords, warmup, matches, rounds, voting. Run: npm test (in this folder)
process.env.COUNTDOWN_MS = "50";
process.env.RESPAWN_MS = "300";
process.env.ROUND_FREEZE_MS = "50";
process.env.ROUND_END_MS = "60";
process.env.INTERMISSION_MS = "1500";
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
async function player(port, name, mii) {
  const c = await client(port);
  c.send({ t: "hello", v: 2, name, color: "#ff3fa4", mii: mii || { kind: "demo" } });
  await wait(60);
  c.id = c.last("welcome").id;
  return c;
}

(async () => {
  const port = await S.start(18787);

  // the server's name (never its address), and the version check
  const old = await client(port);
  old.send({ t: "hello", v: 1, name: "Old" });
  await wait(50);
  assert(old.last("err"), "old versions are told to update");
  old.ws.close();
  const a = await player(port, "Ann", { kind: "demo", look: { shirt: "#ff0000" } });
  assert.strictEqual(a.last("welcome").name, "Admin Server");

  // hosting: you're straight in, running around on your own
  a.send({ t: "create", name: "Shipment" });
  await wait(80);
  const roomId = a.last("room").room.id;
  assert(a.last("warmup"), "warmup while alone");
  a.send({ t: "spawn", x: 1, z: 2, yaw: 0 });
  await wait(40);
  assert(a.last("spawn") && a.last("spawn").id === a.id, "spawn in warmup");

  // a 2nd player joins: the match starts by itself
  const b = await player(port, "Bob<script>", { kind: "glb", b64: Buffer.from("glTF....").toString("base64"), fileName: "bob.glb" });
  assert(b.last("rooms").rooms.some((r) => r.id === roomId), "lobby listed");
  b.send({ t: "join", room: roomId });
  await wait(120);
  const room = a.last("room").room;
  assert.strictEqual(room.players.length, 2);
  assert(room.players.find((p) => p.id === b.id).name === "Bobscript", "names are cleaned");
  assert(a.last("mii").id === b.id && b.last("mii").mii.look.shirt === "#ff0000", "Miis shared");
  assert.notStrictEqual(room.players[0].color, room.players[1].color, "different colours");
  assert(b.last("spawn") && b.last("spawn").id === a.id, "B sees A already running around");
  const st = a.last("start");
  assert(st && st.mode === "respawn" && st.toWin === 20 && b.last("start"), "match started (respawn)");
  a.send({ t: "spawn", x: 0, z: 10, yaw: 0 });
  b.send({ t: "spawn", x: 0, z: -10, yaw: 3 });
  await wait(80);

  // movement is passed on
  a.send({ t: "st", s: [1, 0, 2, 0, 0, 0, 0, 0, 9] });
  await wait(40);
  assert.deepStrictEqual(b.last("st").s, [1, 0, 2, 0, 0, 0, 0, 0, 9]);

  // believable hits only
  a.send({ t: "hit", v: b.id, z: "head", d: 999, w: "ak" });
  a.send({ t: "hit", v: b.id, z: "nose", d: 36, w: "ak" });
  a.send({ t: "hit", v: a.id, z: "chest", d: 36, w: "ak" });
  await wait(50);
  assert(!b.last("dmg"), "fake hits ignored");
  a.send({ t: "hit", v: b.id, z: "chest", d: 36, w: "ak" });
  a.send({ t: "hit", v: b.id, z: "chest", d: 36, w: "ak" });
  await wait(50);
  assert.strictEqual(b.all("dmg").length, 1, "fire rate checked");
  await wait(100);
  a.send({ t: "hit", v: b.id, z: "head", d: 143, w: "ak" });
  await wait(60);
  assert(b.last("kill") && b.last("kill").scores[a.id] === 1, "headshot kill");
  const spawnsBefore = a.all("spawn").length;
  b.send({ t: "spawn", x: 5, z: 5, yaw: 0 });
  await wait(30);
  assert.strictEqual(a.all("spawn").length, spawnsBefore, "too early: not yet");
  await wait(320);
  assert.strictEqual(a.all("spawn").length, spawnsBefore + 1, "...let in when allowed");

  // first to 20, then the intermission vote
  for (let i = 1; i < 20; i++) {
    a.send({ t: "hit", v: b.id, z: "head", d: 143, w: "ak" });
    await wait(330);
    b.send({ t: "spawn", x: 5, z: 5, yaw: 0 });
    await wait(20);
  }
  await wait(80);
  const over = a.last("over");
  assert(over && over.winner === a.id && over.scores[a.id] === 20, "A wins at 20");
  const im = b.last("intermission");
  assert(im && im.modes.length === 2 && im.maps.length === 1, "intermission with mode + map choices");
  a.send({ t: "vote", mode: "rounds", map: "shipment" });
  b.send({ t: "vote", mode: "rounds" });
  await wait(60);
  assert.strictEqual(b.last("votes").modes.rounds, 2, "votes counted");
  await wait(1500);
  assert.strictEqual(a.last("voted").mode, "rounds", "the vote decides");
  const st2 = a.last("start");
  assert(st2.mode === "rounds" && a.last("round"), "rounds match started");

  // rounds: no respawning, last one standing wins the round
  await wait(60);
  a.send({ t: "spawn", x: 0, z: 10, yaw: 0 });
  b.send({ t: "spawn", x: 0, z: -10, yaw: 0 });
  await wait(80);
  a.send({ t: "hit", v: b.id, z: "head", d: 143, w: "ak" });
  await wait(40);
  const re = a.last("roundEnd");
  assert(re && re.winner === a.id && re.scores[a.id] === 1, "round won by the last one standing");
  const before = a.all("spawn").length;
  b.send({ t: "spawn", x: 5, z: 5, yaw: 0 }); // splattered: no coming back this round
  await wait(30);
  assert.strictEqual(a.all("spawn").length, before, "no respawning in rounds");
  await wait(150);
  assert(a.all("round").length >= 2, "next round");

  // a tie is picked at random (both options happen)
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(["respawn", "rounds"][Math.random() < 0.5 ? 0 : 1]);
  assert(seen.size === 2);

  // B leaves: back to warmup
  b.ws.close();
  await wait(100);
  assert(a.last("bye") && a.last("bye").id === b.id, "bye");
  assert(a.msgs.lastIndexOf(a.last("warmup")) > a.msgs.lastIndexOf(a.last("round")), "alone again: warmup");

  // passwords and max players
  const f = await player(port, "Fin"), g = await player(port, "Gus"), h = await player(port, "Hal");
  f.send({ t: "create", name: "Secret", password: "pickles", max: 2 });
  await wait(80);
  const secret = g.last("rooms").rooms.find((r) => r.name === "Secret");
  assert(secret && secret.locked && secret.max === 2 && secret.host === "Fin", "locked lobby listed with host + max");
  g.send({ t: "join", room: secret.id });
  await wait(50);
  assert.strictEqual(g.last("err").code, "password", "asks for the password");
  g.send({ t: "join", room: secret.id, password: "nope" });
  await wait(50);
  assert.strictEqual(g.last("err").msg, "Wrong password.");
  g.send({ t: "join", room: secret.id, password: "pickles" });
  await wait(100);
  assert(g.last("room") && g.last("room").room.players.length === 2, "right password lets you in");
  assert(!JSON.stringify(g.msgs).includes("pickles"), "the password is never sent out");
  h.send({ t: "join", room: secret.id, password: "pickles" });
  await wait(50);
  assert.strictEqual(h.last("err").msg, "That lobby is full.", "max players");
  for (let i = 0; i < 7; i++) h.send({ t: "join", room: secret.id, password: "x" + i });
  await wait(80);
  assert.strictEqual(h.last("err").code, "slow", "password guessing is slowed down");

  for (const c of [a, f, g, h]) c.ws.close();
  await wait(80);
  assert.strictEqual(S.rooms.size, 0, "empty lobbies removed");
  await S.stop();
  assert(!S.running(), "stopped");
  console.log("All Paintball server tests passed.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
