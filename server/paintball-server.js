/*
 * Mii Hub — online Paintball server
 *
 * Run it on a computer your friends can reach (see server/README.md):
 *     npm install
 *     npm start            (or: node paintball-server.js)
 *
 * Settings (environment variables):
 *     PORT        which port to listen on (default 8787)
 *     HOST        which address to listen on (default: all; 127.0.0.1 = this computer only)
 *     MAX_PLAYERS players per room (default 8)
 *
 * What it does:
 *   - keeps a list of rooms; players create or join one
 *   - passes everyone's movement, shots and sounds on to the others in the room
 *   - is the referee: it keeps everyone's HP and score, checks that hits are
 *     believable (damage numbers, fire rate), decides kills, respawns and who wins
 *
 * Every message is a small JSON object with a type "t" (see PROTOCOL below).
 */
"use strict";

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const VERSION = 1;
const PORT = parseInt(process.env.PORT || "8787", 10);
const HOST = process.env.HOST || undefined; // e.g. 127.0.0.1 = only reachable through Tailscale Funnel
const MAX_PLAYERS = Math.max(2, Math.min(16, parseInt(process.env.MAX_PLAYERS || "8", 10))); // most a host can pick
const TO_WIN = 20;               // first to 20 eliminations
const TIME_LIMIT = 10 * 60e3;    // or whoever's ahead after 10 minutes
const RESPAWN_MS = parseInt(process.env.RESPAWN_MS || "2000", 10);
const COUNTDOWN_MS = parseInt(process.env.COUNTDOWN_MS || "3000", 10);
const MAX_MII_BYTES = 6 * 1024 * 1024;
const MAX_ROOMS = 200;

// Damage rules (the same numbers as the game: CS:GO's AK and knife)
const AK_ZONES = { head: 4, chest: 1, arm: 1, stomach: 1.25, leg: 0.75 };
const KNIFE_DAMAGE = [25, 40, 65, 90, 180];

/*
 * PROTOCOL
 * client -> server
 *   hello  { v, name, color, mii }       mii = { kind: "glb", b64, fileName } or { kind: "demo", look }
 *   list   {}                            ask for the room list
 *   create { name, password, max }       host a lobby (password optional; max players 2..MAX_PLAYERS)
 *   join   { room, password }            join a lobby by id (password if it has one)
 *   leave  {}
 *   start  {}                            host only: start (or restart) the match
 *   st     { s: [x, y, z, vx, vz, yaw, pitch, duck, flags] }   your movement, ~30 times a second
 *   shot   { o: [x,y,z], e: [x,y,z], n: [nx,ny,nz] | null, m }  a paintball you fired (for everyone's screens)
 *   ev     { k }                         a sound to play at your position (reload, deploy, land...)
 *   hit    { v, z, d, w, b }             you hit player v in zone z for d damage with weapon w (b = backstab)
 *   spawn  { x, z, yaw }                 you're back in after being splattered
 *   ping   { c }
 * server -> client
 *   welcome { id, v, maxPlayers }   rooms { rooms }   room { room }   mii { id, name, color, mii }   bye { id }
 *   start { in, toWin, timeLimit }  st { id, s }  shot { id, ... }  ev { id, k }
 *   dmg { v, by, d, z, hp, w }  kill { v, by, w, h, b, scores }  spawn { id, x, z, yaw }
 *   over { winner, scores }  pong { c, s }  err { msg }
 */

let nextId = 1;
const players = new Map(); // id -> player
const rooms = new Map();   // id -> room

// everyone in a room gets their own paint colour
const PALETTE = ["#ff3fa4", "#3de0ff", "#ffb21e", "#78d220", "#9b5cff", "#ff3b30", "#ffe94d", "#2b7cff", "#00c896", "#ff8a00", "#e0e0e0", "#f55a7d", "#7328ad", "#00a0a0", "#c08040", "#a0ff40"];

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
const isColor = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

function send(p, msg) {
  if (p.ws.readyState === 1) p.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
}
function broadcast(room, msg, except) {
  const s = JSON.stringify(msg);
  for (const id of room.players) if (id !== except) { const p = players.get(id); if (p) send(p, s); }
}

const hashPass = (salt, pw) => crypto.createHash("sha256").update(salt + "\u0000" + pw).digest("hex");

