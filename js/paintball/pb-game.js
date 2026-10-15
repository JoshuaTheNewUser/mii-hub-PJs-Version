/*
 * paintball/pb-game.js
 * Paintball: a first-person 1v1 against one of your Miis on Shipment.
 *
 *   Lobby   pick the Mii you play as and the Mii you play against
 *   Match   first to 10 rounds. Each round: 3 s freeze time, then 1:30 to
 *           splat the other Mii. Paint AK + butterfly knife only.
 *   HUD     HP, ammo, round timer + score, kill feed, crosshair,
 *           scoreboard (hold Tab), damage report when you die.
 *
 * Rules and the Mii's brain are in pb-engine.js, the map in pb-map.js, the gun,
 * knife and hands in pb-models.js and the sounds in pb-audio.js. None of these
 * files load until you open Paintball (see openPaintball in app.js).
 *
 * Use: Paintball.open({ records, templateFor, lookFor, portraitFor, statsFor,
 *                       onSave, onFinish, onClose, opponent, player })
 */
(function (root) {
  "use strict";

  const E = root.PBEngine;
  const { CFG, AK, KNIFE, DEG, clamp, lerp } = E;
  const TICK = 1 / 128;
  const TO_WIN = 10;
  const FREEZE = 3;
  const ROUND_TIME = 90;
  const END_DELAY = 3.5;
  const MII_SCALE = 1.25;      // Miis are 1.8 tall in the hub; here they're CS-sized
  const SETTINGS_KEY = "mii-hub-paintball";
  const FAV = ["#d21e14", "#ff6e19", "#ffd820", "#78d220", "#007830", "#0a48b4", "#3caade", "#f55a7d", "#7328ad", "#483818", "#e0e0e0", "#181814"];

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---------------------------------------------------------------------
  // Settings (kept between games)
  // ---------------------------------------------------------------------
  const DEFAULTS = { sens: 2.0, volume: 0.7, xhColor: "#3dff6e", xhStyle: "static", xhSize: 5, xhGap: 3, player: null, opponent: null };
  function loadSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* private window */ } }

  // ---------------------------------------------------------------------
  // Colours
  // ---------------------------------------------------------------------
  function hexOf(v, fallback) {
    if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return v;
    if (Array.isArray(v) && root.MiiModel) return root.MiiModel.rgbToHex(v);
    return fallback;
  }
  function colorDistance(a, b) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b);
  }
  // A paint colour that pops on the grey map (black/brown/white paint is hard to see)
  function paintColor(tpl) {
    const i = tpl && tpl.info ? tpl.info.favoriteColor : 0;
    const swap = { 9: "#ff8a00", 10: "#ffe94d", 11: "#9b5cff" };
    return swap[i] || FAV[i] || "#ff3fa4";
  }

  // ---------------------------------------------------------------------
  // Styles (only added when Paintball opens)
  // ---------------------------------------------------------------------
  let cssDone = false;
  function addCSS() {
    if (cssDone) return;
    cssDone = true;
    const css = `
.pb-root{position:fixed;inset:0;z-index:2000;background:#0d1014;color:#eef2f6;font-family:Nunito,system-ui,sans-serif;overflow:hidden;user-select:none}
.pb-root canvas{display:block;width:100%;height:100%}
.pb-root button{font:inherit;cursor:pointer}
.pb-lobby{position:absolute;inset:0;overflow:auto;background:radial-gradient(ellipse at top,#2b3644,#0d1014 70%);padding:28px 32px}
.pb-lobby h1{margin:0;font-size:34px;letter-spacing:2px;font-weight:900}
.pb-lobby h1 small{font-size:15px;opacity:.6;letter-spacing:1px;margin-left:10px;font-weight:700}
.pb-lob-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.pb-x{background:#ffffff14;border:1px solid #ffffff26;color:#fff;border-radius:10px;padding:8px 14px}
.pb-cols{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.pb-col h2{font-size:15px;text-transform:uppercase;letter-spacing:2px;opacity:.75;margin:0 0 10px}
.pb-minis{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
.pb-mini{background:#ffffff0d;border:2px solid #ffffff1a;border-radius:14px;padding:10px 6px 8px;text-align:center;color:#fff;transition:transform .12s,border-color .12s}
.pb-mini:hover{transform:translateY(-2px);border-color:#ffffff55}
.pb-mini.sel{border-color:#ffb21e;background:#ffb21e22}
.pb-mini.off{opacity:.3;pointer-events:none}
.pb-mini img{width:72px;height:72px;border-radius:50%;background:#ffffff14;object-fit:cover}
.pb-mini b{display:block;margin-top:4px;font-size:15px}
.pb-mini span{display:block;font-size:11px;opacity:.7}
.pb-bottom{display:grid;grid-template-columns:1.2fr 1fr auto;gap:22px;margin-top:22px;align-items:start}
.pb-box{background:#ffffff0b;border:1px solid #ffffff1a;border-radius:14px;padding:14px 16px}
.pb-box h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:2px;opacity:.7}
.pb-set{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:14px}
.pb-set label{width:110px;opacity:.85}
.pb-set input[type=range]{flex:1}
.pb-set .val{width:44px;text-align:right;font-variant-numeric:tabular-nums}
.pb-swatches{display:flex;gap:6px}
.pb-sw{width:22px;height:22px;border-radius:6px;border:2px solid transparent}
.pb-sw.sel{border-color:#fff}
.pb-keys{font-size:13px;line-height:1.75;opacity:.85;columns:2}
.pb-keys kbd{background:#ffffff1f;border-radius:5px;padding:1px 6px;font-family:inherit;font-size:12px}
.pb-go{background:linear-gradient(#ffc23a,#ff8c1a);color:#2a1600;border:0;border-radius:16px;padding:22px 34px;font-size:24px;font-weight:900;letter-spacing:1px;box-shadow:0 6px 0 #b35a00}
.pb-go:active{transform:translateY(3px);box-shadow:0 3px 0 #b35a00}
.pb-vs{font-size:14px;opacity:.75;margin-top:8px;text-align:center}
.pb-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#0d1014;font-size:22px;font-weight:800;letter-spacing:2px}
.pb-loading i{width:220px;height:6px;background:#ffffff22;border-radius:3px;overflow:hidden}
.pb-loading i::after{content:"";display:block;height:100%;width:40%;background:#ffb21e;animation:pbload 1s infinite ease-in-out}
@keyframes pbload{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
.pb-hud{position:absolute;inset:0;pointer-events:none;text-shadow:0 1px 2px #000a}
.pb-top{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;align-items:stretch;gap:4px}
.pb-team{display:flex;align-items:center;gap:8px;background:#0b0e12c0;padding:4px 10px;border-radius:8px;min-width:150px}
.pb-team.opp{flex-direction:row-reverse}
.pb-team img{width:34px;height:34px;border-radius:50%;background:#ffffff1a;border:2px solid var(--c)}
.pb-team .nm{font-weight:800;font-size:14px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pb-team .sc{font-size:28px;font-weight:900;margin-left:auto;color:var(--c);min-width:26px;text-align:center}
.pb-team.opp .sc{margin-left:0;margin-right:auto}
.pb-clock{background:#0b0e12d8;border-radius:8px;padding:2px 14px;text-align:center;min-width:84px}
.pb-clock .tm{font-size:26px;font-weight:900;font-variant-numeric:tabular-nums}
.pb-clock .tm.low{color:#ff5a4a}
.pb-clock .sub{font-size:10px;letter-spacing:1px;opacity:.65;text-transform:uppercase}
.pb-pips{display:flex;gap:3px;justify-content:center;margin-top:3px}
.pb-pips i{width:9px;height:4px;border-radius:2px;background:#ffffff26}
.pb-pips i.on{background:var(--c)}
.pb-feed{position:absolute;top:12px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.pb-kill{background:#0b0e12c8;border-radius:6px;padding:4px 10px;font-weight:800;font-size:14px;display:flex;align-items:center;gap:7px;animation:pbin .2s}
.pb-kill.mine{border:2px solid #ff3b30}
.pb-kill .wpn{opacity:.9;font-size:13px}
@keyframes pbin{from{transform:translateX(30px);opacity:0}}
.pb-xh{position:absolute;left:50%;top:50%;width:0;height:0}
.pb-xh i{position:absolute;background:var(--xc);box-shadow:0 0 0 1px #000c}
.pb-hp,.pb-ammo{position:absolute;bottom:16px;background:linear-gradient(90deg,#0b0e12d0,#0b0e1200);padding:8px 16px;border-radius:8px;display:flex;align-items:baseline;gap:10px;font-weight:900}
.pb-hp{left:16px}
.pb-hp .plus{font-size:26px;color:#e8eef5}
.pb-hp b{font-size:38px;min-width:64px;font-variant-numeric:tabular-nums}
.pb-hp b.low{color:#ff5a4a}
.pb-hp .bar{width:120px;height:6px;background:#ffffff22;border-radius:3px;align-self:center}
.pb-hp .bar i{display:block;height:100%;background:#e8eef5;border-radius:3px;transition:width .2s}
.pb-ammo{right:16px;background:linear-gradient(270deg,#0b0e12d0,#0b0e1200);flex-direction:row-reverse}
.pb-ammo .mag{font-size:38px;font-variant-numeric:tabular-nums}
.pb-ammo .mag.low{color:#ff5a4a}
.pb-ammo .res{font-size:20px;opacity:.75}
.pb-ammo .wn{font-size:13px;opacity:.75;letter-spacing:1px;text-transform:uppercase}
.pb-ammo .rl{font-size:13px;color:#ffb21e}
.pb-slots{position:absolute;right:18px;bottom:78px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:12px;font-weight:800}
.pb-slots span{opacity:.45;background:#0b0e1280;padding:2px 8px;border-radius:4px}
.pb-slots span.on{opacity:1;color:#ffb21e}
.pb-banner{position:absolute;left:50%;top:24%;transform:translateX(-50%);text-align:center;font-weight:900;opacity:0;transition:opacity .25s}
.pb-banner.show{opacity:1}
.pb-banner .big{font-size:52px;letter-spacing:3px}
.pb-banner .small{font-size:18px;opacity:.85;margin-top:4px}
.pb-banner.win .big{color:#6cff8a}.pb-banner.lose .big{color:#ff5a4a}
.pb-hurt{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 55%,#c0101088 100%);transition:opacity .4s}
.pb-dir{position:absolute;left:50%;top:50%;width:0;height:0}
.pb-dir i{position:absolute;left:-60px;top:-170px;width:120px;height:26px;border-radius:50%/100% 100% 0 0;border-top:6px solid #ff3b30;opacity:0;transition:opacity .6s;transform-origin:60px 170px}
.pb-splats{position:absolute;inset:0;overflow:hidden}
.pb-splats canvas{position:absolute;transition:opacity 1.6s;width:auto;height:auto}
.pb-board{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#0b0e12e8;border-radius:14px;padding:18px 22px;min-width:560px;display:none}
.pb-board.show{display:block}
.pb-board h3{margin:0 0 4px;font-size:20px;display:flex;justify-content:space-between}
.pb-board h3 small{opacity:.6;font-size:13px;font-weight:700}
.pb-board table{width:100%;border-collapse:collapse;margin-top:10px;font-weight:800}
.pb-board th{font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:1px;text-align:right;padding:4px 8px}
.pb-board th:first-child,.pb-board td:first-child{text-align:left}
.pb-board td{padding:8px;text-align:right;border-top:1px solid #ffffff14;font-variant-numeric:tabular-nums}
.pb-board td img{width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:8px;background:#ffffff1a}
.pb-board tr.me td{background:#ffffff0a}
.pb-death{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);background:#0b0e12d8;border-radius:12px;padding:12px 18px;text-align:center;display:none;font-weight:800}
.pb-death.show{display:block}
.pb-death .who{font-size:20px}
.pb-death .dmg{font-size:13px;opacity:.85;margin-top:6px;line-height:1.5}
.pb-overlay{position:absolute;inset:0;background:#05070acc;display:none;align-items:center;justify-content:center;pointer-events:auto}
.pb-overlay.show{display:flex}
.pb-panel{background:#151a21;border:1px solid #ffffff1f;border-radius:18px;padding:22px 26px;min-width:340px;max-width:min(92vw,620px);text-align:center}
.pb-panel h2{margin:0 0 6px;font-size:28px;letter-spacing:2px}
.pb-panel p{opacity:.8;margin:6px 0 14px}
.pb-panel .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.pb-btn{background:#ffffff14;border:1px solid #ffffff2a;color:#fff;border-radius:12px;padding:11px 18px;font-weight:800}
.pb-btn.primary{background:#ffb21e;border-color:#ffb21e;color:#2a1600}
.pb-panel .pb-set{justify-content:center}
.pb-result .big{font-size:56px;font-weight:900;letter-spacing:4px}
.pb-result .big.win{color:#6cff8a}.pb-result .big.lose{color:#ff5a4a}
.pb-result .score{font-size:30px;font-weight:900;margin:4px 0}
.pb-result table{margin:12px auto 0;border-collapse:collapse;font-weight:800}
.pb-result td,.pb-result th{padding:5px 12px;text-align:right}
.pb-result th{font-size:11px;opacity:.6;text-transform:uppercase}
.pb-result td:first-child,.pb-result th:first-child{text-align:left}
.pb-result .say{font-style:italic;opacity:.85;margin-top:12px}
.pb-result .grow{color:#6cff8a;font-size:14px;margin-top:6px}
.pb-hint{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);font-size:13px;opacity:.7;font-weight:700}
@media (max-width:820px){.pb-cols,.pb-bottom{grid-template-columns:1fr}.pb-board{min-width:0;width:94vw}}
`;
    const s = document.createElement("style");
    s.id = "pb-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  // =====================================================================
  // Opening Paintball: the lobby
  // =====================================================================
  let current = null;

  function open(opts) {
    if (current) current.close();
    addCSS();
    const settings = loadSettings();
    const rootEl = el("div", "pb-root");
    document.body.appendChild(rootEl);
    let match = null;
    let closed = false;

    const recs = opts.records.filter(Boolean);
    const byId = (id) => recs.find((r) => r.id === id);
    let you = (opts.player && byId(opts.player.id)) || byId(settings.player) || recs[0];
    let opp = (opts.opponent && byId(opts.opponent.id)) || byId(settings.opponent) || recs.find((r) => r !== you);
    if (opp === you) opp = recs.find((r) => r !== you);

    function close() {
      if (closed) return;
      closed = true;
      if (match) match.dispose();
      rootEl.remove();
      document.removeEventListener("keydown", lobbyKeys, true);
      if (current && current.close === close) current = null;
      if (opts.onClose) opts.onClose();
    }
    function lobbyKeys(e) { if (e.key === "Escape" && !match) { e.preventDefault(); close(); } }
    document.addEventListener("keydown", lobbyKeys, true);

    function showLobby() {
      if (match) { match.dispose(); match = null; }
      rootEl.innerHTML = "";
      const lob = el("div", "pb-lobby");
      const head = el("div", "pb-lob-head");
      const h1 = el("h1", null, "🎯 PAINTBALL");
      h1.appendChild(el("small", null, "1v1 · Shipment · First to " + TO_WIN));
      const x = el("button", "pb-x", "✕ Back to the hub");
      x.addEventListener("click", close);
      head.append(h1, x);

      const cols = el("div", "pb-cols");
      const mkCol = (title, isOpp) => {
        const col = el("div", "pb-col");
        col.appendChild(el("h2", null, title));
        const grid = el("div", "pb-minis");
        for (const r of recs) {
          const b = el("button", "pb-mini");
          const img = el("img"); img.src = opts.portraitFor(r) || ""; img.alt = "";
          b.append(img, el("b", null, r.name || "Mii"));
          if (isOpp) {
            const st = opts.statsFor(r);
            b.appendChild(el("span", null, root.MiniGames.skillLevel(st.skill) + " · " + Math.round(st.skill)));
          } else {
            b.appendChild(el("span", null, "You"));
          }
          const sel = isOpp ? r === opp : r === you;
          if (sel) b.classList.add("sel");
          if ((isOpp ? you : opp) === r) b.classList.add("off");
          b.addEventListener("click", () => {
            if (isOpp) opp = r; else { you = r; if (opp === you) opp = recs.find((o) => o !== you); }
            showLobby();
          });
          grid.appendChild(b);
        }
        col.appendChild(grid);
        return col;
      };
      cols.append(mkCol("Play as", false), mkCol("Opponent", true));

      const bottom = el("div", "pb-bottom");
      const setBox = el("div", "pb-box");
      setBox.appendChild(el("h3", null, "Settings"));
      settingsControls(setBox, settings, () => saveSettings(settings));
      const keys = el("div", "pb-box");
      keys.appendChild(el("h3", null, "Controls"));
      const k = el("div", "pb-keys");
      k.innerHTML = [
        "<kbd>W A S D</kbd> move", "<kbd>Mouse</kbd> aim", "<kbd>Left click</kbd> shoot / slash", "<kbd>Right click</kbd> knife stab",
        "<kbd>Space</kbd> jump", "<kbd>Shift</kbd> walk (quiet)", "<kbd>Ctrl</kbd> / <kbd>C</kbd> crouch", "<kbd>R</kbd> reload",
        "<kbd>1</kbd> AK · <kbd>3</kbd> knife", "<kbd>Q</kbd> / wheel switch", "<kbd>F</kbd> inspect", "<kbd>Tab</kbd> scoreboard", "<kbd>Esc</kbd> pause",
      ].map((s) => "<div>" + s + "</div>").join("");
      keys.appendChild(k);
      const goWrap = el("div");
      const go = el("button", "pb-go", "PLAY ▶");
      if (!you || !opp) { go.disabled = true; go.style.opacity = 0.4; }
      go.addEventListener("click", () => {
        settings.player = you.id; settings.opponent = opp.id;
        saveSettings(settings);
        startMatch();
      });
      goWrap.append(go, el("div", "pb-vs", you && opp ? (you.name + " vs " + opp.name) : "You need at least 2 Miis"));
      bottom.append(setBox, keys, goWrap);
      lob.append(head, cols, bottom);
      rootEl.appendChild(lob);
    }

    async function startMatch() {
      rootEl.innerHTML = "";
      const load = el("div", "pb-loading", "LOADING SHIPMENT");
      load.appendChild(el("i"));
      rootEl.appendChild(load);
      await new Promise((r) => setTimeout(r, 30));
      try {
        const [tYou, tOpp] = await Promise.all([opts.templateFor(you), opts.templateFor(opp)]);
        match = new Match({
          root: rootEl, opts, settings, you, opp, tYou, tOpp,
          onExit: (to) => { if (to === "lobby") showLobby(); else close(); },
          onRematch: () => startMatch(),
        });
        load.remove();
        current.match = match;
        root.__pb = match; // for tests
      } catch (err) {
        console.error(err);
        load.textContent = "Couldn't start Paintball: " + err.message;
        setTimeout(showLobby, 2500);
      }
    }

    current = { close, match: null };
    showLobby();
    return current;
  }

  // the sliders and buttons for sensitivity, volume and crosshair
  function settingsControls(box, settings, onChange) {
    const slider = (label, key, min, max, step, fmt) => {
      const row = el("div", "pb-set");
      const val = el("span", "val", fmt(settings[key]));
      const inp = el("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = settings[key];
      inp.addEventListener("input", () => { settings[key] = parseFloat(inp.value); val.textContent = fmt(settings[key]); onChange(key); });
      row.append(el("label", null, label), inp, val);
      box.appendChild(row);
    };
    slider("Sensitivity", "sens", 0.3, 6, 0.05, (v) => v.toFixed(2));
    slider("Volume", "volume", 0, 1, 0.05, (v) => Math.round(v * 100) + "%");
    slider("Crosshair size", "xhSize", 2, 12, 1, (v) => v);
    slider("Crosshair gap", "xhGap", 0, 10, 1, (v) => v);
    const row = el("div", "pb-set");
    row.appendChild(el("label", null, "Crosshair"));
    const sw = el("div", "pb-swatches");
    for (const c of ["#3dff6e", "#ffe94d", "#3de0ff", "#ffffff", "#ff4fd8", "#ff3b30"]) {
      const b = el("button", "pb-sw" + (settings.xhColor === c ? " sel" : ""));
      b.style.background = c;
      b.addEventListener("click", () => { settings.xhColor = c; sw.querySelectorAll(".pb-sw").forEach((n) => n.classList.remove("sel")); b.classList.add("sel"); onChange("xhColor"); });
      sw.appendChild(b);
    }
    const style = el("button", "pb-btn", settings.xhStyle === "dynamic" ? "Dynamic" : "Static");
    style.style.padding = "3px 10px";
    style.addEventListener("click", () => { settings.xhStyle = settings.xhStyle === "dynamic" ? "static" : "dynamic"; style.textContent = settings.xhStyle === "dynamic" ? "Dynamic" : "Static"; onChange("xhStyle"); });
    row.append(sw, style);
    box.appendChild(row);
  }

  // =====================================================================
  // A match
  // =====================================================================
  class Match {
    constructor(o) {
      this.o = o;
      this.opts = o.opts;
      this.settings = o.settings;
      this.rootEl = o.root;
      this.now = 0;
      this.disposed = false;
      this.paused = false;
      this.phase = "freeze";
      this.phaseEnd = 0;
      this.round = 0;
      this.score = { you: 0, bot: 0 };
      this.timers = [];
      this.keys = new Set();
      this.mouse = { left: false, right: false, dx: 0, dy: 0, swayX: 0, swayY: 0 };
      this.jumpQueued = false;
      this.botLearned = 0;
      this.build();
      this.bindInput();
      this.startRound();
      this.loop();
    }

    // ------------------------------------------------------------------
    // Setting up the 3D world
    // ------------------------------------------------------------------
    build() {
      const o = this.o;
      const W = this.rootEl;
      const canvas = el("canvas");
      W.appendChild(canvas);
      this.canvas = canvas;
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputEncoding = THREE.sRGBEncoding;
      this.renderer = r;

      // the map
      this.map = root.PBMap.build({});
      this.scene = new THREE.Scene();
      this.scene.add(this.map.group);
      this.scene.background = this.map.background || new THREE.Color(0x6d7884);
      this.scene.fog = this.map.fog || null;
      this.world = new E.World(this.map);
      // the bot finds its way around with the same route-finder Miis use in the hub
      const obstacles = [];
      for (const b of this.map.boxes) if (b.y1 > CFG.step && b.y0 < 1.6) obstacles.push({ x: b.x, z: b.z, w: b.hw * 2, d: b.hd * 2, rot: -(b.rot || 0) });
      for (const c of this.map.cyls) if (c.y1 > CFG.step) obstacles.push({ x: c.x, z: c.z, r: c.r });
      this.nav = new root.MiiNav.Nav(this.map.bounds, obstacles, 0.35);

      this.camera = new THREE.PerspectiveCamera(73.74, 16 / 9, 0.03, 400);
      this.camera.rotation.order = "YXZ";
      this.scene.add(this.camera);

      // first-person hands + gun, drawn on top with their own camera (like CS's viewmodel)
      this.vmScene = new THREE.Scene();
      this.vmCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.01, 10);
      this.vmScene.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a3530, 0.75));
      const sun = new THREE.DirectionalLight(0xfff1dc, 0.9);
      sun.position.set(-0.6, 1, 0.4);
      this.vmScene.add(sun);

      const lookYou = this.opts.lookFor(o.you, o.tYou) || {};
      const lookOpp = this.opts.lookFor(o.opp, o.tOpp) || {};
      const youPaint = paintColor(o.tYou);
      let botPaint = paintColor(o.tOpp);
      if (colorDistance(youPaint, botPaint) < 0.6) botPaint = colorDistance(youPaint, "#ff8a00") > 0.8 ? "#ff8a00" : "#3de0ff";
      this.vm = root.PBModels.createViewmodel({
        accent: youPaint,
        sleeve: hexOf(lookYou.shirt, hexOf(o.tYou.source && o.tYou.source.shirt, "#2b7cff")),
        skin: hexOf(lookYou.skin, hexOf(o.tYou.source && o.tYou.source.skin, "#f2c7a5")),
      });
      this.vmScene.add(this.vm.group);

      this.audio = root.PBAudio.create();
      this.audio.setVolume(this.settings.volume);

      // the fighters
      this.you = this.makeFighter("you", o.you, youPaint);
      this.bot = this.makeFighter("bot", o.opp, botPaint);
      this.you.portrait = this.opts.portraitFor(o.you);
      this.bot.portrait = this.opts.portraitFor(o.opp);

      // the Mii you play against
      const inst = root.MiiModel.createInstance(o.tOpp, lookOpp);
      inst.holder.scale.setScalar(MII_SCALE);
      inst.holder.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; } });
      this.scene.add(inst.holder);
      this.bot.inst = inst;
      this.bot.style = root.MiiHub3D && root.MiiHub3D.animStyle ? root.MiiHub3D.animStyle(o.opp) : null;
      const find = (prefix) => { let f = null; inst.object.traverse((n) => { if (!f && n.isBone && n.name.replace(/_\d+$/, "") === prefix) f = n; }); return f; };
      const B = inst.rig.bones;
      const bone = (k) => (B[k] ? B[k].bone : null);
      this.bot.bones = {
        head: bone("Head"), s1: bone("Spine_1"), s2: bone("Spine_2"),
        a1l: bone("Arm_1_L"), a2l: bone("Arm_2_L"), wl: find("Wrist_L"), a1r: bone("Arm_1_R"), a2r: bone("Arm_2_R"), wr: find("Wrist_R"),
        l1l: bone("Leg_1_L"), l2l: bone("Leg_2_L"), al: find("Ankle_L"), l1r: bone("Leg_1_R"), l2r: bone("Leg_2_R"), ar: find("Ankle_R"),
      };
      this.bot.useBones = ["head", "s1", "s2", "l1l", "l2l", "l1r", "l2r"].every((k) => this.bot.bones[k]);
      this.bot.gun = root.PBModels.createWorldGun(botPaint);
      this.bot.gun.traverse((n) => { if (n.isMesh) n.castShadow = true; });
      this.scene.add(this.bot.gun);
      this.bot.walkPhase = 0;
      this.bot.brain = new E.BotBrain({ world: this.world }, this.bot, this.botSkill(), root.Dialogue ? root.Dialogue.traits(o.opp) : null);
      this.bot.brain.nav = this.nav;

      // paint
      this.splatTex = root.PBModels.splatTextures();
      this.splats = [];
      this.splatMats = new Map();
      this.splatGeo = new THREE.PlaneGeometry(1, 1);
      this.balls = [];
      this.ballGeo = new THREE.SphereGeometry(0.022, 8, 6);
      this.ballGeo.scale(1, 1, 3.5); // a little motion streak

      this.buildHUD();
      this.resize();
      this.onResize = () => this.resize();
      window.addEventListener("resize", this.onResize);
    }

    makeFighter(id, rec, color) {
      return {
        id, rec, name: rec.name || "Mii", color,
        mover: new E.Mover(this.world), arms: new E.Arms(),
        yaw: 0, pitch: 0, hp: 100, alive: true,
        boxes: [], feet: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 }, chest: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 },
        stats: { kills: 0, deaths: 0, hs: 0, dmg: 0, shots: 0, hits: 0 },
        taken: { dmg: 0, hits: 0 }, given: { dmg: 0, hits: 0 },
        flinch: 0, slashAlt: 0, inspecting: false, landed: false,
      };
    }

    botSkill() {
      const st = this.opts.statsFor(this.o.opp);
      return clamp(0.08 + (st.skill / 100) * 0.92, 0, 1);
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
    }

    // ------------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------------
    buildHUD() {
      const hud = el("div", "pb-hud");
      const team = (f, cls) => {
        const t = el("div", "pb-team " + cls);
        t.style.setProperty("--c", f.color);
        const img = el("img"); img.src = f.portrait || ""; img.alt = "";
        const sc = el("b", "sc", "0");
        t.append(img, el("span", "nm", f.name), sc);
        return { t, sc };
      };
      const top = el("div", "pb-top");
      const a = team(this.you, "you"), b = team(this.bot, "opp");
      const clock = el("div", "pb-clock");
      const tm = el("div", "tm", "1:30");
      const pips = el("div", "pb-pips");
      this.pipsYou = []; this.pipsBot = [];
      clock.append(tm, el("div", "sub", "First to " + TO_WIN), pips);
      top.append(a.t, clock, b.t);
      this.hudScoreYou = a.sc; this.hudScoreBot = b.sc; this.hudClock = tm; this.hudPips = pips;

      this.hudFeed = el("div", "pb-feed");
      this.hudXH = el("div", "pb-xh");
      this.hudBanner = el("div", "pb-banner");
      const hp = el("div", "pb-hp");
      this.hudHP = el("b", null, "100");
      const bar = el("div", "bar"); this.hudHPBar = el("i"); bar.appendChild(this.hudHPBar);
      hp.append(el("span", "plus", "✚"), this.hudHP, bar);
      const ammo = el("div", "pb-ammo");
      this.hudMag = el("b", "mag", "30"); this.hudRes = el("span", "res", "/ 90"); this.hudWpn = el("span", "wn", "Paint AK");
      this.hudReload = el("span", "rl", "");
      ammo.append(this.hudMag, this.hudRes, this.hudWpn, this.hudReload);
      this.hudSlots = el("div", "pb-slots");
      this.hudSlotAK = el("span", null, "1 · PAINT AK"); this.hudSlotKnife = el("span", null, "3 · BUTTERFLY KNIFE");
      this.hudSlots.append(this.hudSlotAK, this.hudSlotKnife);
      this.hudHurt = el("div", "pb-hurt");
      this.hudDir = el("div", "pb-dir"); this.hudDirArc = el("i"); this.hudDir.appendChild(this.hudDirArc);
      this.hudSplats = el("div", "pb-splats");
      this.hudBoard = el("div", "pb-board");
      this.hudDeath = el("div", "pb-death");
      this.hudHint = el("div", "pb-hint", "");
      hud.append(this.hudSplats, this.hudHurt, this.hudDir, top, this.hudFeed, this.hudXH, this.hudBanner, hp, ammo, this.hudSlots, this.hudDeath, this.hudHint, this.hudBoard);
      this.rootEl.appendChild(hud);
      this.hud = hud;

      // overlays: click to play, pause menu, results
      this.ovClick = el("div", "pb-overlay");
      const p1 = el("div", "pb-panel");
      p1.append(el("h2", null, "🎯 " + this.you.name + " vs " + this.bot.name), el("p", null, "Click to play. Your mouse controls your aim (press Esc to pause)."));
      const b1 = el("button", "pb-btn primary", "Click to play");
      p1.appendChild(b1);
      this.ovClick.appendChild(p1);
      this.ovClick.addEventListener("click", () => this.lock());

      this.ovPause = el("div", "pb-overlay");
      const p2 = el("div", "pb-panel");
      p2.append(el("h2", null, "Paused"));
      const setBox = el("div");
      settingsControls(setBox, this.settings, (k) => { saveSettings(this.settings); if (k === "volume") this.audio.setVolume(this.settings.volume); this.drawCrosshair(); });
      const btns = el("div", "btns");
      const resume = el("button", "pb-btn primary", "Resume");
      resume.addEventListener("click", (e) => { e.stopPropagation(); this.lock(); });
      const quit = el("button", "pb-btn", "Quit match");
      quit.addEventListener("click", (e) => { e.stopPropagation(); this.quit(); });
      btns.append(resume, quit);
      p2.append(setBox, btns);
      this.ovPause.appendChild(p2);

      this.ovResult = el("div", "pb-overlay");
      this.rootEl.append(this.ovClick, this.ovPause, this.ovResult);
      this.ovClick.classList.add("show");
      this.paused = true;
      this.drawCrosshair();
      this.updateScore();
    }

    drawCrosshair(spread) {
      const s = this.settings;
      const xh = this.hudXH;
      xh.style.setProperty("--xc", s.xhColor);
      const len = s.xhSize * 2, th = 2;
      const gap = s.xhGap + (s.xhStyle === "dynamic" ? Math.min(40, (spread || 0) * 260) : 0);
      if (!xh.children.length) for (let i = 0; i < 4; i++) xh.appendChild(el("i"));
      const [t, b, l, r] = xh.children;
      t.style.cssText = `left:${-th / 2}px;top:${-gap - len}px;width:${th}px;height:${len}px`;
      b.style.cssText = `left:${-th / 2}px;top:${gap}px;width:${th}px;height:${len}px`;
      l.style.cssText = `top:${-th / 2}px;left:${-gap - len}px;width:${len}px;height:${th}px`;
      r.style.cssText = `top:${-th / 2}px;left:${gap}px;width:${len}px;height:${th}px`;
    }

    updateScore() {
      this.hudScoreYou.textContent = this.score.you;
      this.hudScoreBot.textContent = this.score.bot;
      this.hudPips.innerHTML = "";
      this.hudPips.style.setProperty("--c", "#ffb21e");
    }

    banner(big, small, cls, secs) {
      const b = this.hudBanner;
      b.className = "pb-banner show " + (cls || "");
      b.innerHTML = "";
      b.append(el("div", "big", big));
      if (small) b.append(el("div", "small", small));
      clearTimeout(this.bannerT);
      if (secs) this.bannerT = setTimeout(() => b.classList.remove("show"), secs * 1000);
    }

    killFeed(killer, victim, weapon, head) {
      const k = el("div", "pb-kill" + (killer === this.you ? " mine" : ""));
      const a = el("span", null, killer.name); a.style.color = killer.color;
      const v = el("span", null, victim.name); v.style.color = victim.color;
      k.append(a, el("span", "wpn", weapon === "knife" ? "🔪" : "🔫" + (head ? " 🎯" : "")), v);
      this.hudFeed.appendChild(k);
      setTimeout(() => k.remove(), 6000);
      while (this.hudFeed.children.length > 5) this.hudFeed.firstChild.remove();
    }

    renderBoard() {
      const b = this.hudBoard;
      b.innerHTML = "";
      const h = el("h3");
      h.append(el("span", null, "Shipment · Round " + this.round), el("small", null, "First to " + TO_WIN));
      b.appendChild(h);
      const tbl = el("table");
      tbl.innerHTML = "<tr><th>Player</th><th>Rounds</th><th>K</th><th>D</th><th>HS %</th><th>ADR</th><th>Accuracy</th></tr>";
      const rounds = Math.max(1, this.round - (this.phase === "end" ? 0 : 1));
      for (const f of [this.you, this.bot]) {
        const tr = el("tr", f === this.you ? "me" : "");
        const s = f.stats;
        const name = el("td");
        const img = el("img"); img.src = f.portrait || ""; img.alt = "";
        const nm = el("span", null, f.name + (f === this.you ? " (you)" : " · " + root.MiniGames.skillLevel(this.opts.statsFor(this.o.opp).skill)));
        nm.style.color = f.color;
        name.append(img, nm);
        tr.appendChild(name);
        const cells = [f === this.you ? this.score.you : this.score.bot, s.kills, s.deaths, s.kills ? Math.round((s.hs / s.kills) * 100) + "%" : "–", Math.round(s.dmg / rounds), s.shots ? Math.round((s.hits / s.shots) * 100) + "%" : "–"];
        for (const c of cells) tr.appendChild(el("td", null, String(c)));
        tbl.appendChild(tr);
      }
      b.appendChild(tbl);
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------
    lock() {
      this.audio.resume();
      const c = this.canvas;
      try {
        const p = c.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch (e) { /* ignore */ } });
      } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* ignore */ } }
    }
    locked() { return document.pointerLockElement === this.canvas; }

    bindInput() {
      const onLock = () => {
        if (this.disposed) return;
        if (this.locked()) {
          this.paused = false;
          this.ovClick.classList.remove("show");
          this.ovPause.classList.remove("show");
        } else if (!this.over) {
          this.paused = true;
          this.keys.clear(); this.mouse.left = this.mouse.right = false;
          this.ovPause.classList.add("show");
        }
      };
      const onMove = (e) => {
        if (!this.locked() || this.paused) return;
        const k = this.settings.sens * 0.022 * DEG;
        const f = this.you;
        if (!f.alive) return;
        f.yaw -= e.movementX * k;
        f.pitch = clamp(f.pitch - e.movementY * k, -89 * DEG, 89 * DEG);
        this.mouse.swayX += e.movementX; this.mouse.swayY += e.movementY;
      };
      const onDown = (e) => {
        if (!this.locked()) return;
        if (e.button === 0) this.mouse.left = true;
        if (e.button === 2) this.mouse.right = true;
        this.cancelInspect();
      };
      const onUp = (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      };
      const onKey = (e) => {
        if (this.disposed) return;
        const code = e.code;
        if (code === "Tab") { e.preventDefault(); this.renderBoard(); this.hudBoard.classList.add("show"); }
        if (!this.locked()) return;
        e.preventDefault(); e.stopPropagation();
        if (e.repeat) return;
        this.keys.add(code);
        if (code === "Space") this.jumpQueued = true;
        if (code === "KeyR") this.wantReload = true;
        if (code === "Digit1") this.wantSwitch = "ak";
        if (code === "Digit3" || code === "Digit2") this.wantSwitch = "knife";
        if (code === "KeyQ") this.wantSwitch = this.you.arms.weapon === "ak" ? "knife" : "ak";
        if (code === "KeyF") this.wantInspect = true;
      };
      const onKeyUp = (e) => {
        this.keys.delete(e.code);
        if (e.code === "Tab") { e.preventDefault(); this.hudBoard.classList.remove("show"); }
      };
      const onWheel = (e) => {
        if (!this.locked()) return;
        e.preventDefault();
        this.wantSwitch = this.you.arms.weapon === "ak" ? "knife" : "ak";
      };
      const noMenu = (e) => e.preventDefault();
      document.addEventListener("pointerlockchange", onLock);
      document.addEventListener("mousemove", onMove);
      this.canvas.addEventListener("mousedown", onDown);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("keyup", onKeyUp, true);
      this.canvas.addEventListener("wheel", onWheel, { passive: false });
      this.rootEl.addEventListener("contextmenu", noMenu);
      this.unbind = () => {
        document.removeEventListener("pointerlockchange", onLock);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("keyup", onKeyUp, true);
      };
    }

    cancelInspect() { /* the viewmodel cancels inspecting on any other action */ }

    // ------------------------------------------------------------------
    // Rounds
    // ------------------------------------------------------------------
    startRound() {
      this.round++;
      this.phase = "freeze";
      this.phaseEnd = this.now + FREEZE;
      this.roundEnd = this.phaseEnd + ROUND_TIME;
      const swap = this.round % 2 === 0;
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      const sa = pick(this.map.spawns.a), sb = pick(this.map.spawns.b);
      const spYou = swap ? sb : sa, spBot = swap ? sa : sb;
      for (const [f, sp] of [[this.you, spYou], [this.bot, spBot]]) {
        f.mover.place(sp.x, sp.z);
        f.yaw = sp.yaw; f.pitch = 0;
        f.hp = 100; f.alive = true;
        f.arms.reset();
        f.taken = { dmg: 0, hits: 0 }; f.given = { dmg: 0, hits: 0 };
        f.killer = null;
      }
      this.bot.brain.setSkill(this.botSkill(), root.Dialogue ? root.Dialogue.traits(this.o.opp) : null);
      this.bot.brain.resetRound();
      this.bot.dead = 0;
      this.bot.inst.holder.rotation.set(0, 0, 0);
      this.bot.gun.visible = true;
      this.clearMiiSplats();
      this.vm.setWeapon("ak");
      this.vm.group.visible = true;
      this.hudDeath.classList.remove("show");
      this.deathCam = null;
      this.banner("ROUND " + this.round, this.score.you + " – " + this.score.bot + (this.round > 1 ? "" : " · first to " + TO_WIN), "", FREEZE);
      this.updateScore();
    }

    endRound(winner, why) {
      if (this.phase === "end") return;
      this.phase = "end";
      this.phaseEnd = this.now + END_DELAY;
      if (winner === this.you) this.score.you++;
      else if (winner === this.bot) this.score.bot++;
      this.updateScore();
      // the Mii learns a little every round (a bit more when it loses)
      const st = this.opts.statsFor(this.o.opp);
      if (winner && root.MiniGames && root.MiniGames.learn) {
        const before = st.skill;
        root.MiniGames.learn(st, "paintball", winner === this.you);
        this.botLearned += st.skill - before;
        this.opts.onSave(this.o.opp);
      }
      const matchOver = this.score.you >= TO_WIN || this.score.bot >= TO_WIN;
      if (winner === this.you) { this.banner(matchOver ? "VICTORY" : "ROUND WON", why || "", "win"); this.audio.play(matchOver ? "matchWin" : "roundWin"); }
      else if (winner === this.bot) { this.banner(matchOver ? "DEFEAT" : "ROUND LOST", why || "", "lose"); this.audio.play(matchOver ? "matchLose" : "roundLose"); }
      else this.banner("DRAW", why || "Time's up", "");
      if (matchOver) this.phaseEnd = this.now + 3;
    }

    // ------------------------------------------------------------------
    // The game loop
    // ------------------------------------------------------------------
    loop() {
      let last = performance.now();
      let acc = 0;
      const frame = (t) => {
        if (this.disposed) return;
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        if (!this.paused) {
          acc += dt;
          let n = 0;
          while (acc >= TICK && n < 16) { this.tick(TICK); acc -= TICK; n++; }
          if (n >= 16) acc = 0;
        }
        this.draw(dt);
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }

    tick(dt) {
      this.now += dt;
      const now = this.now;
      // timers (sounds during reloads etc.)
      if (this.timers.length) {
        for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= now) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
      }

      if (this.phase === "freeze" && now >= this.phaseEnd) {
        this.phase = "live";
        this.banner("GO!", "", "", 0.8);
        this.audio.play("roundStart");
      } else if (this.phase === "live" && now >= this.roundEnd) {
        this.endRound(null, "Time's up");
      } else if (this.phase === "end" && now >= this.phaseEnd) {
        if (this.score.you >= TO_WIN || this.score.bot >= TO_WIN) { this.finishMatch(); return; }
        this.startRound();
        return;
      }
      const frozen = this.phase === "freeze";

      // ---- you ----
      const y = this.you;
      if (y.alive) {
        const K = this.keys;
        const inp = {
          fwd: (K.has("KeyW") ? 1 : 0) - (K.has("KeyS") ? 1 : 0),
          side: (K.has("KeyD") ? 1 : 0) - (K.has("KeyA") ? 1 : 0),
          yaw: y.yaw,
          walk: K.has("ShiftLeft") || K.has("ShiftRight"),
          duck: K.has("ControlLeft") || K.has("ControlRight") || K.has("KeyC"),
          jump: this.jumpQueued,
          maxSpeed: y.arms.weapon === "knife" ? CFG.speedKnife : CFG.speedAK,
          frozen,
        };
        this.jumpQueued = false;
        y.mover.step(dt, inp);
        this.moverEvents(y);
        this.useWeapons(y, {
          fire: this.mouse.left && !frozen, alt: this.mouse.right && !frozen,
          reload: this.wantReload, switchTo: this.wantSwitch, inspect: this.wantInspect,
        }, dt);
        this.wantReload = false; this.wantSwitch = null; this.wantInspect = false;
      } else {
        y.mover.step(dt, { yaw: y.yaw, maxSpeed: CFG.speedAK, frozen: true });
      }
      this.updateTargetInfo(y);

      // ---- the Mii ----
      const b = this.bot;
      if (b.alive) {
        const out = frozen ? { yaw: b.yaw } : b.brain.tick(dt, now, y);
        b.mover.step(dt, {
          fwd: out.fwd || 0, side: out.side || 0, yaw: b.yaw, walk: !!out.walk, duck: !!out.duck, jump: !!out.jump,
          maxSpeed: b.arms.weapon === "knife" ? CFG.speedKnife : CFG.speedAK, frozen,
        });
        this.moverEvents(b);
        this.useWeapons(b, { fire: !!out.fire && !frozen && y.alive && this.phase === "live", reload: !!out.reload, switchTo: out.switchTo }, dt);
      } else {
        b.mover.step(dt, { yaw: b.yaw, maxSpeed: CFG.speedAK, frozen: true });
      }
    }

    moverEvents(f) {
      const m = f.mover;
      f.landed = false;
      for (const ev of m.events) {
        if (ev.type === "step") {
          if (f === this.you) {
            if (ev.loud) this.audio.play("step", { vol: 0.35, rate: 0.9 + Math.random() * 0.2 });
            if (ev.loud && this.bot.alive) this.botHears(m.pos, 24);
          } else if (ev.loud) this.playAt("step", m.pos, 0.9, 0.9 + Math.random() * 0.2);
        } else if (ev.type === "land") {
          f.landed = true;
          f.arms.landPenalty = AK.land * clamp(ev.speed / CFG.jump, 0.3, 1.5);
          if (f === this.you) { this.audio.play("land", { vol: 0.45 }); if (this.bot.alive) this.botHears(m.pos, 20); }
          else this.playAt("land", m.pos, 0.8);
        } else if (ev.type === "jump") {
          if (f === this.you) this.audio.play("jump", { vol: 0.3 });
        }
      }
    }

    botHears(pos, range, loud) {
      const b = this.bot.mover.pos;
      if (Math.hypot(pos.x - b.x, pos.z - b.z) < range) this.bot.brain.hear(pos, this.now, loud);
    }

    // where someone's head/chest are this tick (the bot's hit boxes come from its bones in draw())
    updateTargetInfo(f) {
      const m = f.mover;
      const e = m.eye();
      f.feet.x = m.pos.x; f.feet.y = m.pos.y; f.feet.z = m.pos.z;
      if (f === this.you || !this.bot.useBones || !f.alive) {
        f.head.x = m.pos.x; f.head.y = m.pos.y + e + 0.07; f.head.z = m.pos.z;
        f.chest.x = m.pos.x; f.chest.y = m.pos.y + e - 0.55; f.chest.z = m.pos.z;
        f.center.x = m.pos.x; f.center.y = m.pos.y + e - 0.6; f.center.z = m.pos.z;
        if (f === this.you || !this.bot.useBones) E.bodyBoxes(m.pos, e, f.yaw, f.boxes);
      }
    }

    // ------------------------------------------------------------------
    // Weapons
    // ------------------------------------------------------------------
    useWeapons(f, want, dt) {
      const a = f.arms, now = this.now, me = f === this.you;
      if (E.updateArms(a, f.mover, dt, now) === "reloaded" && me) { /* the HUD shows it */ }
      // switching
      if (want.switchTo && want.switchTo !== a.weapon) {
        a.last = a.weapon;
        a.weapon = want.switchTo;
        a.reloadEnd = 0;
        a.ready = now + (a.weapon === "ak" ? AK.deploy : KNIFE.deploy);
        if (me) { this.vm.setWeapon(a.weapon); this.audio.play(a.weapon === "ak" ? "deploy" : "knifeDeploy", { vol: 0.6 }); }
      }
      if (want.inspect && me && !a.reloading(now) && now >= a.ready) this.vm.inspect();
      // reloading
      const startReload = () => {
        if (a.weapon !== "ak" || a.reloading(now) || a.ammo >= AK.mag || a.reserve <= 0) return;
        const empty = a.ammo === 0;
        a.reloadEnd = now + AK.reload;
        a.ready = Math.max(a.ready, a.reloadEnd);
        if (me) {
          this.vm.reload(empty);
          this.later(0.35, () => this.audio.play("magOut", { vol: 0.7 }));
          this.later(1.45, () => this.audio.play("magIn", { vol: 0.7 }));
          if (empty) this.later(2.05, () => this.audio.play("bolt", { vol: 0.7 }));
        } else {
          this.later(0.35, () => this.playAt("magOut", f.mover.pos, 0.6));
          this.later(1.45, () => this.playAt("magIn", f.mover.pos, 0.6));
        }
      };
      if (want.reload) startReload();
      if (a.weapon === "ak") {
        if (want.fire && now >= a.ready && !a.reloading(now)) {
          if (a.ammo > 0) {
            a.ammo--;
            // keep an exact 600 shots a minute while the trigger is held
            a.ready = (now - a.ready < TICK * 1.5 ? a.ready : now) + AK.cycle;
            const dir = E.shotDirection(f, now);
            this.shoot(f, dir);
            if (!me) f.brain.onShot();
          } else {
            a.ready = now + 0.2;
            if (me) { this.vm.dryFire(); this.audio.play("dry", { vol: 0.6 }); }
            startReload();
          }
        }
      } else if ((want.fire || want.alt) && now >= a.ready) {
        this.knife(f, !!want.alt && !want.fire);
      }
    }

    later(secs, fn) { this.timers.push({ t: this.now + secs, fn }); }

    eyeOf(f) { const m = f.mover; return { x: m.pos.x, y: m.pos.y + m.eye(), z: m.pos.z }; }
    other(f) { return f === this.you ? this.bot : this.you; }

    shoot(f, dir) {
      const me = f === this.you;
      const eye = this.eyeOf(f);
      const target = this.other(f);
      const wh = this.world.ray(eye, dir, 120);
      const maxT = wh ? wh.t : 120;
      const hb = target.alive ? E.rayHitboxes(eye, dir, target.boxes, maxT) : null;
      f.stats.shots++;
      const endT = hb ? hb.t : maxT;
      const end = { x: eye.x + dir.x * endT, y: eye.y + dir.y * endT, z: eye.z + dir.z * endT };
      // the paintball flying (from the gun's muzzle)
      let from;
      if (me) {
        const v = this.vm.muzzle(new THREE.Vector3());
        // the viewmodel has its own camera; map its muzzle into the world roughly
        this.camera.updateMatrixWorld();
        from = v.applyMatrix4(this.camera.matrixWorld);
        this.vm.fire();
        this.audio.play("ak", { vol: 0.8, rate: 0.96 + Math.random() * 0.08 });
      } else {
        from = this.botMuzzle();
        const d = Math.hypot(eye.x - this.you.mover.pos.x, eye.z - this.you.mover.pos.z);
        this.playAt(d > 18 ? "akFar" : "ak", eye, 0.9, 0.95 + Math.random() * 0.1);
      }
      this.launchBall(from, end, f.color);
      if (me && this.bot.alive) this.botHears(eye, 999, true);
      if (hb) {
        const dist = hb.t;
        this.hit(f, target, hb.zone, E.damageFor(hb.zone, dist), end, dir, "ak", hb.box);
      } else if (wh) {
        this.later(endT / 140, () => {
          this.splat(end, { x: wh.nx, y: wh.ny, z: wh.nz }, f.color, 0.22 + Math.random() * 0.14);
          this.playAt(wh.mat === "wood" ? "hitWood" : "hitWall", end, 0.5);
        });
      }
    }

    knife(f, heavy) {
      const a = f.arms, now = this.now, me = f === this.you;
      const target = this.other(f);
      const eye = this.eyeOf(f);
      const dir = E.forward(f.yaw, f.pitch);
      const range = heavy ? KNIFE.stab.range : KNIFE.slash.range;
      const wall = this.world.ray(eye, dir, range + 0.5);
      let hb = target.alive ? E.rayHitboxes(eye, dir, target.boxes, wall ? wall.t : range + 0.5) : null;
      if (hb && hb.t > range + 0.35) hb = null;
      if (!hb && target.alive) {
        // a wide swing still catches someone right in front of you
        const tc = target.chest;
        const dx = tc.x - eye.x, dy = tc.y - eye.y, dz = tc.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < range + 0.45 && (dx * dir.x + dy * dir.y + dz * dir.z) / d > 0.88 && this.world.clear(eye, tc)) hb = { t: d, zone: "chest", box: null };
      }
      if (me) {
        if (heavy) this.vm.stab(); else { this.vm.slash(f.slashAlt); f.slashAlt ^= 1; }
        this.audio.play(heavy ? "stab" : "slash", { vol: 0.7 });
      }
      if (hb) {
        // stabbing them in the back does a lot more
        const tf = E.forward(target.yaw, 0), af = E.forward(f.yaw, 0);
        const back = tf.x * af.x + tf.z * af.z > 0.475;
        let dmg;
        if (heavy) dmg = back ? KNIFE.stab.back : KNIFE.stab.damage;
        else dmg = back ? KNIFE.slash.back : now - a.lastSlash < 1.2 ? KNIFE.slash.next : KNIFE.slash.first;
        a.lastSlash = now;
        a.ready = now + (heavy ? KNIFE.stab.hit : KNIFE.slash.hit);
        const p = { x: eye.x + dir.x * hb.t, y: eye.y + dir.y * hb.t, z: eye.z + dir.z * hb.t };
        this.hit(f, target, hb.zone === "head" ? "chest" : hb.zone, dmg, p, dir, "knife", hb.box, back);
        this.audio.play("knifeHit", { vol: 0.8 });
      } else {
        a.ready = now + (heavy ? KNIFE.stab.miss : KNIFE.slash.miss);
        if (wall && wall.t < range) this.playAt("hitWall", eye, 0.4);
      }
    }

    hit(attacker, victim, zone, dmg, point, dir, weapon, box, back) {
      if (!victim.alive) return;
      const before = victim.hp;
      victim.hp = Math.max(0, victim.hp - dmg);
      const dealt = before - victim.hp;
      attacker.stats.dmg += dealt; attacker.stats.hits++;
      attacker.given.dmg += dealt; attacker.given.hits++;
      victim.taken.dmg += dealt; victim.taken.hits++;
      // getting hit slows you down ("tagging") and knocks your aim
      const v = victim.mover.vel;
      if (victim.mover.onGround) { v.x *= 0.45; v.z *= 0.45; }
      victim.arms.recY += zone === "head" ? 1.2 : 0.6;
      victim.flinch = 1;
      if (victim === this.bot) {
        this.bot.brain.hear(attacker.mover.pos, this.now, true);
        this.splatOnMii(point, box, attacker.color);
        if (attacker === this.you) this.audio.play(zone === "head" ? "hitHead" : "hitBody", { vol: zone === "head" ? 1 : 0.7 });
      } else {
        this.screenSplat(attacker.color, zone === "head" ? 1.4 : 1);
        this.audio.play(zone === "head" ? "hitHead" : "hurt", { vol: 0.8 });
        this.hurtFrom(attacker);
      }
      if (victim.hp <= 0) this.kill(attacker, victim, weapon, zone === "head", back);
    }

    kill(attacker, victim, weapon, head, back) {
      victim.alive = false;
      victim.killer = { f: attacker, weapon, head };
      victim.stats.deaths++;
      attacker.stats.kills++;
      if (head) attacker.stats.hs++;
      this.killFeed(attacker, victim, weapon, head);
      if (attacker === this.you) this.audio.play("kill", { vol: 0.9 });
      if (victim === this.bot) {
        this.bot.dead = 0.0001;
        this.bot.gun.visible = false;
      } else {
        this.deathCam = { t: 0, from: this.eyeOf(victim) };
        this.vm.group.visible = false;
        const d = this.hudDeath;
        d.innerHTML = "";
        const who = el("div", "who");
        who.append("Splattered by ");
        const n = el("span", null, attacker.name); n.style.color = attacker.color;
        who.append(n, weapon === "knife" ? (back ? " (backstab 🔪)" : " 🔪") : head ? " 🎯 headshot" : "");
        const dm = el("div", "dmg");
        dm.innerHTML = "Damage taken: <b>" + victim.taken.dmg + "</b> in " + victim.taken.hits + " hit" + (victim.taken.hits === 1 ? "" : "s") +
          " · Damage given: <b>" + victim.given.dmg + "</b> in " + victim.given.hits + " hit" + (victim.given.hits === 1 ? "" : "s") +
          "<br>" + attacker.name + " has <b>" + attacker.hp + "</b> HP left";
        d.append(who, dm);
        d.classList.add("show");
      }
      const why = attacker === this.you
        ? (weapon === "knife" ? "You got " + victim.name + " with the knife!" : head ? "Headshot! 🎯" : victim.name + " got splattered")
        : (weapon === "knife" ? victim.name + " got knifed" : head ? attacker.name + " got you with a headshot" : attacker.name + " splattered you");
      this.endRound(attacker, why);
    }

    hurtFrom(attacker) {
      const h = this.hudHurt;
      h.style.transition = "none"; h.style.opacity = "1";
      void h.offsetWidth;
      h.style.transition = "opacity .9s"; h.style.opacity = "0";
      // red arc pointing toward who shot you
      const me = this.you.mover.pos, a = attacker.mover.pos;
      const ang = Math.atan2(-(a.x - me.x), -(a.z - me.z)) - this.you.yaw;
      const arc = this.hudDirArc;
      arc.style.transition = "none"; arc.style.opacity = "1"; arc.style.transform = "rotate(" + (-ang) + "rad)";
      void arc.offsetWidth;
      arc.style.transition = "opacity 1.4s"; arc.style.opacity = "0";
    }

    // ------------------------------------------------------------------
    // Paint
    // ------------------------------------------------------------------
    splatMat(color, i) {
      const key = color + i;
      if (!this.splatMats.has(key)) {
        this.splatMats.set(key, new THREE.MeshLambertMaterial({
          map: this.splatTex[i], color: new THREE.Color(color), transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        }));
      }
      return this.splatMats.get(key);
    }

    splat(p, n, color, size) {
      const i = Math.floor(Math.random() * this.splatTex.length);
      let m;
      if (this.splats.length >= 180) { m = this.splats.shift(); m.material = this.splatMat(color, i); }
      else { m = new THREE.Mesh(this.splatGeo, this.splatMat(color, i)); m.renderOrder = 1; this.scene.add(m); }
      m.position.set(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012);
      m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
      m.rotateZ(Math.random() * Math.PI * 2);
      m.scale.setScalar(size);
      this.splats.push(m);
    }

    splatOnMii(p, box, color) {
      const b = this.bot;
      const i = Math.floor(Math.random() * this.splatTex.length);
      const m = new THREE.Mesh(this.splatGeo, this.splatMat(color, i));
      // which way the surface faces where it was hit
      let n = { x: 0, y: 1, z: 0 };
      if (box) {
        let c = box.a;
        if (box.b) {
          const ax = box.b.x - box.a.x, ay = box.b.y - box.a.y, az = box.b.z - box.a.z;
          const t = clamp(((p.x - box.a.x) * ax + (p.y - box.a.y) * ay + (p.z - box.a.z) * az) / (ax * ax + ay * ay + az * az || 1), 0, 1);
          c = { x: box.a.x + ax * t, y: box.a.y + ay * t, z: box.a.z + az * t };
        }
        n = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
        const l = Math.hypot(n.x, n.y, n.z) || 1;
        n.x /= l; n.y /= l; n.z /= l;
      }
      m.position.set(p.x + n.x * 0.02, p.y + n.y * 0.02, p.z + n.z * 0.02);
      m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
      m.rotateZ(Math.random() * Math.PI * 2);
      m.scale.setScalar(0.3 + Math.random() * 0.12);
      this.scene.add(m);
      m.updateMatrixWorld();
      // stick it to the body part so it moves with the Mii
      const parent = (box && box.bone) || b.inst.holder;
      parent.attach(m);
      (b.paint = b.paint || []).push(m);
    }

    clearMiiSplats() {
      for (const m of this.bot.paint || []) m.removeFromParent();
      this.bot.paint = [];
    }

    screenSplat(color, scale) {
      const tex = this.splatTex[Math.floor(Math.random() * this.splatTex.length)];
      const src = tex.image;
      const size = Math.round((180 + Math.random() * 160) * scale);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      g.drawImage(src, 0, 0, size, size);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, size, size);
      const W = window.innerWidth, H = window.innerHeight;
      // mostly around the edges so you can still see
      const edge = Math.random();
      const x = edge < 0.5 ? (Math.random() < 0.5 ? -size * 0.3 : W - size * 0.7) : Math.random() * (W - size);
      const y = edge < 0.5 ? Math.random() * (H - size) : (Math.random() < 0.5 ? -size * 0.3 : H - size * 0.7);
      c.style.left = x + "px"; c.style.top = y + "px"; c.style.opacity = "0.85";
      c.style.transform = "rotate(" + Math.random() * 360 + "deg)";
      this.hudSplats.appendChild(c);
      setTimeout(() => { c.style.opacity = "0"; }, 700);
      setTimeout(() => c.remove(), 2600);
    }

    launchBall(from, to, color) {
      let b = this.balls.find((x) => !x.visible);
      if (!b) {
        if (this.balls.length > 40) b = this.balls[0];
        else { b = new THREE.Mesh(this.ballGeo, root.PBModels.paintBallMaterial(color)); this.scene.add(b); this.balls.push(b); }
      }
      if (b.userData.color !== color) { b.material = root.PBModels.paintBallMaterial(color); b.userData.color = color; }
      const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      b.userData.from = from.clone ? from.clone() : new THREE.Vector3(from.x, from.y, from.z);
      b.userData.to = new THREE.Vector3(to.x, to.y, to.z);
      b.userData.t = 0; b.userData.dur = Math.max(0.02, d / 140);
      b.position.copy(b.userData.from);
      b.lookAt(b.userData.to);
      b.visible = true;
    }

    // ------------------------------------------------------------------
    // Sounds from somewhere in the world
    // ------------------------------------------------------------------
    playAt(name, pos, vol, rate) {
      const cam = this.camera.position;
      const dx = pos.x - cam.x, dz = pos.z - cam.z;
      const d = Math.hypot(dx, pos.y - cam.y, dz);
      const v = (vol || 1) * clamp(1.2 / (1 + d * 0.09), 0.08, 1);
      const yaw = this.you.yaw;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const pan = d > 0.3 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85 : 0;
      this.audio.play(name, { vol: v, pan, rate: rate || 1 });
    }

    // ------------------------------------------------------------------
    // Drawing a frame
    // ------------------------------------------------------------------
    botMuzzle() {
      const g = this.bot.gun;
      g.updateMatrixWorld();
      return new THREE.Vector3(0, 0.08, 0.8).applyMatrix4(g.matrixWorld);
    }

    draw(dt) {
      const y = this.you, b = this.bot;
      const t = performance.now() / 1000;

      // ---- the camera is your eyes ----
      const cam = this.camera;
      if (this.deathCam) {
        // you got splattered: drop down and look at who did it
        const dc = this.deathCam;
        dc.t = Math.min(1, dc.t + dt * 1.6);
        const e = dc.from;
        cam.position.set(e.x, lerp(e.y, y.mover.pos.y + 0.45, dc.t * dc.t), e.z);
        const k = b.mover.pos;
        const ang = E.anglesTo(cam.position, { x: k.x, y: k.y + 1.2, z: k.z });
        y.yaw += E.wrapAngle(ang.yaw - y.yaw) * Math.min(1, dt * 4);
        y.pitch += (ang.pitch - y.pitch) * Math.min(1, dt * 4);
        cam.rotation.set(y.pitch, y.yaw, 0.35 * dc.t);
      } else {
        const m = y.mover;
        cam.position.set(m.pos.x, m.pos.y + m.eye(), m.pos.z);
        y.flinch = Math.max(0, y.flinch - dt * 6);
        const a = y.arms;
        // CS shows 45% of the recoil on your view (bullets go where the full recoil points)
        cam.rotation.set(y.pitch + a.recY * DEG * 0.45 + y.flinch * 0.012, y.yaw - a.recX * DEG * 0.45, 0);
      }

      // ---- the Mii ----
      const inst = b.inst, m = b.mover;
      const spd = m.speed2d();
      const walk = clamp(spd / (CFG.speedAK * 0.75), 0, 1);
      const stepLen = inst.rig.stepLength(b.style) * MII_SCALE;
      b.walkPhase += (spd * dt) / Math.max(0.3, stepLen) * Math.PI;
      const knife = b.arms.weapon === "knife";
      inst.rig.pose({
        t, dt, walk, phase: b.walkPhase, style: b.style, arms: b.dead ? "down" : knife ? "knife" : "aim",
        crouch: m.duck, aimPitch: b.pitch, lookUp: b.pitch * 0.5,
      });
      const h = inst.holder;
      h.position.set(m.pos.x, m.pos.y - inst.rig.drop * MII_SCALE, m.pos.z);
      if (b.dead) {
        // falls over backwards, covered in paint
        b.dead = Math.min(1, b.dead + dt * 2.4);
        const e = 1 - Math.pow(1 - b.dead, 3);
        h.rotation.set(-e * 1.45, b.yaw + Math.PI, 0, "YXZ");
      } else {
        h.rotation.set(0, b.yaw + Math.PI, 0, "YXZ");
      }
      h.updateMatrixWorld(true);
      if (b.alive) this.botHitboxes();
      // the gun sits in the right hand, pointing where the Mii aims
      if (b.gun.visible) {
        const wr = b.bones.wr || b.bones.a2r;
        const v = new THREE.Vector3();
        if (wr) wr.getWorldPosition(v); else v.set(m.pos.x, m.pos.y + 1.1, m.pos.z);
        b.gun.position.copy(v);
        b.gun.rotation.set(-b.pitch, b.yaw + Math.PI, 0, "YXZ");
        const fw = E.forward(b.yaw, b.pitch);
        b.gun.position.x += fw.x * 0.05; b.gun.position.z += fw.z * 0.05;
      }

      // ---- flying paintballs ----
      for (const ball of this.balls) {
        if (!ball.visible) continue;
        const u = ball.userData;
        u.t += dt;
        const k = Math.min(1, u.t / u.dur);
        ball.position.lerpVectors(u.from, u.to, k);
        if (k >= 1) ball.visible = false;
      }

      // ---- your hands and gun ----
      const ym = y.mover;
      const yspd = ym.speed2d();
      y.walkPhase = (y.walkPhase || 0) + yspd * dt * 2.1;
      this.mouse.swayX *= 0.5; this.mouse.swayY *= 0.5;
      this.vm.update(dt, {
        speed: ym.onGround ? clamp(yspd / CFG.speedKnife, 0, 1) : 0, phase: y.walkPhase,
        swayX: this.mouse.swayX, swayY: this.mouse.swayY, crouch: ym.duck, airborne: !ym.onGround, landed: y.landed, t,
      });
      y.landed = false;

      if (this.map.update) this.map.update(t);

      const r = this.renderer;
      r.autoClear = true;
      r.render(this.scene, cam);
      if (this.vm.group.visible) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.vmScene, this.vmCamera);
        r.autoClear = true;
      }
      this.updateHUD();
    }

    // the Mii's hit boxes follow its bones (crouching, leaning...)
    botHitboxes() {
      const b = this.bot, B = b.bones, out = b.boxes;
      out.length = 0;
      const k = MII_SCALE;
      if (!b.useBones) { E.bodyBoxes(b.mover.pos, b.mover.eye(), b.yaw, out); return; }
      const P = (bone) => { const v = new THREE.Vector3(); bone.getWorldPosition(v); return v; };
      const head = P(B.head), s1 = P(B.s1), s2 = P(B.s2);
      const hc = head.clone(); hc.y += 0.36 * k;
      const fw = E.forward(b.yaw, 0);
      hc.x += fw.x * 0.02 * k; hc.z += fw.z * 0.02 * k;
      out.push({ zone: "head", a: hc, r: 0.33 * k, bone: B.head });
      out.push({ zone: "chest", a: s2, b: head, r: 0.17 * k, bone: B.s2 });
      const hip = s1.clone(); hip.y -= 0.08 * k;
      out.push({ zone: "stomach", a: hip, b: s2, r: 0.17 * k, bone: B.s1 });
      const limb = (a, bb, c, r, zone) => {
        if (!a || !bb) return;
        const pa = P(a), pb = P(bb);
        out.push({ zone, a: pa, b: pb, r: r * k, bone: a });
        if (c) out.push({ zone, a: pb, b: P(c), r: r * k * 0.9, bone: bb });
      };
      limb(B.a1l, B.a2l, B.wl, 0.075, "arm"); limb(B.a1r, B.a2r, B.wr, 0.075, "arm");
      limb(B.l1l, B.l2l, B.al, 0.095, "leg"); limb(B.l1r, B.l2r, B.ar, 0.095, "leg");
      b.head.x = hc.x; b.head.y = hc.y; b.head.z = hc.z;
      b.chest.x = (s2.x + head.x) / 2; b.chest.y = (s2.y + head.y) / 2; b.chest.z = (s2.z + head.z) / 2;
      b.center.copy ? b.center.copy(s2) : Object.assign(b.center, { x: s2.x, y: s2.y, z: s2.z });
    }

    updateHUD() {
      const y = this.you, a = y.arms;
      const now = this.now;
      // clock
      let secs = this.phase === "freeze" ? this.phaseEnd - now : this.phase === "live" ? this.roundEnd - now : 0;
      secs = Math.max(0, Math.ceil(secs));
      const txt = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
      if (this.hudClock.textContent !== txt) {
        this.hudClock.textContent = txt;
        this.hudClock.classList.toggle("low", this.phase === "live" && secs <= 10);
        if (this.phase === "live" && secs <= 5 && secs > 0) this.audio.play("tick", { vol: 0.4 });
      }
      const hp = String(y.hp);
      if (this.hudHP.textContent !== hp) {
        this.hudHP.textContent = hp;
        this.hudHP.classList.toggle("low", y.hp <= 30);
        this.hudHPBar.style.width = y.hp + "%";
      }
      const ak = a.weapon === "ak";
      const mag = ak ? String(a.ammo) : "–";
      if (this.hudMag.textContent !== mag) { this.hudMag.textContent = mag; this.hudMag.classList.toggle("low", ak && a.ammo <= 5); }
      const res = ak ? "/ " + a.reserve : "";
      if (this.hudRes.textContent !== res) this.hudRes.textContent = res;
      const wn = ak ? "Paint AK" : "Butterfly Knife";
      if (this.hudWpn.textContent !== wn) this.hudWpn.textContent = wn;
      const rl = a.reloading(now) ? "RELOADING" : ak && a.ammo === 0 && a.reserve === 0 ? "NO PAINT" : "";
      if (this.hudReload.textContent !== rl) this.hudReload.textContent = rl;
      this.hudSlotAK.classList.toggle("on", ak);
      this.hudSlotKnife.classList.toggle("on", !ak);
      if (this.settings.xhStyle === "dynamic") this.drawCrosshair(ak ? E.inaccuracy(y.mover, a) : 0);
      this.hudXH.style.display = y.alive && !this.hudBoard.classList.contains("show") ? "" : "none";
      if (this.hudBoard.classList.contains("show") && (!this.boardT || now - this.boardT > 0.5)) { this.boardT = now; this.renderBoard(); }
    }

    // ------------------------------------------------------------------
    // The end
    // ------------------------------------------------------------------
    finishMatch() {
      if (this.over) return;
      this.over = true;
      this.paused = true;
      if (document.exitPointerLock && this.locked()) document.exitPointerLock();
      const won = this.score.you > this.score.bot;
      const result = won ? "you" : "mii";
      const st = this.opts.statsFor(this.o.opp);
      st.played = (st.played || 0) + 1;
      if (won) st.losses = (st.losses || 0) + 1; else st.wins = (st.wins || 0) + 1;
      this.opts.onSave(this.o.opp);
      if (this.opts.onFinish) this.opts.onFinish({ result, you: this.o.you, opp: this.o.opp, score: Object.assign({}, this.score) });

      const ov = this.ovResult;
      ov.innerHTML = "";
      const p = el("div", "pb-panel pb-result");
      p.append(el("div", "big " + (won ? "win" : "lose"), won ? "VICTORY" : "DEFEAT"), el("div", "score", this.score.you + " – " + this.score.bot));
      const tbl = el("table");
      tbl.innerHTML = "<tr><th></th><th>K</th><th>D</th><th>HS %</th><th>ADR</th><th>Acc.</th></tr>";
      for (const f of [this.you, this.bot]) {
        const s = f.stats;
        const tr = el("tr");
        const n = el("td", null, f.name); n.style.color = f.color;
        tr.appendChild(n);
        for (const c of [s.kills, s.deaths, s.kills ? Math.round((s.hs / s.kills) * 100) + "%" : "–", Math.round(s.dmg / Math.max(1, this.round)), s.shots ? Math.round((s.hits / s.shots) * 100) + "%" : "–"]) tr.appendChild(el("td", null, String(c)));
        tbl.appendChild(tr);
      }
      p.appendChild(tbl);
      const G = root.MiniGames;
      if (G && G.talk && root.Dialogue) {
        const line = G.talk(won ? "loseMatch" : "winMatch", root.Dialogue.traits(this.o.opp));
        p.appendChild(el("div", "say", this.bot.name + ": “" + line + "”"));
      }
      p.appendChild(el("div", "grow", this.botLearned >= 0.5
        ? this.bot.name + " got better at Paintball! +" + this.botLearned.toFixed(0) + " skill (" + G.skillLevel(st.skill) + ")"
        : this.bot.name + "'s Paintball skill: " + G.skillLevel(st.skill)));
      const btns = el("div", "btns");
      const again = el("button", "pb-btn primary", "Rematch");
      again.addEventListener("click", () => this.o.onRematch());
      const lobby = el("button", "pb-btn", "Change Miis");
      lobby.addEventListener("click", () => this.o.onExit("lobby"));
      const hub = el("button", "pb-btn", "Back to the hub");
      hub.addEventListener("click", () => this.o.onExit("hub"));
      btns.append(again, lobby, hub);
      p.appendChild(btns);
      ov.appendChild(p);
      ov.classList.add("show");
    }

    quit() {
      this.over = true;
      if (document.exitPointerLock && this.locked()) document.exitPointerLock();
      this.o.onExit("lobby");
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      cancelAnimationFrame(this.raf);
      if (this.unbind) this.unbind();
      window.removeEventListener("resize", this.onResize);
      if (document.exitPointerLock && this.locked()) document.exitPointerLock();
      try { this.vm.dispose(); } catch (e) { /* ignore */ }
      try { this.map.dispose(); } catch (e) { /* ignore */ }
      try { this.audio.dispose(); } catch (e) { /* ignore */ }
      if (root.MiiModel && root.MiiModel.disposeObject) root.MiiModel.disposeObject(this.bot.inst.holder);
      for (const m of this.splatMats.values()) m.dispose();
      this.splatGeo.dispose(); this.ballGeo.dispose();
      for (const t of this.splatTex) t.dispose();
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
      if (root.__pb === this) root.__pb = null;
    }
  }

  root.Paintball = { open, Match, TO_WIN };
})(window);
