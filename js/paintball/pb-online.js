/*
 * paintball/pb-online.js
 * Online Paintball: talking to the server (server/paintball-server.js) and
 * the "Online" tab of the Paintball lobby.
 *
 *   1. Host a game from your own computer (desktop app: the server runs inside
 *      Mii Hub, see electron/paintball-host.js), or join one by typing the
 *      host's address. Your chosen Mii (its .glb file, or its colours for a
 *      random Mii) is sent so the others can see it.
 *   2. Make a room, or join one (when there's only one room you join it straight away).
 *   3. The room's host presses Start. Everyone plays Respawn mode: first to
 *      20 eliminations (or the most after 10 minutes).
 *
 * The match itself is pb-game.js (Match with a `net`). The server is the
 * referee: it keeps everyone's HP and score.
 */
(function (root) {
  "use strict";

  const VERSION = 1;          // must match the server's VERSION
  const DEFAULT_PORT = 8787;

  // "desktopjmserver" -> "ws://desktopjmserver:8787", "https://x.example" -> "wss://x.example"
  function normalizeUrl(s) {
    s = String(s || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) s = s.replace(/^http/i, "ws");
    if (!/^wss?:\/\//i.test(s)) s = "ws://" + s;
    try {
      const u = new URL(s);
      if (u.protocol === "ws:" && !u.port) u.port = String(DEFAULT_PORT);
      return u.toString().replace(/\/$/, "");
    } catch (e) { return s; }
  }

  function toBase64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromBase64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }

  // ---------------------------------------------------------------------
  // The connection
  // ---------------------------------------------------------------------
  class Net {
    constructor(url) {
      this.url = url;
      this.handlers = new Map();
      this.id = null;
      this.ping = null;
      this.closed = false;
    }
    connect() {
      return new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(this.url); } catch (e) { reject(new Error("That address doesn't look right.")); return; }
        this.ws = ws;
        let opened = false;
        const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error("The server didn't answer (is it running, and is the address right?)")); } }, 8000);
        ws.onopen = () => { opened = true; clearTimeout(timer); resolve(); this.pingTimer = setInterval(() => this.send({ t: "ping", c: performance.now() }), 2000); };
        ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(new Error("Couldn't reach the server (is it running, and is the address right?)")); } };
        ws.onclose = () => {
          clearInterval(this.pingTimer);
          const was = !this.closed;
          this.closed = true;
          if (opened && was) this.emit({ t: "close" });
        };
        ws.onmessage = (ev) => {
          let m;
          try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.t === "pong") this.ping = Math.round(performance.now() - m.c);
          if (m.t === "welcome") this.id = m.id;
          this.emit(m);
        };
      });
    }
    emit(m) {
      const set = this.handlers.get(m.t);
      if (set) for (const fn of Array.from(set)) { try { fn(m); } catch (e) { console.error(e); } }
    }
    on(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(fn);
      return () => this.handlers.get(type).delete(fn);
    }
    // handle({ type: fn, ... }) -> a function that removes them all again
    handle(map) {
      const offs = Object.entries(map).map(([t, fn]) => this.on(t, fn));
      return () => offs.forEach((off) => off());
    }
    send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
    close() { this.closed = true; clearInterval(this.pingTimer); try { this.ws.close(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------------
  // The Online tab
  // ---------------------------------------------------------------------
  function create(ctx) {
    const { el, opts, settings } = ctx;
    const st = {
      net: null, status: "", statusCls: "", connecting: false,
      rooms: [], room: null, roster: new Map(), loading: new Map(), starting: false,
      spawned: new Map(), // who's alive in the match and where they came in (for joining late)
      hosting: null,      // { port, lan, publicIp, upnp, why } while you host a game
      autoJoin: false,
    };
    let container = null;
    const rerender = () => { if (container && !ctx.inMatch()) render(container); };
    const setStatus = (text, cls) => { st.status = text; st.statusCls = cls || ""; rerender(); };

    // turn a player's Mii (as the server sent it) into something we can draw
    function loadMii(m) {
      if (st.loading.has(m.id)) return st.loading.get(m.id);
      const mii = m.mii || {};
      const rec = {
        id: "net-" + m.id, name: m.name, kind: mii.kind === "glb" ? "glb" : "demo",
        bytes: mii.kind === "glb" ? fromBase64(mii.b64) : null, fileName: mii.fileName || "mii.glb",
        look: mii.look || {},
      };
      const p = opts.templateFor(rec).then((tpl) => {
        const entry = { id: m.id, name: m.name, color: m.color, rec, tpl, look: opts.lookFor(rec, tpl) || {} };
        st.roster.set(m.id, entry);
        rerender();
        return entry;
      }).catch((err) => {
        console.error("Couldn't load " + m.name + "'s Mii", err);
        // fall back to the sample Mii so they can still play
        const r2 = Object.assign({}, rec, { kind: "demo", bytes: null });
        return opts.templateFor(r2).then((tpl) => {
          const entry = { id: m.id, name: m.name, color: m.color, rec: r2, tpl, look: {} };
          st.roster.set(m.id, entry);
          return entry;
        });
      });
      st.loading.set(m.id, p);
      return p;
    }

    async function connect(address, hosting) {
      const url = normalizeUrl(address);
      if (!url) return setStatus("Type the host's address first.", "err");
      if (!hosting) { settings.server = address.trim(); ctx.save(); }
      disconnect(true, hosting);
      st.autoJoin = !hosting;
      st.connecting = true;
      setStatus("Connecting to " + url + "…");
      const net = new Net(url);
      try {
        await net.connect();
      } catch (err) {
        st.connecting = false;
        return setStatus(err.message, "err");
      }
      st.net = net;
      st.connecting = false;
      net.handle({
        welcome: () => setStatus("Connected!", "ok"),
        rooms: (m) => {
          st.rooms = m.rooms;
          // joining a friend's game: there's usually just their room, so go straight in
          if (st.autoJoin && !st.room && m.rooms.length === 1 && m.rooms[0].players < m.rooms[0].max) { st.autoJoin = false; net.send({ t: "join", room: m.rooms[0].id }); }
          rerender();
        },
        room: (m) => { st.room = m.room; rerender(); },
        err: (m) => setStatus(m.msg, "err"),
        mii: (m) => {
          loadMii(m).then((entry) => {
            const match = root.__pb;
            if (match && match.online && match.net === net && !match.disposed) match.addLateRemote(entry);
          });
        },
        bye: (m) => { st.roster.delete(m.id); st.loading.delete(m.id); rerender(); },
        start: (m) => { if (!m.late) st.spawned.clear(); startMatch(m); },
        spawn: (m) => st.spawned.set(m.id, m),
        kill: (m) => st.spawned.delete(m.v),
        close: () => {
          st.net = null; st.room = null; st.rooms = []; st.roster.clear(); st.loading.clear();
          setStatus(st.hosting ? "Your game stopped." : "Disconnected (the host may have stopped the game).", "err");
          if (st.hosting) stopHosting();
        },
      });
      await sendHello();
    }

    async function sendHello() {
      const you = ctx.you;
      const tpl = await opts.templateFor(you);
      const mii = you.kind === "glb" && you.bytes ? { kind: "glb", b64: toBase64(you.bytes), fileName: you.fileName || "mii.glb" } : { kind: "demo", look: you.look || {} };
      st.net.send({ t: "hello", v: VERSION, name: you.name || "Mii", color: ctx.paintFor(tpl), mii });
    }

    function disconnect(quiet, keepHosting) {
      if (st.net) st.net.close();
      st.net = null; st.room = null; st.rooms = []; st.roster.clear(); st.loading.clear();
      if (st.hosting && !keepHosting) stopHosting();
      if (!quiet) setStatus("");
    }

    // ---- hosting a game from this computer (desktop app only) ----
    const hostApi = () => root.miiHubDesktop && root.miiHubDesktop.paintballHost;
    async function host() {
      const H = hostApi();
      if (!H) return;
      setStatus("Starting your game…");
      let r;
      try { r = await H.start(); } catch (err) { return setStatus("Couldn't start your game: " + (err.message || err), "err"); }
      st.hosting = r;
      await connect("localhost:" + r.port, true);
      if (!st.net) { stopHosting(); return; }
      const off = st.net.on("welcome", () => { off(); st.net.send({ t: "create", name: (ctx.you.name || "My") + "'s game" }); });
      // the router check takes a few seconds
      H.details().then((d) => { if (st.hosting) { st.hosting = d; rerender(); } });
    }
    function stopHosting() {
      const H = hostApi();
      st.hosting = null;
      if (H) H.stop();
    }
    function copy(text, btn) {
      try { navigator.clipboard.writeText(text); btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 1500); } catch (e) { /* ignore */ }
    }

    async function startMatch(m) {
      if (st.starting) return;
      st.starting = true;
      const t0 = performance.now();
      const room = st.room;
      try {
        // wait for everyone's Mii to be ready (they were sent when they joined)
        const ids = room ? room.players.map((p) => p.id).filter((id) => id !== st.net.id) : [];
        const entries = await Promise.all(ids.map((id) => st.loading.get(id) || Promise.resolve(st.roster.get(id))));
        // the server gives everyone in the room their own paint colour
        const colorOf = (id) => { const p = room && room.players.find((x) => x.id === id); return p && p.color; };
        for (const e of entries) if (e && colorOf(e.id)) e.color = colorOf(e.id);
        for (const e of entries) if (e) e.spawn = m.late ? st.spawned.get(e.id) : null;
        const waited = performance.now() - t0;
        await ctx.startOnline({
          youColor: colorOf(st.net.id),
          net: st.net, roster: entries.filter(Boolean), startIn: Math.max(0, (m.in || 0) - waited),
          toWin: m.toWin, timeLimit: m.timeLimit, roomName: room ? room.name : "Online",
        });
      } finally { st.starting = false; }
    }

    // ---- drawing the tab ----
    function render(c) {
      container = c;
      const old = c.querySelector(".pb-online");
      if (old) old.remove();
      const wrap = el("div", "pb-online");

      // left: who you play as (+ settings)
      const left = el("div");
      const inRoom = !!st.room;
      left.appendChild(el("h2", "pb-h2", "Play as"));
      left.appendChild(ctx.miiPicker(opts, ctx.recs, ctx.you, null, (r) => {
        if (inRoom) return setStatus("Leave the room to change your Mii.", "err");
        ctx.setYou(r);
        if (st.net) sendHello();
        rerender();
      }));
      const setBox = el("div", "pb-box");
      setBox.style.marginTop = "16px";
      setBox.appendChild(el("h3", null, "Settings"));
      ctx.settingsControls(setBox, settings, () => ctx.save());
      left.appendChild(setBox);

      // right: server, rooms, the room you're in
      const right = el("div", "pb-box");
      if (!st.net) {
        right.appendChild(el("h3", null, "Host a game"));
        if (hostApi()) {
          const hb = el("button", "pb-go", st.connecting && st.hosting ? "STARTING…" : "HOST ▶");
          hb.disabled = st.connecting;
          hb.addEventListener("click", host);
          hb.style.marginBottom = "14px";
          right.appendChild(hb);
          right.appendChild(el("div", "pb-help", "Your computer runs the game and your friends join you. Keep Mii Hub open while you play."));
        } else {
          right.appendChild(el("div", "pb-help", "Hosting works in the Mii Hub desktop app. You can still join a friend's game below."));
        }
        const h3 = el("h3", null, "Join a friend's game");
        h3.style.marginTop = "18px";
        right.appendChild(h3);
        const row = el("div", "pb-row");
        const inp = el("input"); inp.type = "text"; inp.placeholder = "The host's address, e.g. 192.168.1.20:8787"; inp.value = settings.server || "";
        inp.spellcheck = false;
        const go = el("button", "pb-btn primary", st.connecting && !st.hosting ? "Joining…" : "Join");
        go.disabled = st.connecting;
        const doIt = () => connect(inp.value);
        go.addEventListener("click", doIt);
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doIt(); e.stopPropagation(); });
        row.append(inp, go);
        right.appendChild(row);
        if (st.status) right.appendChild(el("div", "pb-status " + st.statusCls, st.status));
        right.appendChild(el("div", "pb-help", "Ask whoever is hosting for their address (they see it after pressing Host). It also works with a Paintball server (see server/README.md)."));
      } else if (!st.room) {
        right.appendChild(el("h3", null, "Rooms"));
        const st2 = el("div", "pb-status ok", "Connected to " + settings.server + (st.net.ping != null ? " · " + st.net.ping + " ms" : ""));
        right.appendChild(st2);
        if (st.status && st.statusCls === "err") right.appendChild(el("div", "pb-status err", st.status));
        const row = el("div", "pb-row");
        const name = el("input"); name.type = "text"; name.placeholder = (ctx.you.name || "My") + "'s room"; name.maxLength = 32;
        name.addEventListener("keydown", (e) => e.stopPropagation());
        const mk = el("button", "pb-btn primary", "Create room");
        mk.addEventListener("click", () => st.net.send({ t: "create", name: name.value.trim() }));
        row.append(name, mk);
        right.appendChild(row);
        const list = el("div", "pb-rooms");
        if (!st.rooms.length) list.appendChild(el("div", "pb-help", "No rooms yet. Make one, and tell your friends to join it!"));
        for (const r of st.rooms) {
          const item = el("div", "pb-room");
          item.append(el("b", null, r.name), el("span", null, r.players + "/" + r.max + " · " + (r.state === "live" ? "playing" : "waiting")));
          const j = el("button", "pb-btn", "Join");
          j.disabled = r.players >= r.max;
          j.addEventListener("click", () => st.net.send({ t: "join", room: r.id }));
          item.appendChild(j);
          list.appendChild(item);
        }
        right.appendChild(list);
        const row2 = el("div", "pb-row");
        const refresh = el("button", "pb-btn", "↻ Refresh");
        refresh.addEventListener("click", () => st.net.send({ t: "list" }));
        const dc = el("button", "pb-btn", "Disconnect");
        dc.addEventListener("click", () => disconnect());
        row2.append(refresh, dc);
        right.appendChild(row2);
      } else {
        const room = st.room;
        const meHost = room.host === st.net.id;
        right.appendChild(el("h3", null, "Room · " + room.name));
        right.appendChild(el("div", "pb-help", "Respawn · first to " + room.toWin + " eliminations · " + Math.round(room.timeLimit / 60000) + " minutes"));
        const list = el("div", "pb-players");
        for (const p of room.players) {
          const item = el("div", "pb-player");
          item.style.setProperty("--c", p.color);
          const img = el("img"); img.alt = "";
          const entry = p.id === st.net.id ? null : st.roster.get(p.id);
          ctx.portraitImg(img, opts, p.id === st.net.id ? ctx.you : entry && entry.rec);
          const nm = el("span", null, p.name + (p.id === st.net.id ? " (you)" : ""));
          nm.style.color = p.color;
          item.append(img, nm);
          if (room.state !== "lobby") item.appendChild(el("span", null, " · " + p.score));
          if (p.id === room.host) item.appendChild(el("span", "host", "HOST"));
          list.appendChild(item);
        }
        right.appendChild(list);
        if (st.status && st.statusCls === "err") right.appendChild(el("div", "pb-status err", st.status));
        const row = el("div", "pb-row");
        if (meHost) {
          const go = el("button", "pb-go", room.state === "live" ? "PLAYING…" : room.state === "over" ? "PLAY AGAIN ▶" : "START ▶");
          go.disabled = room.players.length < 2 || room.state === "live";
          if (go.disabled) go.style.opacity = 0.45;
          go.addEventListener("click", () => st.net.send({ t: "start" }));
          row.appendChild(go);
        } else {
          row.appendChild(el("div", "pb-help", room.state === "live" ? "A match is on: you'll jump in…" : "Waiting for the host to start…"));
        }
        const leave = el("button", "pb-btn", st.hosting ? "Stop hosting" : "Leave room");
        leave.addEventListener("click", () => {
          if (st.hosting) { disconnect(); return; } // (this ends the game for everyone)
          st.net.send({ t: "leave" }); st.room = null; st.net.send({ t: "list" }); rerender();
        });
        row.appendChild(leave);
        right.appendChild(row);
        if (room.players.length < 2) right.appendChild(el("div", "pb-help", "Waiting for at least one more player to join."));
        if (st.hosting) right.appendChild(hostingPanel());
      }
      wrap.append(left, right);
      c.appendChild(wrap);
    }

    // "tell your friends to join with this address"
    function hostingPanel() {
      const h = st.hosting;
      const box = el("div", "pb-hostbox");
      box.appendChild(el("b", null, "🏠 You're hosting! Friends join with:"));
      const line = (label, addr, note) => {
        const row = el("div", "pb-addr");
        row.append(el("span", "lbl", label), el("code", null, addr));
        const c = el("button", "pb-btn", "Copy");
        c.addEventListener("click", () => copy(addr, c));
        row.appendChild(c);
        box.appendChild(row);
        if (note) box.appendChild(el("div", "pb-help", note));
      };
      const lan = (h.lan || [])[0];
      if (lan) line("Same Wi‑Fi", lan + ":" + h.port);
      if (h.upnp === "trying") box.appendChild(el("div", "pb-help", "Checking whether friends outside your home can join…"));
      else if (h.upnp === "open" && h.publicIp) line("Internet", h.publicIp + ":" + h.port, "✅ Your router let them in.");
      else {
        if (h.publicIp) line("Internet", h.publicIp + ":" + h.port);
        box.appendChild(el("div", "pb-help warn", "⚠️ Friends outside your home probably can't join yet. " + (h.why || "") +
          " To fix it: in your router's settings, forward TCP port " + h.port + " to this computer (" + (lan || "its local address") +
          "), or have everyone install Tailscale and join with your Tailscale address."));
      }
      if ((h.lan || []).length > 1) box.appendChild(el("div", "pb-help", "Other addresses for this computer: " + h.lan.slice(1).map((a) => a + ":" + h.port).join(", ")));
      return box;
    }

    return {
      render,
      dispose() { disconnect(true); container = null; },
      host,
      get net() { return st.net; },
      get state() { return st; },
      connect,
    };
  }

  root.PBOnline = { create, Net, normalizeUrl, VERSION };
})(window);