function roomInfo(room) {
  return {
    id: room.id, name: room.name, host: room.host, state: room.state, toWin: TO_WIN, timeLimit: TIME_LIMIT, max: room.max, locked: !!room.pass,
    players: room.players.map((id) => {
      const p = players.get(id);
      return { id, name: p.name, color: p.color, score: p.score, deaths: p.deaths, alive: p.alive };
    }),
  };
}
function roomList() {
  return Array.from(rooms.values()).map((r) => {
    const host = players.get(r.host);
    return { id: r.id, name: r.name, host: host ? host.name : "", players: r.players.length, max: r.max, state: r.state, locked: !!r.pass };
  });
}
function sendRoomList(p) { send(p, { t: "rooms", rooms: roomList() }); }
function roomChanged(room) {
  broadcast(room, { t: "room", room: roomInfo(room) });
  // people in the menu see the room list change
  for (const p of players.values()) if (!p.room) sendRoomList(p);
}
function scores(room) {
  const s = {};
  for (const id of room.players) { const p = players.get(id); s[id] = p.score; }
  return s;
}

function leaveRoom(p) {
  const room = p.room && rooms.get(p.room);
  p.room = null;
  if (!room) return;
  room.players = room.players.filter((id) => id !== p.id);
  broadcast(room, { t: "bye", id: p.id });
  if (!room.players.length) { clearTimeout(room.timer); rooms.delete(room.id); }
  else {
    clearTimeout(p.spawnTimer);
    if (room.host === p.id) room.host = room.players[0];
    // only one player left in a match: it's over
    if (room.state === "live" && room.players.length < 2) endMatch(room);
  }
  roomChanged(room);
}

function joinRoom(p, room) {
  if (room.players.length >= room.max) return send(p, { t: "err", msg: "That lobby is full." });
  leaveRoom(p);
  // a colour nobody else in the room has
  const used = new Set(room.players.map((id) => players.get(id).color.toLowerCase()));
  if (used.has(p.color.toLowerCase())) p.color = PALETTE.find((c) => !used.has(c)) || p.color;
  p.room = room.id;
  p.score = 0; p.deaths = 0; p.hp = 100;
  p.alive = false; p.diedAt = 0; // joins as "waiting to spawn"
  room.players.push(p.id);
  // tell everyone what the new player's Mii looks like, and the new player about everyone else
  const meMii = JSON.stringify({ t: "mii", id: p.id, name: p.name, color: p.color, mii: p.mii });
  for (const id of room.players) {
    if (id === p.id) continue;
    const o = players.get(id);
    send(o, meMii);
    send(p, { t: "mii", id: o.id, name: o.name, color: o.color, mii: o.mii });
  }
  roomChanged(room);
  if (room.state === "live") {
    send(p, { t: "start", in: Math.max(0, room.startedAt - Date.now()), toWin: TO_WIN, timeLimit: TIME_LIMIT - Math.max(0, Date.now() - room.startedAt), late: true });
    // who's already running around (they spawned before you got here)
    for (const id of room.players) {
      const o = players.get(id);
      if (o !== p && o.alive && o.pos) send(p, { t: "spawn", id: o.id, x: o.pos[0], z: o.pos[2], yaw: o.yaw || 0 });
    }
  }
}

function startMatch(room) {
  room.state = "live";
  room.startedAt = Date.now() + COUNTDOWN_MS;
  for (const id of room.players) {
    const p = players.get(id);
    p.score = 0; p.deaths = 0; p.hp = 100; p.alive = false; p.diedAt = 0;
    p.lastAk = 0; p.lastKnife = 0;
  }
  broadcast(room, { t: "start", in: COUNTDOWN_MS, toWin: TO_WIN, timeLimit: TIME_LIMIT });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => endMatch(room), COUNTDOWN_MS + TIME_LIMIT);
  roomChanged(room);
}

function endMatch(room) {
  if (room.state !== "live") return;
  clearTimeout(room.timer);
  room.state = "over";
  let winner = null, best = -1;
  for (const id of room.players) { const p = players.get(id); if (p.score > best) { best = p.score; winner = id; } }
  broadcast(room, { t: "over", winner, scores: scores(room) });
  roomChanged(room);
}

function doSpawn(p, sp) {
  const room = p.room && rooms.get(p.room);
  if (!room || room.state !== "live" || p.alive) return;
  p.alive = true; p.hp = 100;
  p.pos = [sp.x, 0, sp.z];
  p.yaw = sp.yaw;
  broadcast(room, { t: "spawn", id: p.id, x: sp.x, z: sp.z, yaw: sp.yaw });
}

// Is this hit believable? (stops someone with a modified game from cheating)
function validHit(p, v, msg, now) {
  const d = num(msg.d);
  if (msg.w === "ak") {
    const mult = AK_ZONES[msg.z];
    if (!mult) return false;
    const max = Math.round(36 * mult), min = Math.floor(36 * mult * 0.8);
    if (d < min || d > max) return false;
    if (now - p.lastAk < 85) return false; // faster than 600 shots a minute
    p.lastAk = now;
  } else if (msg.w === "knife") {
    if (!KNIFE_DAMAGE.includes(d)) return false;
    if (now - p.lastKnife < 350) return false;
    // you have to be close to someone to knife them
    if (p.pos && v.pos && Math.hypot(p.pos[0] - v.pos[0], p.pos[2] - v.pos[2]) > 4.5) return false;
    p.lastKnife = now;
  } else return false;
  return true;
}

function onMessage(p, msg) {
  const now = Date.now();
  const room = p.room ? rooms.get(p.room) : null;
  switch (msg.t) {
    case "hello": {
      if (msg.v !== VERSION) return send(p, { t: "err", msg: "Your Mii Hub and this server are different versions. Update Mii Hub (and the server) and try again." });
      p.name = clean(msg.name, 20) || "Mii";
      p.color = isColor(msg.color) ? msg.color.toLowerCase() : "#ff3fa4";
      const mii = msg.mii || {};
      if (mii.kind === "glb" && typeof mii.b64 === "string" && mii.b64.length * 0.75 <= MAX_MII_BYTES) {
        p.mii = { kind: "glb", b64: mii.b64, fileName: clean(mii.fileName, 80) || "mii.glb" };
      } else {
        p.mii = { kind: "demo", look: mii.look && typeof mii.look === "object" ? mii.look : {} };
      }
      p.ready = true;
      send(p, { t: "welcome", id: p.id, v: VERSION, maxPlayers: MAX_PLAYERS });
      sendRoomList(p);
      break;
    }
    case "list": sendRoomList(p); break;
    case "create": {
      if (!p.ready) return;
      if (rooms.size >= MAX_ROOMS) return send(p, { t: "err", msg: "There are too many lobbies right now. Try joining one!" });
      const id = "r" + (nextId++);
      const pw = clean(msg.password, 32);
      const salt = crypto.randomBytes(8).toString("hex");
      const max = Math.max(2, Math.min(MAX_PLAYERS, Math.round(num(msg.max)) || MAX_PLAYERS));
      const r = {
        id, name: clean(msg.name, 32) || p.name + "'s lobby", host: p.id, players: [], state: "lobby", timer: null, startedAt: 0,
        max, salt, pass: pw ? hashPass(salt, pw) : null,
      };
      rooms.set(id, r);
      joinRoom(p, r);
      break;
    }
    case "join": {
      if (!p.ready) return;
      const r = rooms.get(msg.room);
      if (!r) return send(p, { t: "err", msg: "That lobby doesn't exist any more." });
      if (r.pass) {
        // a few tries a minute, so nobody can guess passwords by trying thousands
        p.tries = (p.tries || []).filter((t) => now - t < 60e3);
        if (p.tries.length >= 6) return send(p, { t: "err", code: "slow", msg: "Too many wrong passwords. Wait a minute and try again." });
        if (hashPass(r.salt, clean(msg.password, 32)) !== r.pass) {
          p.tries.push(now);
          return send(p, { t: "err", code: "password", room: r.id, msg: msg.password ? "Wrong password." : "This lobby has a password." });
        }
      }
      joinRoom(p, r);
      break;
    }
    case "leave": leaveRoom(p); break;
    case "start": {
      if (!room || room.host !== p.id) return;
      if (room.players.length < 2) return send(p, { t: "err", msg: "You need at least 2 players to start." });
      startMatch(room);
      break;
    }
    case "st": {
      if (!room || !Array.isArray(msg.s) || msg.s.length !== 9) return;
      if (now - p.lastSt < 12) return; // more than ~80 a second: ignore
      p.lastSt = now;
      const s = msg.s.map(num);
      p.pos = [s[0], s[1], s[2]];
      p.yaw = s[5];
      broadcast(room, { t: "st", id: p.id, s }, p.id);
      break;
    }
    case "shot": {
      if (!room || room.state !== "live" || !p.alive) return;
      if (!Array.isArray(msg.o) || !Array.isArray(msg.e)) return;
      broadcast(room, { t: "shot", id: p.id, o: msg.o.slice(0, 3).map(num), e: msg.e.slice(0, 3).map(num), n: Array.isArray(msg.n) ? msg.n.slice(0, 3).map(num) : null, m: clean(msg.m, 10) }, p.id);
      break;
    }
    case "ev": {
      if (!room) return;
      broadcast(room, { t: "ev", id: p.id, k: clean(msg.k, 16) }, p.id);
      break;
    }
    case "hit": {
      if (!room || room.state !== "live" || !p.alive || now < room.startedAt) return;
      const v = players.get(msg.v);
      if (!v || v.room !== room.id || v === p || !v.alive) return;
      if (!validHit(p, v, msg, now)) return;
      const d = num(msg.d);
      v.hp = Math.max(0, v.hp - d);
      broadcast(room, { t: "dmg", v: v.id, by: p.id, d, z: msg.z, hp: v.hp, w: msg.w });
      if (v.hp <= 0) {
        v.alive = false; v.diedAt = now; v.deaths++;
        p.score++;
        broadcast(room, { t: "kill", v: v.id, by: p.id, w: msg.w, h: msg.z === "head" ? 1 : 0, b: msg.b ? 1 : 0, scores: scores(room) });
        roomChanged(room);
        if (p.score >= TO_WIN) endMatch(room);
      }
      break;
    }
    case "spawn": {
      if (!room || room.state !== "live" || p.alive) return;
      // a bit early (lag)? let them in as soon as it's allowed
      const wait = Math.max(p.diedAt ? p.diedAt + RESPAWN_MS * 0.85 - now : 0, room.startedAt - 250 - now);
      const sp = { x: num(msg.x), z: num(msg.z), yaw: num(msg.yaw) };
      clearTimeout(p.spawnTimer);
      if (wait > 0) p.spawnTimer = setTimeout(() => doSpawn(p, sp), wait);
      else doSpawn(p, sp);
      break;
    }
    case "ping": send(p, { t: "pong", c: num(msg.c), s: now }); break;
  }
}

// ---------------------------------------------------------------------
// The server itself
// ---------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // open http://<this computer>:8787 in a browser to check it's running
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end("Mii Hub Paintball server is running.\n" + players.size + " player(s) online, " + rooms.size + " room(s).\n");
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MII_BYTES * 1.4 + 4096 });

wss.on("connection", (ws, req) => {
  const p = { id: "p" + (nextId++), ws, name: "Mii", color: "#ff3fa4", mii: null, room: null, ready: false, alive: false, hp: 100, score: 0, deaths: 0, lastSt: 0, lastAk: 0, lastKnife: 0, pos: null, isAlive: true };
  players.set(p.id, p);
  log("+ " + p.id + " connected from " + (req.socket.remoteAddress || "?") + " (" + players.size + " online)");
  ws.on("pong", () => { p.isAlive = true; });
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || typeof msg.t !== "string") return;
    try { onMessage(p, msg); } catch (e) { log("error handling " + msg.t + ": " + e.message); }
  });
  ws.on("close", () => {
    leaveRoom(p);
    players.delete(p.id);
    log("- " + p.id + " (" + p.name + ") left (" + players.size + " online)");
  });
  ws.on("error", () => { /* closed below */ });
});

// drop connections that went quiet (laptop closed, wifi gone...)
const beat = setInterval(() => {
  for (const p of players.values()) {
    if (!p.isAlive) { p.ws.terminate(); continue; }
    p.isAlive = false;
    try { p.ws.ping(); } catch (e) { /* ignore */ }
  }
}, 15000);
if (beat.unref) beat.unref();
wss.on("close", () => clearInterval(beat));

function log(s) { console.log(new Date().toISOString().slice(11, 19) + "  " + s); }

// Start listening (tries the next ports if this one is taken). Resolves with the port.
function start(port) {
  port = port || PORT;
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p) => {
      const onErr = (err) => {
        server.removeListener("listening", onOk);
        if (err.code === "EADDRINUSE" && tries++ < 10) attempt(p + 1);
        else reject(err);
      };
      const onOk = () => { server.removeListener("error", onErr); resolve(server.address().port); };
      server.once("error", onErr);
      server.once("listening", onOk);
      server.listen(p, HOST);
    };
    attempt(port);
  });
}

// Stop: everyone is disconnected and all rooms are closed.
function stop() {
  return new Promise((resolve) => {
    for (const p of players.values()) { try { p.ws.close(1001, "The host stopped the game"); } catch (e) { /* ignore */ } }
    for (const r of rooms.values()) clearTimeout(r.timer);
    rooms.clear();
    setTimeout(() => {
      for (const p of players.values()) { try { p.ws.terminate(); } catch (e) { /* ignore */ } }
      players.clear();
      if (server.listening) server.close(() => resolve()); else resolve();
    }, 100);
  });
}
const running = () => server.listening;

if (require.main === module) {
  start(PORT).then((port) => {
    log("Mii Hub Paintball server listening on port " + port + " (max " + MAX_PLAYERS + " players a room)");
    log("Check it: open http://localhost:" + port + " in a browser on this computer.");
  }).catch((err) => { log("Couldn't start: " + err.message); process.exit(1); });
}

module.exports = { server, wss, VERSION, PORT, rooms, players, start, stop, running };
