/*
 * paintball/pb-game.js
 * Paintball: a first-person shooter on Shipment, against one of your Miis
 * or online against other people (pb-online.js + the server in /server).
 *
 *   Lobby   "VS a Mii": pick the Mii you play as and the Mii you play against.
 *           "Online": connect to a server, make or join a room.
 *   Modes   Respawn: you're back 2 s after being splattered, first to 20
 *           eliminations wins (or the most after 10 minutes).
 *           Rounds (VS a Mii only): first to 10 rounds, 3 s freeze + 1:30 each.
 *   HUD     HP, ammo, clock + score, kill feed, crosshair,
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
  const TO_WIN = 10;            // rounds mode
  const RESPAWN_TO_WIN = 20;    // respawn mode: eliminations
  const RESPAWN = 2;            // seconds before you're back in
  const TIME_LIMIT = 600;       // respawn mode: 10 minutes
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
  const DEFAULTS = { mode: "respawn", tab: "mii", server: "", fov: 90, sens: 2.0, volume: 0.7, xhColor: "#3dff6e", xhStyle: "static", xhSize: 5, xhGap: 3, player: null, opponent: null };
  function loadSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* private window */ } }

  // Field of view works like CS's: the number is how wide you see on a 4:3
  // screen (90 = CS default). Wider screens see a bit more to the sides.
  function verticalFov(fov) {
    const h = clamp(fov || 90, 60, 150) * DEG;
    return 2 * Math.atan(Math.tan(h / 2) / (4 / 3)) / DEG;
  }

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
.pb-ammo{right:16px;background:linear-gradient(270deg,#0b0e12d0,#0b0e1200)}
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
.pb-tabs{display:flex;gap:6px;background:#ffffff0d;padding:4px;border-radius:12px}
.pb-tab{background:none;border:0;color:#fff;opacity:.65;padding:8px 16px;border-radius:9px;font-weight:800}
.pb-tab.on{background:#ffb21e;color:#2a1600;opacity:1}
.pb-modes{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.pb-mode{background:#ffffff0d;border:2px solid #ffffff1a;color:#fff;border-radius:12px;padding:7px 12px;text-align:left}
.pb-mode b{display:block;font-size:15px}.pb-mode span{font-size:12px;opacity:.7}
.pb-mode.on{border-color:#ffb21e;background:#ffb21e22}
.pb-net{position:absolute;top:14px;left:14px;font-size:12px;opacity:.6;font-weight:700}
.pb-kill.note{opacity:.8;font-weight:700}
.pb-death .again{margin-top:8px;font-size:16px;color:#ffb21e}
.pb-online{display:grid;grid-template-columns:1fr 1.2fr;gap:22px}
.pb-online input[type=text]{width:100%;box-sizing:border-box;background:#0b0e12;border:1px solid #ffffff2a;color:#fff;border-radius:10px;padding:10px 12px;font:inherit}
.pb-row{display:flex;gap:8px;align-items:center;margin:8px 0}
.pb-row input{flex:1}
.pb-status{font-size:13px;opacity:.8;margin:6px 0}
.pb-status.err{color:#ff6a5a;opacity:1}
.pb-status.ok{color:#6cff8a;opacity:1}
.pb-rooms{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.pb-room{display:flex;align-items:center;gap:10px;background:#ffffff0b;border:1px solid #ffffff1a;border-radius:12px;padding:10px 12px}
.pb-room b{flex:1}.pb-room span{font-size:12px;opacity:.7}
.pb-players{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.pb-player{display:flex;align-items:center;gap:10px;background:#ffffff0b;border-radius:10px;padding:6px 10px;font-weight:800}
.pb-player img{width:34px;height:34px;border-radius:50%;background:#ffffff14;border:2px solid var(--c)}
.pb-player .host{font-size:11px;color:#ffb21e;margin-left:auto}
.pb-help{font-size:13px;opacity:.75;line-height:1.5}
.pb-help.warn{color:#ffcf6a;opacity:1}
.pb-hostbox{margin-top:14px;background:#ffb21e14;border:1px solid #ffb21e55;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.pb-addr{display:flex;align-items:center;gap:10px}
.pb-addr .lbl{width:84px;font-size:12px;opacity:.75;font-weight:800}
.pb-addr code{flex:1;font-size:17px;font-weight:800;letter-spacing:.5px;user-select:text}
.pb-addr .pb-btn{padding:5px 12px}
@media (max-width:820px){.pb-cols,.pb-bottom,.pb-online{grid-template-columns:1fr}.pb-board{min-width:0;width:94vw}}
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

  // A Mii's picture (it may still be drawing: the app fills in img[data-portrait] when it's ready)
  function portraitImg(img, opts, rec) {
    if (!rec) return img;
    img.dataset.portrait = rec.id;
    const url = opts.portraitFor(rec);
    if (url) img.src = url;
    return img;
  }

  // A grid of Mii cards to pick from
  function miiPicker(opts, recs, selected, disabled, onPick, sub) {
    const grid = el("div", "pb-minis");
    for (const r of recs) {
      const b = el("button", "pb-mini");
      const img = el("img"); img.src = opts.portraitFor(r) || ""; img.alt = "";
      b.append(img, el("b", null, r.name || "Mii"), el("span", null, sub ? sub(r) : " "));
      if (r === selected) b.classList.add("sel");
      if (r === disabled) b.classList.add("off");
      b.addEventListener("click", () => onPick(r));
      grid.appendChild(b);
    }
    return grid;
  }

  function controlsBox() {
    const keys = el("div", "pb-box");
    keys.appendChild(el("h3", null, "Controls"));
    const k = el("div", "pb-keys");
    k.innerHTML = [
      "<kbd>W A S D</kbd> move", "<kbd>Mouse</kbd> aim", "<kbd>Left click</kbd> shoot / slash", "<kbd>Right click</kbd> knife stab",
      "<kbd>Space</kbd> jump", "<kbd>Shift</kbd> walk (quiet)", "<kbd>Ctrl</kbd> / <kbd>C</kbd> crouch", "<kbd>R</kbd> reload",
      "<kbd>1</kbd> AK · <kbd>3</kbd> knife", "<kbd>Q</kbd> / wheel switch", "<kbd>F</kbd> inspect", "<kbd>Tab</kbd> scoreboard", "<kbd>Esc</kbd> menu",
    ].map((s) => "<div>" + s + "</div>").join("");
    keys.appendChild(k);
    return keys;
  }

  function open(opts) {
    if (current) current.close();
    addCSS();
    const settings = loadSettings();
    const rootEl = el("div", "pb-root");
    document.body.appendChild(rootEl);
    let match = null;
    let closed = false;
    let online = null;
    let tab = opts.tab || (settings.tab === "online" ? "online" : "mii");

    const recs = opts.records.filter(Boolean);
    const byId = (id) => recs.find((r) => r.id === id);
    let you = (opts.player && byId(opts.player.id)) || byId(settings.player) || recs[0];
    let opp = (opts.opponent && byId(opts.opponent.id)) || byId(settings.opponent) || recs.find((r) => r !== you);
    if (opp === you) opp = recs.find((r) => r !== you);
    if (opts.opponent) tab = "mii";

    function close() {
      if (closed) return;
      closed = true;
      if (match) match.dispose();
      if (online) online.dispose();
      rootEl.remove();
      document.removeEventListener("keydown", lobbyKeys, true);
      if (current && current.close === close) current = null;
      if (opts.onClose) opts.onClose();
    }
    function lobbyKeys(e) { if (e.key === "Escape" && !match) { e.preventDefault(); close(); } }
    document.addEventListener("keydown", lobbyKeys, true);

    function showLobby() {
      if (match) { match.dispose(); match = null; root.__pb = null; }
      rootEl.innerHTML = "";
      const lob = el("div", "pb-lobby");
      const head = el("div", "pb-lob-head");
      const h1 = el("h1", null, "🎯 PAINTBALL");
      h1.appendChild(el("small", null, "Shipment"));
      const tabs = el("div", "pb-tabs");
      for (const [id, label] of [["mii", "🤖 VS a Mii"], ["online", "🌐 Online"]]) {
        const b = el("button", "pb-tab" + (tab === id ? " on" : ""), label);
        b.addEventListener("click", () => { tab = id; settings.tab = id; saveSettings(settings); showLobby(); });
        tabs.appendChild(b);
      }
      const x = el("button", "pb-x", "✕ Back to the hub");
      x.addEventListener("click", close);
      head.append(h1, tabs, x);
      lob.appendChild(head);
      rootEl.appendChild(lob);

      if (tab === "online") {
        if (!root.PBOnline) { lob.appendChild(el("p", null, "Online play didn't load.")); return; }
        if (!online) online = root.PBOnline.create(onlineCtx);
        online.render(lob);
        return;
      }

      const cols = el("div", "pb-cols");
      const colYou = el("div", "pb-col");
      colYou.appendChild(el("h2", null, "Play as"));
      colYou.appendChild(miiPicker(opts, recs, you, opp, (r) => { you = r; if (opp === you) opp = recs.find((o) => o !== you); showLobby(); }));
      const colOpp = el("div", "pb-col");
      colOpp.appendChild(el("h2", null, "Opponent"));
      colOpp.appendChild(miiPicker(opts, recs, opp, you, (r) => { opp = r; showLobby(); }, (r) => {
        const st = opts.statsFor(r);
        return root.MiniGames.skillLevel(st.skill) + " · " + Math.round(st.skill);
      }));
      cols.append(colYou, colOpp);

      const bottom = el("div", "pb-bottom");
      const setBox = el("div", "pb-box");
      setBox.appendChild(el("h3", null, "Settings"));
      settingsControls(setBox, settings, () => saveSettings(settings));
      const goWrap = el("div");
      const modes = el("div", "pb-modes");
      for (const [id, label, sub] of [["respawn", "Respawn", "first to " + RESPAWN_TO_WIN + " eliminations"], ["rounds", "Rounds", "first to " + TO_WIN + " rounds"]]) {
        const b = el("button", "pb-mode" + (settings.mode === id ? " on" : ""));
        b.append(el("b", null, label), el("span", null, sub));
        b.addEventListener("click", () => { settings.mode = id; saveSettings(settings); showLobby(); });
        modes.appendChild(b);
      }
      const go = el("button", "pb-go", "PLAY ▶");
      if (!you || !opp) { go.disabled = true; go.style.opacity = 0.4; }
      go.addEventListener("click", () => {
        settings.player = you.id; settings.opponent = opp.id;
        saveSettings(settings);
        startMatch();
      });
      goWrap.append(modes, go, el("div", "pb-vs", you && opp ? (you.name + " vs " + opp.name) : "You need at least 2 Miis"));
      bottom.append(setBox, controlsBox(), goWrap);
      lob.append(cols, bottom);
    }

    function loading(text) {
      rootEl.innerHTML = "";
      const load = el("div", "pb-loading", text || "LOADING SHIPMENT");
      load.appendChild(el("i"));
      rootEl.appendChild(load);
      return load;
    }

    async function startMatch() {
      const load = loading();
      await new Promise((r) => setTimeout(r, 30));
      try {
        const [tYou, tOpp] = await Promise.all([opts.templateFor(you), opts.templateFor(opp)]);
        match = new Match({
          root: rootEl, opts, settings, you, opp, tYou, tOpp, mode: settings.mode,
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

    // what the online lobby (pb-online.js) needs from here
    const onlineCtx = {
      opts, settings, recs, el, miiPicker, settingsControls, controlsBox, portraitImg,
      save: () => saveSettings(settings),
      get you() { return you; },
      setYou(r) { you = r; settings.player = r.id; saveSettings(settings); },
      paintFor: paintColor,
      refresh: () => { if (!match) showLobby(); },
      // the room's match is starting: build it
      async startOnline(cfg) {
        if (match) { match.dispose(); match = null; }
        const load = loading("LOADING SHIPMENT");
        try {
          const tYou = await opts.templateFor(you);
          match = new Match({
            root: rootEl, opts, settings, you, tYou, net: cfg.net, roster: cfg.roster, startIn: cfg.startIn, youColor: cfg.youColor,
            toWin: cfg.toWin, timeLimit: cfg.timeLimit, roomName: cfg.roomName,
            onExit: (to) => { match && match.dispose(); match = null; if (to === "hub") close(); else { if (to === "leave") cfg.net.send({ t: "leave" }); showLobby(); } },
          });
          load.remove();
          current.match = match;
          root.__pb = match;
          return match;
        } catch (err) {
          console.error(err);
          load.textContent = "Couldn't start Paintball: " + err.message;
          setTimeout(showLobby, 2500);
          return null;
        }
      },
      inMatch: () => !!match,
    };

    current = { close, match: null, get online() { return online; } };
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
    slider("Field of view", "fov", 60, 150, 1, (v) => Math.round(v) + "°");
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
  //   offline: you vs one Mii (the bot), "respawn" or "rounds"
  //   online:  you vs everyone in the room, "respawn" (the server keeps score)
  // =====================================================================
  class Match {
    constructor(o) {
      this.o = o;
      this.opts = o.opts;
      this.settings = o.settings;
      this.rootEl = o.root;
      this.net = o.net || null;
      this.online = !!this.net;
      this.mode = this.online ? "respawn" : (o.mode === "rounds" ? "rounds" : "respawn");
      this.toWin = this.mode === "rounds" ? TO_WIN : (o.toWin || RESPAWN_TO_WIN);
      this.timeLimit = this.mode === "respawn" ? (o.timeLimit ? o.timeLimit / 1000 : TIME_LIMIT) : 0;
      this.now = 0;
      this.disposed = false;
      this.paused = false;
      this.phase = "freeze";
      this.phaseEnd = 0;
      this.round = 0;
      this.timers = [];
      this.keys = new Set();
      this.mouse = { left: false, right: false, swayX: 0, swayY: 0 };
      this.jumpQueued = false;
      this.botLearned = 0;
      this.fighters = [];
      this.byNet = new Map();
      this.sendT = 0;
      this.build();
      this.bindInput();
      if (this.online) this.bindNet();
      this.begin();
      this.loop();
    }

    // for older tests: the score as { you, bot }
    get score() { return { you: this.you.score, bot: this.bot ? this.bot.score : this.leader().score }; }
    set score(v) { this.you.score = v.you; if (this.bot) this.bot.score = v.bot; }

    // ------------------------------------------------------------------
    // Setting up the 3D world
    // ------------------------------------------------------------------
    build() {
      const o = this.o;
      const canvas = el("canvas");
      this.rootEl.appendChild(canvas);
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
      this.spawns = this.map.spawns.a.concat(this.map.spawns.b);
      // the bot finds its way around with the same route-finder Miis use in the hub
      const obstacles = [];
      for (const b of this.map.boxes) if (b.y1 > CFG.step && b.y0 < 1.6) obstacles.push({ x: b.x, z: b.z, w: b.hw * 2, d: b.hd * 2, rot: -(b.rot || 0) });
      for (const c of this.map.cyls) if (c.y1 > CFG.step) obstacles.push({ x: c.x, z: c.z, r: c.r });
      this.nav = new root.MiiNav.Nav(this.map.bounds, obstacles, 0.35);

      this.camera = new THREE.PerspectiveCamera(verticalFov(this.settings.fov), 16 / 9, 0.03, 400);
      this.camera.rotation.order = "YXZ";
      this.scene.add(this.camera);

      // first-person hands + gun, drawn on top with their own camera (like CS's viewmodel)
      this.vmScene = new THREE.Scene();
      this.vmCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.01, 10);
      // (the hands and gun bring their own lights)
      const lookYou = this.opts.lookFor(o.you, o.tYou) || {};
      const youPaint = o.youColor || paintColor(o.tYou);
      this.vm = root.PBModels.createViewmodel({
        accent: youPaint,
        sleeve: hexOf(lookYou.shirt, hexOf(o.tYou.source && o.tYou.source.shirt, "#2b7cff")),
        // (softened a little: under the bright first-person lights Mii skin looks too red)
        skin: "#" + new THREE.Color(hexOf(lookYou.skin, hexOf(o.tYou.source && o.tYou.source.skin, "#f2c7a5"))).lerp(new THREE.Color("#f1d3c0"), 0.35).getHexString(),
      });
      this.vmScene.add(this.vm.group);

      this.audio = root.PBAudio.create();
      this.audio.setVolume(this.settings.volume);

      // paint
      this.splatTex = root.PBModels.splatTextures();
      this.splats = [];
      this.splatMats = new Map();
      this.splatGeo = new THREE.PlaneGeometry(1, 1);
      this.balls = [];
      this.ballGeo = new THREE.SphereGeometry(0.022, 8, 6);
      this.ballGeo.scale(1, 1, 3.5); // a little motion streak

      // the fighters
      this.you = this.addFighter("you", o.you.name, youPaint, o.you);
      this.you.portrait = this.opts.portraitFor(o.you);
      if (this.online) {
        this.you.netId = this.net.id;
        this.byNet.set(this.net.id, this.you);
        for (const p of o.roster || []) this.addRemote(p);
      } else {
        let botPaint = paintColor(o.tOpp);
        if (colorDistance(youPaint, botPaint) < 0.6) botPaint = colorDistance(youPaint, "#ff8a00") > 0.8 ? "#ff8a00" : "#3de0ff";
        const b = this.bot = this.addFighter("bot", o.opp.name, botPaint, o.opp);
        b.portrait = this.opts.portraitFor(o.opp);
        this.makeAvatar(b, o.tOpp, this.opts.lookFor(o.opp, o.tOpp) || {}, o.opp);
        b.brain = new E.BotBrain({ world: this.world }, b, this.botSkill(), root.Dialogue ? root.Dialogue.traits(o.opp) : null);
        b.brain.nav = this.nav;
      }

      this.buildHUD();
      this.resize();
      this.onResize = () => this.resize();
      window.addEventListener("resize", this.onResize);
    }

    addFighter(kind, name, color, rec) {
      const f = {
        id: kind, kind, rec, name: name || "Mii", color,
        mover: new E.Mover(this.world), arms: new E.Arms(),
        yaw: 0, pitch: 0, hp: 100, alive: kind === "you" || kind === "bot", score: 0,
        boxes: [], feet: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 }, chest: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 },
        stats: { kills: 0, deaths: 0, hs: 0, dmg: 0, shots: 0, hits: 0 },
        taken: { dmg: 0, hits: 0 }, given: { dmg: 0, hits: 0 },
        flinch: 0, slashAlt: 0, landed: false, respawnAt: 0, walkPhase: 0, dead: 0, paint: [],
      };
      this.fighters.push(f);
      return f;
    }

    // the 3D Mii for the bot or another player
    makeAvatar(f, tpl, look, rec) {
      const inst = root.MiiModel.createInstance(tpl, look);
      inst.holder.scale.setScalar(MII_SCALE);
      inst.holder.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; } });
      this.scene.add(inst.holder);
      f.inst = inst;
      f.style = null;
      try {
        const st = root.MiiHub3D.animStyle(root.Dialogue.traits(rec));
        if (st && isFinite(st.stride)) f.style = st;
      } catch (e) { /* use the default way of moving */ }
      const find = (prefix) => { let r = null; inst.object.traverse((n) => { if (!r && n.isBone && n.name.replace(/_\d+$/, "") === prefix) r = n; }); return r; };
      const B = inst.rig.bones;
      const bone = (k) => (B[k] ? B[k].bone : null);
      f.bones = {
        head: bone("Head"), s1: bone("Spine_1"), s2: bone("Spine_2"),
        a1l: bone("Arm_1_L"), a2l: bone("Arm_2_L"), wl: find("Wrist_L"), a1r: bone("Arm_1_R"), a2r: bone("Arm_2_R"), wr: find("Wrist_R"),
        l1l: bone("Leg_1_L"), l2l: bone("Leg_2_L"), al: find("Ankle_L"), l1r: bone("Leg_1_R"), l2r: bone("Leg_2_R"), ar: find("Ankle_R"),
      };
      f.useBones = ["head", "s1", "s2", "l1l", "l2l", "l1r", "l2r"].every((k) => f.bones[k]);
      f.gun = root.PBModels.createWorldGun(f.color);
      f.gun.traverse((n) => { if (n.isMesh) n.castShadow = true; });
      this.scene.add(f.gun);
      f.inst.holder.visible = f.gun.visible = f.alive;
    }

    // another player (online). p = { id, name, color, rec, tpl, look }
    addRemote(p) {
      if (this.byNet.has(p.id)) return this.byNet.get(p.id);
      const f = this.addFighter("remote", p.name, p.color || "#ff8a00", p.rec);
      f.netId = p.id;
      f.alive = false;
      f.snaps = [];
      f.portrait = p.rec ? this.opts.portraitFor(p.rec) : "";
      this.byNet.set(p.id, f);
      if (p.spawn) { f.mover.place(p.spawn.x, p.spawn.z); f.yaw = p.spawn.yaw || 0; f.alive = true; } // already playing (you joined late)
      if (p.tpl) this.makeAvatar(f, p.tpl, p.look || {}, p.rec);
      if (this.hudBoard) this.updateScore();
      return f;
    }

    removeRemote(id) {
      const f = this.byNet.get(id);
      if (!f || f === this.you) return;
      this.byNet.delete(id);
      this.fighters = this.fighters.filter((x) => x !== f);
      if (f.inst) { f.inst.holder.removeFromParent(); if (root.MiiModel.disposeObject) root.MiiModel.disposeObject(f.inst.holder); }
      if (f.gun) f.gun.removeFromParent();
      this.notice(f.name + " left");
      this.updateScore();
    }

    botSkill() {
      const st = this.opts.statsFor(this.o.opp);
      return clamp(0.08 + (st.skill / 100) * 0.92, 0, 1);
    }

    others(f) { return this.fighters.filter((x) => x !== f); }
    enemiesOf(f) { return this.fighters.filter((x) => x !== f && x.alive); }
    // the best player who isn't you
    leader() {
      let best = null;
      for (const f of this.fighters) if (f !== this.you && (!best || f.score > best.score)) best = f;
      return best || this.you;
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
      const team = (cls) => {
        const t = el("div", "pb-team " + cls);
        const img = el("img"); img.alt = "";
        const nm = el("span", "nm", "");
        const sc = el("b", "sc", "0");
        t.append(img, nm, sc);
        return { t, img, nm, sc };
      };
      const top = el("div", "pb-top");
      this.hudLeft = team("you"); this.hudRight = team("opp");
      const clock = el("div", "pb-clock");
      const tm = el("div", "tm", "0:00");
      this.hudSub = el("div", "sub", "");
      clock.append(tm, this.hudSub);
      top.append(this.hudLeft.t, clock, this.hudRight.t);
      this.hudClock = tm;

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
      ammo.append(this.hudReload, this.hudWpn, this.hudMag, this.hudRes);
      this.hudSlots = el("div", "pb-slots");
      this.hudSlotAK = el("span", null, "1 · PAINT AK"); this.hudSlotKnife = el("span", null, "3 · BUTTERFLY KNIFE");
      this.hudSlots.append(this.hudSlotAK, this.hudSlotKnife);
      this.hudHurt = el("div", "pb-hurt");
      this.hudDir = el("div", "pb-dir"); this.hudDirArc = el("i"); this.hudDir.appendChild(this.hudDirArc);
      this.hudSplats = el("div", "pb-splats");
      this.hudBoard = el("div", "pb-board");
      this.hudDeath = el("div", "pb-death");
      this.hudHint = el("div", "pb-hint", "");
      this.hudNet = el("div", "pb-net", "");
      hud.append(this.hudSplats, this.hudHurt, this.hudDir, top, this.hudFeed, this.hudXH, this.hudBanner, hp, ammo, this.hudSlots, this.hudDeath, this.hudHint, this.hudNet, this.hudBoard);
      this.rootEl.appendChild(hud);
      this.hud = hud;

      // overlays: click to play, the menu (Esc), results
      this.ovClick = el("div", "pb-overlay");
      const p1 = el("div", "pb-panel");
      const title = this.online ? "🌐 " + (this.o.roomName || "Online match") : "🎯 " + this.you.name + " vs " + this.bot.name;
      p1.append(el("h2", null, title), el("p", null, "Click to play. Your mouse controls your aim (press Esc for the menu)."));
      p1.appendChild(el("button", "pb-btn primary", "Click to play"));
      this.ovClick.appendChild(p1);
      this.ovClick.addEventListener("click", () => this.lock());

      this.ovPause = el("div", "pb-overlay");
      const p2 = el("div", "pb-panel");
      p2.append(el("h2", null, this.online ? "Menu" : "Paused"));
      if (this.online) p2.appendChild(el("p", null, "The match keeps going while you're in here!"));
      const setBox = el("div");
      settingsControls(setBox, this.settings, (k) => {
        saveSettings(this.settings);
        if (k === "volume") this.audio.setVolume(this.settings.volume);
        if (k === "fov") { this.camera.fov = verticalFov(this.settings.fov); this.camera.updateProjectionMatrix(); }
        this.drawCrosshair();
      });
      const btns = el("div", "btns");
      const resume = el("button", "pb-btn primary", "Resume");
      resume.addEventListener("click", (e) => { e.stopPropagation(); this.lock(); });
      const quit = el("button", "pb-btn", this.online ? "Leave match" : "Quit match");
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

    // the score at the top: you on the left, the best of the others on the right
    updateScore() {
      if (!this.hudLeft) return;
      const set = (side, f) => {
        if (!f.portrait && f.rec) f.portrait = this.opts.portraitFor(f.rec);
        side.t.style.setProperty("--c", f.color);
        if (side.img.getAttribute("src") !== (f.portrait || "")) side.img.src = f.portrait || "";
        side.nm.textContent = f.name;
        side.sc.textContent = f.score;
      };
      set(this.hudLeft, this.you);
      const other = this.bot || this.leader();
      if (other && other !== this.you) set(this.hudRight, other);
      this.hudRight.t.style.visibility = other && other !== this.you ? "" : "hidden";
      this.hudSub.textContent = this.mode === "rounds" ? "First to " + this.toWin + " rounds" : "First to " + this.toWin;
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

    notice(text) {
      const k = el("div", "pb-kill note", text);
      this.hudFeed.appendChild(k);
      setTimeout(() => k.remove(), 5000);
    }

    killFeed(killer, victim, weapon, head) {
      const k = el("div", "pb-kill" + (killer === this.you || victim === this.you ? " mine" : ""));
      const a = el("span", null, killer.name); a.style.color = killer.color;
      const v = el("span", null, victim.name); v.style.color = victim.color;
      k.append(a, el("span", "wpn", weapon === "knife" ? "🔪" : "🔫" + (head ? " 🎯" : "")), v);
      this.hudFeed.appendChild(k);
      setTimeout(() => k.remove(), 6000);
      while (this.hudFeed.children.length > 6) this.hudFeed.firstChild.remove();
    }

    renderBoard() {
      const b = this.hudBoard;
      b.innerHTML = "";
      const h = el("h3");
      const title = this.mode === "rounds" ? "Shipment · Round " + this.round : this.online ? "Shipment · " + (this.o.roomName || "Online") : "Shipment · Respawn";
      h.append(el("span", null, title), el("small", null, this.mode === "rounds" ? "First to " + this.toWin + " rounds" : "First to " + this.toWin + " eliminations"));
      b.appendChild(h);
      const tbl = el("table");
      tbl.innerHTML = "<tr><th>Player</th><th>" + (this.mode === "rounds" ? "Rounds" : "Score") + "</th><th>K</th><th>D</th><th>HS %</th><th>DMG</th><th>Accuracy</th>" + (this.online ? "<th>Ping</th>" : "") + "</tr>";
      const list = this.fighters.slice().sort((x, y) => y.score - x.score || y.stats.kills - x.stats.kills);
      for (const f of list) {
        const tr = el("tr", f === this.you ? "me" : "");
        const s = f.stats;
        const name = el("td");
        const img = el("img"); img.alt = "";
        if (!f.portrait && f.rec) f.portrait = this.opts.portraitFor(f.rec);
        if (f.portrait) img.src = f.portrait;
        const extra = f === this.you ? " (you)" : f === this.bot ? " · " + root.MiniGames.skillLevel(this.opts.statsFor(this.o.opp).skill) : "";
        const nm = el("span", null, f.name + extra);
        nm.style.color = f.color;
        name.append(img, nm);
        tr.appendChild(name);
        const mine = f === this.you || f === this.bot; // we only know shots/accuracy for players on this computer
        const cells = [f.score, s.kills, s.deaths, s.kills ? Math.round((s.hs / s.kills) * 100) + "%" : "–", mine ? s.dmg : "–", mine && s.shots ? Math.round((s.hits / s.shots) * 100) + "%" : "–"];
        if (this.online) cells.push(f === this.you ? (this.net.ping != null ? this.net.ping + " ms" : "–") : "");
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
          // offline the game pauses; online it can't (everyone else keeps playing)
          if (!this.online) this.paused = true;
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

    // ------------------------------------------------------------------
    // Online: messages from the server
    // ------------------------------------------------------------------
    bindNet() {
      const N = this.net;
      const fOf = (id) => this.byNet.get(id);
      this.netOff = N.handle({
        st: (m) => {
          const f = fOf(m.id);
          if (!f || f === this.you) return;
          f.snaps.push({ t: performance.now() / 1000, s: m.s });
          if (f.snaps.length > 30) f.snaps.shift();
        },
        shot: (m) => {
          const f = fOf(m.id);
          if (!f) return;
          const o = { x: m.o[0], y: m.o[1], z: m.o[2] }, e = { x: m.e[0], y: m.e[1], z: m.e[2] };
          const d = Math.hypot(o.x - this.camera.position.x, o.z - this.camera.position.z);
          this.playAt(d > 18 ? "akFar" : "ak", o, 0.9, 0.95 + Math.random() * 0.1);
          this.launchBall(new THREE.Vector3(o.x, o.y, o.z), e, f.color);
          if (m.n) {
            const dist = Math.hypot(e.x - o.x, e.y - o.y, e.z - o.z);
            this.later(dist / 140, () => {
              this.splat(e, { x: m.n[0], y: m.n[1], z: m.n[2] }, f.color, 0.22 + Math.random() * 0.14);
              this.playAt(m.m === "wood" ? "hitWood" : "hitWall", e, 0.5);
            });
          }
        },
        ev: (m) => {
          const f = fOf(m.id);
          if (!f || !f.alive) return;
          const sounds = { step: ["step", 0.9], land: ["land", 0.8], magOut: ["magOut", 0.6], magIn: ["magIn", 0.6], deploy: ["deploy", 0.5], knifeDeploy: ["knifeDeploy", 0.5], slash: ["slash", 0.7], stab: ["stab", 0.7] };
          const s = sounds[m.k];
          if (s) this.playAt(s[0], f.mover.pos, s[1], 0.92 + Math.random() * 0.16);
          if (m.k === "knife" || m.k === "ak") f.arms.weapon = m.k;
        },
        dmg: (m) => {
          const v = fOf(m.v), a = fOf(m.by);
          if (!v || !a) return;
          v.hp = m.hp;
          v.taken.dmg += m.d; v.taken.hits++;
          a.given.dmg += m.d; a.given.hits++;
          if (v === this.you) {
            const vel = this.you.mover.vel;
            if (this.you.mover.onGround) { vel.x *= 0.45; vel.z *= 0.45; }
            this.you.arms.recY += m.z === "head" ? 1.2 : 0.6;
            this.you.flinch = 1;
            this.screenSplat(a.color, m.z === "head" ? 1.4 : 1);
            this.audio.play(m.z === "head" ? "hitHead" : "hurt", { vol: 0.8 });
            this.hurtFrom(a);
          }
        },
        kill: (m) => {
          const v = fOf(m.v), a = fOf(m.by);
          if (!v || !a) return;
          if (m.scores) for (const [id, sc] of Object.entries(m.scores)) { const f = fOf(id); if (f) f.score = sc; }
          this.kill(a, v, m.w, !!m.h, !!m.b, true);
        },
        spawn: (m) => {
          const f = fOf(m.id);
          if (!f || f === this.you) return;
          f.mover.place(m.x, m.z);
          f.yaw = m.yaw; f.pitch = 0; f.hp = 100;
          f.snaps.length = 0;
          f.alive = true;
          this.resetAvatar(f);
        },
        bye: (m) => this.removeRemote(m.id),
        room: (m) => {
          for (const p of m.room.players) { const f = fOf(p.id); if (f) { f.score = p.score; f.stats.deaths = Math.max(f.stats.deaths, p.deaths); } }
          this.updateScore();
        },
        over: (m) => {
          if (m.scores) for (const [id, sc] of Object.entries(m.scores)) { const f = fOf(id); if (f) f.score = sc; }
          this.finish(fOf(m.winner) || null);
        },
        close: () => {
          if (this.over) return;
          this.banner("DISCONNECTED", "Lost the connection to the server", "lose");
          this.finish(null, "disconnected");
        },
      });
    }

    // a Mii that joined while the match was on
    addLateRemote(p) { const f = this.addRemote(p); this.notice(p.name + " joined"); return f; }

    // ------------------------------------------------------------------
    // Starting, rounds and respawning
    // ------------------------------------------------------------------
    begin() {
      if (this.mode === "rounds") { this.startRound(); return; }
      const freeze = this.online ? Math.max(0, (this.o.startIn || 0) / 1000) : FREEZE;
      this.phase = "freeze";
      this.phaseEnd = this.now + freeze;
      this.matchEnd = this.phaseEnd + this.timeLimit;
      // you and the bot start at opposite ends
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      const flip = Math.random() < 0.5;
      // (online: as far as possible from the players we know about)
      this.respawn(this.you, this.online ? this.pickSpawn(this.you, true) : pick(flip ? this.map.spawns.a : this.map.spawns.b), true);
      if (this.bot) this.respawn(this.bot, pick(flip ? this.map.spawns.b : this.map.spawns.a), true);
      this.banner(this.online ? "GET READY" : "RESPAWN", "First to " + this.toWin + " eliminations", "", Math.max(1.5, freeze));
      if (this.online && freeze <= 0) this.goLive();
    }

    goLive() {
      this.phase = "live";
      this.banner("GO!", "", "", 0.8);
      this.audio.play("roundStart");
      if (this.online) this.sendSpawn();
    }

    startRound() {
      this.round++;
      this.phase = "freeze";
      this.phaseEnd = this.now + FREEZE;
      this.roundEnd = this.phaseEnd + ROUND_TIME;
      const swap = this.round % 2 === 0;
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      const sa = pick(this.map.spawns.a), sb = pick(this.map.spawns.b);
      this.respawn(this.you, swap ? sb : sa, true);
      this.respawn(this.bot, swap ? sa : sb, true);
      this.banner("ROUND " + this.round, this.you.score + " – " + this.bot.score + (this.round > 1 ? "" : " · first to " + this.toWin), "", FREEZE);
      this.updateScore();
    }

    // Where to come back in: far from everyone, and out of their sight if possible
    pickSpawn(f, anyone) {
      // (at the start nobody's spawned yet, but we know where the others are standing)
      const foes = anyone ? this.others(f).filter((o) => o.snaps && o.snaps.length) : this.enemiesOf(f);
      let best = null, bestScore = -Infinity;
      for (const sp of this.spawns) {
        let near = Infinity, seen = false;
        const eye = { x: sp.x, y: CFG.eyeStand, z: sp.z };
        for (const o of foes) {
          const p = o.mover.pos;
          near = Math.min(near, Math.hypot(p.x - sp.x, p.z - sp.z));
          if (!seen && this.world.clear(eye, { x: p.x, y: p.y + CFG.eyeStand, z: p.z })) seen = true;
        }
        const sc = Math.min(near, 40) - (seen ? 25 : 0) + Math.random() * 4;
        if (sc > bestScore) { bestScore = sc; best = sp; }
      }
      return best || this.spawns[0];
    }

    respawn(f, sp, quiet) {
      sp = sp || this.pickSpawn(f);
      f.mover.place(sp.x, sp.z);
      f.yaw = sp.yaw; f.pitch = 0;
      f.hp = 100; f.alive = true; f.respawnAt = 0;
      f.arms.reset();
      f.taken = { dmg: 0, hits: 0 }; f.given = { dmg: 0, hits: 0 };
      f.killer = null;
      if (f === this.you) {
        this.vm.setWeapon("ak");
        this.vm.group.visible = true;
        this.hudDeath.classList.remove("show");
        this.deathCam = null;
        if (this.online && this.phase === "live") this.sendSpawn();
      }
      if (f.brain) { f.brain.setSkill(this.botSkill(), root.Dialogue ? root.Dialogue.traits(this.o.opp) : null); f.brain.resetRound(); }
      if (f.inst) this.resetAvatar(f);
      if (!quiet && f === this.you) this.audio.play("deploy", { vol: 0.5 });
    }

    sendSpawn() {
      const p = this.you.mover.pos;
      this.net.send({ t: "spawn", x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +this.you.yaw.toFixed(3) });
    }

    resetAvatar(f) {
      if (!f.inst) return;
      f.dead = 0;
      f.inst.holder.rotation.set(0, 0, 0);
      f.inst.holder.visible = true;
      f.gun.visible = true;
      for (const m of f.paint) m.removeFromParent();
      f.paint = [];
    }

    endRound(winner, why) {
      if (this.phase === "end") return;
      this.phase = "end";
      this.phaseEnd = this.now + END_DELAY;
      if (winner) winner.score++;
      this.updateScore();
      this.botLearns(winner);
      const matchOver = this.you.score >= this.toWin || this.bot.score >= this.toWin;
      if (winner === this.you) { this.banner(matchOver ? "VICTORY" : "ROUND WON", why || "", "win"); this.audio.play(matchOver ? "matchWin" : "roundWin"); }
      else if (winner === this.bot) { this.banner(matchOver ? "DEFEAT" : "ROUND LOST", why || "", "lose"); this.audio.play(matchOver ? "matchLose" : "roundLose"); }
      else this.banner("DRAW", why || "Time's up", "");
      if (matchOver) this.phaseEnd = this.now + 3;
    }

    // the Mii gets a little better every time it wins or loses a fight (a bit more when it loses)
    botLearns(winner) {
      if (!this.bot || !winner || !root.MiniGames || !root.MiniGames.learn) return;
      const st = this.opts.statsFor(this.o.opp);
      const before = st.skill;
      root.MiniGames.learn(st, "paintball", winner === this.you);
      this.botLearned += st.skill - before;
      this.opts.onSave(this.o.opp);
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
        if (!this.paused || this.online) {
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
      if (this.over && !this.online) return;
      this.now += dt;
      const now = this.now;
      // timers (sounds during reloads etc.)
      if (this.timers.length) {
        for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= now) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
      }

      if (this.phase === "freeze" && now >= this.phaseEnd) {
        if (this.mode === "rounds") { this.phase = "live"; this.banner("GO!", "", "", 0.8); this.audio.play("roundStart"); }
        else this.goLive();
      } else if (this.mode === "rounds") {
        if (this.phase === "live" && now >= this.roundEnd) this.endRound(null, "Time's up");
        else if (this.phase === "end" && now >= this.phaseEnd) {
          if (this.you.score >= this.toWin || this.bot.score >= this.toWin) { this.finish(this.you.score > this.bot.score ? this.you : this.bot); return; }
          this.startRound();
          return;
        }
      } else if (!this.online && this.phase === "live" && now >= this.matchEnd) {
        // time's up: whoever has more wins
        const y = this.you.score, b = this.bot.score;
        this.finish(y > b ? this.you : b > y ? this.bot : null, "Time's up");
        return;
      }
      // coming back after being splattered (respawn mode)
      if (this.mode === "respawn" && this.phase === "live") {
        for (const f of this.fighters) if (!f.alive && f.respawnAt && now >= f.respawnAt && f.kind !== "remote") this.respawn(f);
      }
      const frozen = this.phase !== "live";
      const playing = !this.over && (!this.online || this.locked() || !this.paused);

      // ---- you ----
      const y = this.you;
      if (y.alive) {
        const K = this.keys;
        const live = playing && !frozen;
        const inp = {
          fwd: (K.has("KeyW") ? 1 : 0) - (K.has("KeyS") ? 1 : 0),
          side: (K.has("KeyD") ? 1 : 0) - (K.has("KeyA") ? 1 : 0),
          yaw: y.yaw,
          walk: K.has("ShiftLeft") || K.has("ShiftRight"),
          duck: K.has("ControlLeft") || K.has("ControlRight") || K.has("KeyC"),
          jump: this.jumpQueued,
          maxSpeed: y.arms.weapon === "knife" ? CFG.speedKnife : CFG.speedAK,
          frozen: frozen || this.over,
        };
        this.jumpQueued = false;
        y.mover.step(dt, inp);
        this.moverEvents(y);
        this.useWeapons(y, {
          fire: this.mouse.left && live, alt: this.mouse.right && live,
          reload: this.wantReload, switchTo: this.wantSwitch, inspect: this.wantInspect,
        }, dt);
        this.wantReload = false; this.wantSwitch = null; this.wantInspect = false;
      }
      this.updateTargetInfo(y);

      // ---- the Mii (offline) ----
      const b = this.bot;
      if (b) {
        if (b.alive) {
          const out = frozen || !y.alive ? { yaw: b.yaw } : b.brain.tick(dt, now, y);
          b.mover.step(dt, {
            fwd: out.fwd || 0, side: out.side || 0, yaw: b.yaw, walk: !!out.walk, duck: !!out.duck, jump: !!out.jump,
            maxSpeed: b.arms.weapon === "knife" ? CFG.speedKnife : CFG.speedAK, frozen,
          });
          this.moverEvents(b);
          this.useWeapons(b, { fire: !!out.fire && !frozen && y.alive, reload: !!out.reload, switchTo: out.switchTo }, dt);
        }
        if (!b.useBones || !b.alive) this.updateTargetInfo(b);
      }

      // ---- other players (online) ----
      if (this.online) {
        const tNow = performance.now() / 1000;
        for (const f of this.fighters) if (f.kind === "remote") this.followRemote(f, tNow);
        // tell the server where you are (30 times a second)
        this.sendT -= dt;
        if (this.sendT <= 0) {
          this.sendT = 1 / 30;
          const m = y.mover, a = y.arms;
          const r3 = (v) => Math.round(v * 1000) / 1000;
          const flags = (m.onGround ? 1 : 0) | (a.weapon === "knife" ? 2 : 0) | (a.reloading(now) ? 4 : 0) | (y.alive ? 8 : 0);
          this.net.send({ t: "st", s: [r3(m.pos.x), r3(m.pos.y), r3(m.pos.z), r3(m.vel.x), r3(m.vel.z), r3(y.yaw), r3(y.pitch), r3(m.duck), flags] });
        }
      }
    }

    // Another player's position: shown 100 ms in the past, smoothly between the updates we got
    followRemote(f, tNow) {
      const S = f.snaps;
      if (!S.length) return;
      const rt = tNow - 0.1;
      let a = S[0], b = null;
      for (let i = S.length - 1; i >= 0; i--) if (S[i].t <= rt) { a = S[i]; b = S[i + 1] || null; break; }
      let s;
      if (b) {
        const k = clamp((rt - a.t) / Math.max(1e-3, b.t - a.t), 0, 1);
        const A = a.s, Bs = b.s;
        s = A.map((v, i) => (i === 5 ? v + E.wrapAngle(Bs[i] - v) * k : i === 8 ? Bs[i] : v + (Bs[i] - v) * k));
      } else {
        // no newer update yet: keep going a little in the same direction
        const ex = Math.min(0.1, rt - a.t);
        s = a.s.slice();
        s[0] += s[3] * ex; s[2] += s[4] * ex;
      }
      const m = f.mover;
      m.pos.x = s[0]; m.pos.y = s[1]; m.pos.z = s[2];
      m.vel.x = s[3]; m.vel.z = s[4];
      f.yaw = s[5]; f.pitch = s[6]; m.duck = s[7];
      m.onGround = !!(s[8] & 1);
      f.arms.weapon = s[8] & 2 ? "knife" : "ak";
      if (!f.inst || !f.useBones) this.updateTargetInfo(f);
    }

    moverEvents(f) {
      const m = f.mover;
      f.landed = false;
      const me = f === this.you;
      for (const ev of m.events) {
        if (ev.type === "step") {
          if (me) {
            if (ev.loud) {
              this.audio.play("step", { vol: 0.35, rate: 0.9 + Math.random() * 0.2 });
              this.botHears(m.pos, 24);
              if (this.online) this.net.send({ t: "ev", k: "step" });
            }
          } else if (ev.loud) this.playAt("step", m.pos, 0.9, 0.9 + Math.random() * 0.2);
        } else if (ev.type === "land") {
          f.landed = true;
          f.arms.landPenalty = AK.land * clamp(ev.speed / CFG.jump, 0.3, 1.5);
          if (me) {
            this.audio.play("land", { vol: 0.45 });
            this.botHears(m.pos, 20);
            if (this.online) this.net.send({ t: "ev", k: "land" });
          } else this.playAt("land", m.pos, 0.8);
        } else if (ev.type === "jump") {
          if (me) this.audio.play("jump", { vol: 0.3 });
        }
      }
    }

    botHears(pos, range, loud) {
      const b = this.bot;
      if (!b || !b.alive) return;
      const p = b.mover.pos;
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < range) b.brain.hear(pos, this.now, loud);
    }

    // where someone's head/chest are (Miis with bones get theirs from the bones, in poseAvatar)
    updateTargetInfo(f) {
      const m = f.mover;
      const e = m.eye();
      f.feet.x = m.pos.x; f.feet.y = m.pos.y; f.feet.z = m.pos.z;
      if (f.inst && f.useBones && f.alive) return;
      f.head.x = m.pos.x; f.head.y = m.pos.y + e + 0.07; f.head.z = m.pos.z;
      f.chest.x = m.pos.x; f.chest.y = m.pos.y + e - 0.55; f.chest.z = m.pos.z;
      f.center.x = m.pos.x; f.center.y = m.pos.y + e - 0.6; f.center.z = m.pos.z;
      E.bodyBoxes(m.pos, e, f.yaw, f.boxes);
    }

    // ------------------------------------------------------------------
    // Weapons
    // ------------------------------------------------------------------
    useWeapons(f, want, dt) {
      const a = f.arms, now = this.now, me = f === this.you;
      E.updateArms(a, f.mover, dt, now);
      // switching
      if (want.switchTo && want.switchTo !== a.weapon) {
        a.last = a.weapon;
        a.weapon = want.switchTo;
        a.reloadEnd = 0;
        a.ready = now + (a.weapon === "ak" ? AK.deploy : KNIFE.deploy);
        if (me) {
          this.vm.setWeapon(a.weapon);
          this.audio.play(a.weapon === "ak" ? "deploy" : "knifeDeploy", { vol: 0.6 });
          if (this.online) this.net.send({ t: "ev", k: a.weapon === "ak" ? "deploy" : "knifeDeploy" });
        }
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
          this.later(0.35, () => { this.audio.play("magOut", { vol: 0.7 }); if (this.online) this.net.send({ t: "ev", k: "magOut" }); });
          this.later(1.45, () => { this.audio.play("magIn", { vol: 0.7 }); if (this.online) this.net.send({ t: "ev", k: "magIn" }); });
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
            if (f.brain) f.brain.onShot();
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
    other(f) { return f === this.you ? (this.bot || this.leader()) : this.you; }

    // the nearest person a ray hits (before maxT)
    rayPeople(f, eye, dir, maxT) {
      let best = null;
      for (const t of this.enemiesOf(f)) {
        const hb = E.rayHitboxes(eye, dir, t.boxes, best ? best.t : maxT);
        if (hb && (!best || hb.t < best.t)) best = Object.assign(hb, { target: t });
      }
      return best;
    }

    shoot(f, dir) {
      const me = f === this.you;
      const eye = this.eyeOf(f);
      const wh = this.world.ray(eye, dir, 120);
      const maxT = wh ? wh.t : 120;
      const hb = this.rayPeople(f, eye, dir, maxT);
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
        from = this.muzzleOf(f);
        const d = Math.hypot(eye.x - this.camera.position.x, eye.z - this.camera.position.z);
        this.playAt(d > 18 ? "akFar" : "ak", eye, 0.9, 0.95 + Math.random() * 0.1);
      }
      this.launchBall(from, end, f.color);
      if (me) this.botHears(eye, 999, true);
      if (me && this.online) {
        const r2 = (v) => Math.round(v * 100) / 100;
        this.net.send({ t: "shot", o: [r2(from.x), r2(from.y), r2(from.z)], e: [r2(end.x), r2(end.y), r2(end.z)], n: !hb && wh ? [r2(wh.nx), r2(wh.ny), r2(wh.nz)] : null, m: wh && !hb ? wh.mat : "" });
      }
      if (hb) {
        this.hit(f, hb.target, hb.zone, E.damageFor(hb.zone, hb.t), end, dir, "ak", hb.box);
      } else if (wh) {
        this.later(endT / 140, () => {
          this.splat(end, { x: wh.nx, y: wh.ny, z: wh.nz }, f.color, 0.22 + Math.random() * 0.14);
          this.playAt(wh.mat === "wood" ? "hitWood" : "hitWall", end, 0.5);
        });
      }
    }

    knife(f, heavy) {
      const a = f.arms, now = this.now, me = f === this.you;
      const eye = this.eyeOf(f);
      const dir = E.forward(f.yaw, f.pitch);
      const range = heavy ? KNIFE.stab.range : KNIFE.slash.range;
      const wall = this.world.ray(eye, dir, range + 0.5);
      let hb = this.rayPeople(f, eye, dir, wall ? wall.t : range + 0.5);
      if (hb && hb.t > range + 0.35) hb = null;
      if (!hb) {
        // a wide swing still catches someone right in front of you
        for (const t of this.enemiesOf(f)) {
          const tc = t.chest;
          const dx = tc.x - eye.x, dy = tc.y - eye.y, dz = tc.z - eye.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < range + 0.45 && (dx * dir.x + dy * dir.y + dz * dir.z) / d > 0.88 && this.world.clear(eye, tc) && (!hb || d < hb.t)) hb = { t: d, zone: "chest", box: null, target: t };
        }
      }
      if (me) {
        if (heavy) this.vm.stab(); else { this.vm.slash(f.slashAlt); f.slashAlt ^= 1; }
        this.audio.play(heavy ? "stab" : "slash", { vol: 0.7 });
        if (this.online) this.net.send({ t: "ev", k: heavy ? "stab" : "slash" });
      }
      if (hb) {
        const target = hb.target;
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
      attacker.stats.hits++;
      // paint on them + the hit sound right away (feels instant even online)
      if (victim.inst) {
        this.splatOnMii(victim, point, box, attacker.color);
        if (attacker === this.you) this.audio.play(zone === "head" ? "hitHead" : "hitBody", { vol: zone === "head" ? 1 : 0.7 });
      }
      if (this.online) {
        // the server is the referee: it takes the HP off and tells everyone
        if (attacker === this.you) {
          attacker.stats.dmg += Math.min(dmg, victim.hp);
          this.net.send({ t: "hit", v: victim.netId, z: zone, d: dmg, w: weapon, b: back ? 1 : 0 });
        }
        return;
      }
      const before = victim.hp;
      victim.hp = Math.max(0, victim.hp - dmg);
      const dealt = before - victim.hp;
      attacker.stats.dmg += dealt;
      attacker.given.dmg += dealt; attacker.given.hits++;
      victim.taken.dmg += dealt; victim.taken.hits++;
      // getting hit slows you down ("tagging") and knocks your aim
      const v = victim.mover.vel;
      if (victim.mover.onGround) { v.x *= 0.45; v.z *= 0.45; }
      victim.arms.recY += zone === "head" ? 1.2 : 0.6;
      victim.flinch = 1;
      if (victim.brain) victim.brain.hear(attacker.mover.pos, this.now, true);
      if (victim === this.you) {
        this.screenSplat(attacker.color, zone === "head" ? 1.4 : 1);
        this.audio.play(zone === "head" ? "hitHead" : "hurt", { vol: 0.8 });
        this.hurtFrom(attacker);
      }
      if (victim.hp <= 0) this.kill(attacker, victim, weapon, zone === "head", back);
    }

    kill(attacker, victim, weapon, head, back, fromNet) {
      if (!victim.alive && !fromNet) return;
      victim.alive = false;
      victim.killer = { f: attacker, weapon, head };
      victim.stats.deaths++;
      attacker.stats.kills++;
      if (head) attacker.stats.hs++;
      this.killFeed(attacker, victim, weapon, head);
      if (attacker === this.you) this.audio.play("kill", { vol: 0.9 });
      if (victim.inst) {
        victim.dead = 0.0001;
        victim.gun.visible = false;
      }
      if (this.mode === "respawn") {
        if (!fromNet) attacker.score++;
        victim.respawnAt = this.now + RESPAWN;
        this.botLearns(this.bot && (attacker === this.bot || victim === this.bot) ? attacker : null);
        if (attacker === this.you) this.banner("+1", (head ? "🎯 " : "") + "Splattered " + victim.name, "win", 1.2);
        this.updateScore();
      }
      if (victim === this.you) {
        this.deathCam = { t: 0, from: this.eyeOf(victim), killer: attacker };
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
        if (this.mode === "respawn") { this.hudRespawn = el("div", "again", "Respawning…"); d.appendChild(this.hudRespawn); }
        d.classList.add("show");
      }
      if (this.mode === "rounds") {
        const why = attacker === this.you
          ? (weapon === "knife" ? "You got " + victim.name + " with the knife!" : head ? "Headshot! 🎯" : victim.name + " got splattered")
          : (weapon === "knife" ? victim.name + " got knifed" : head ? attacker.name + " got you with a headshot" : attacker.name + " splattered you");
        this.endRound(attacker, why);
      } else if (!this.online && attacker.score >= this.toWin) {
        // first to 20: a moment to see it, then the results
        this.phase = "over";
        this.audio.play(attacker === this.you ? "matchWin" : "matchLose");
        this.banner(attacker === this.you ? "VICTORY" : "DEFEAT", attacker.name + " got " + this.toWin + " eliminations", attacker === this.you ? "win" : "lose");
        setTimeout(() => this.finish(attacker), 2500);
      }
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

    splatOnMii(f, p, box, color) {
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
      const parent = (box && box.bone) || f.inst.holder;
      parent.attach(m);
      f.paint.push(m);
      if (f.paint.length > 40) f.paint.shift().removeFromParent();
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
        else { b = new THREE.Mesh(this.ballGeo, root.PBModels.paintBallMaterial(color)); b.userData.color = color; this.scene.add(b); this.balls.push(b); }
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
    muzzleOf(f) {
      const g = f.gun;
      if (!g) return new THREE.Vector3(f.mover.pos.x, f.mover.pos.y + 1.3, f.mover.pos.z);
      g.updateMatrixWorld();
      return new THREE.Vector3(0, 0.08, 0.8).applyMatrix4(g.matrixWorld);
    }
    botMuzzle() { return this.muzzleOf(this.bot); }

    draw(dt) {
      const y = this.you;
      const t = performance.now() / 1000;

      // ---- the camera is your eyes ----
      const cam = this.camera;
      if (this.deathCam) {
        // you got splattered: drop down and look at who did it
        const dc = this.deathCam;
        dc.t = Math.min(1, dc.t + dt * 1.6);
        const e = dc.from;
        cam.position.set(e.x, lerp(e.y, y.mover.pos.y + 0.45, dc.t * dc.t), e.z);
        const k = (dc.killer || this.other(y)).mover.pos;
        const ang = E.anglesTo(cam.position, { x: k.x, y: k.y + 1.2, z: k.z });
        y.yaw += E.wrapAngle(ang.yaw - y.yaw) * Math.min(1, dt * 4);
        y.pitch += (ang.pitch - y.pitch) * Math.min(1, dt * 4);
        cam.rotation.set(y.pitch, y.yaw, 0.35 * dc.t);
        if (this.hudRespawn && y.respawnAt) this.hudRespawn.textContent = "Respawning in " + Math.max(0, y.respawnAt - this.now).toFixed(1) + "…";
      } else {
        const m = y.mover;
        cam.position.set(m.pos.x, m.pos.y + m.eye(), m.pos.z);
        y.flinch = Math.max(0, y.flinch - dt * 6);
        const a = y.arms;
        // CS shows 45% of the recoil on your view (bullets go where the full recoil points)
        cam.rotation.set(y.pitch + a.recY * DEG * 0.45 + y.flinch * 0.012, y.yaw - a.recX * DEG * 0.45, 0);
      }

      for (const f of this.fighters) if (f.inst) this.poseAvatar(f, dt, t);

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

    // moves a Mii's body to match its movement and aim (and its hit boxes with it)
    poseAvatar(f, dt, t) {
      const inst = f.inst, m = f.mover;
      const h = inst.holder;
      const show = f.alive || f.dead > 0;
      h.visible = show;
      if (!show) { f.gun.visible = false; return; }
      const spd = m.speed2d();
      const walk = clamp(spd / (CFG.speedAK * 0.75), 0, 1);
      const stepLen = inst.rig.stepLength(f.style) * MII_SCALE;
      f.walkPhase += (spd * dt) / Math.max(0.3, stepLen) * Math.PI;
      const knife = f.arms.weapon === "knife";
      inst.rig.pose({
        t, dt, walk, phase: f.walkPhase, style: f.style, arms: f.dead ? "down" : knife ? "knife" : "aim",
        crouch: m.duck, aimPitch: f.pitch, lookUp: f.pitch * 0.5,
      });
      h.position.set(m.pos.x, m.pos.y - inst.rig.drop * MII_SCALE, m.pos.z);
      if (f.dead) {
        // falls over backwards, covered in paint
        f.dead = Math.min(1, f.dead + dt * 2.4);
        const e = 1 - Math.pow(1 - f.dead, 3);
        h.rotation.set(-e * 1.45, f.yaw + Math.PI, 0, "YXZ");
      } else {
        h.rotation.set(0, f.yaw + Math.PI, 0, "YXZ");
      }
      h.updateMatrixWorld(true);
      if (f.alive) this.boneHitboxes(f);
      // the gun sits in the right hand, pointing where the Mii aims
      f.gun.visible = f.alive && !knife;
      if (f.gun.visible) {
        const wr = f.bones.wr || f.bones.a2r;
        const v = new THREE.Vector3();
        if (wr) wr.getWorldPosition(v); else v.set(m.pos.x, m.pos.y + 1.1, m.pos.z);
        f.gun.position.copy(v);
        f.gun.rotation.set(-f.pitch, f.yaw + Math.PI, 0, "YXZ");
        const fw = E.forward(f.yaw, f.pitch);
        f.gun.position.x += fw.x * 0.05; f.gun.position.z += fw.z * 0.05;
      }
    }
    poseBot(dt, t) { if (this.bot) this.poseAvatar(this.bot, dt, t); }

    // run the game faster than real time without drawing (for tests)
    advance(secs) {
      const n = Math.round(secs / TICK);
      for (let i = 0; i < n && !this.disposed && !(this.over && !this.online); i++) {
        this.tick(TICK);
        if (i % 4 === 0) for (const f of this.fighters) if (f.inst) this.poseAvatar(f, TICK * 4, this.now);
      }
    }

    // a Mii's hit boxes follow its bones (crouching, leaning...)
    boneHitboxes(f) {
      const B = f.bones, out = f.boxes;
      out.length = 0;
      const k = MII_SCALE;
      if (!f.useBones) { E.bodyBoxes(f.mover.pos, f.mover.eye(), f.yaw, out); return; }
      const P = (bone) => { const v = new THREE.Vector3(); bone.getWorldPosition(v); return v; };
      const head = P(B.head), s1 = P(B.s1), s2 = P(B.s2);
      const hc = head.clone(); hc.y += 0.36 * k;
      const fw = E.forward(f.yaw, 0);
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
      f.head.x = hc.x; f.head.y = hc.y; f.head.z = hc.z;
      f.chest.x = (s2.x + head.x) / 2; f.chest.y = (s2.y + head.y) / 2; f.chest.z = (s2.z + head.z) / 2;
      f.center.x = s2.x; f.center.y = s2.y; f.center.z = s2.z;
      f.feet.x = f.mover.pos.x; f.feet.y = f.mover.pos.y; f.feet.z = f.mover.pos.z;
    }

    updateHUD() {
      const y = this.you, a = y.arms;
      const now = this.now;
      // the clock: round time (rounds), or time left in the match (respawn)
      if (this.phase === "freeze") this.clockLeft = this.phaseEnd - now;
      else if (this.mode === "rounds") { if (this.phase !== "end") this.clockLeft = this.roundEnd - now; }
      else if (!this.over && this.phase === "live") this.clockLeft = this.matchEnd - now;
      let secs = Math.max(0, Math.ceil(this.clockLeft || 0));
      const txt = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
      if (this.hudClock.textContent !== txt) {
        this.hudClock.textContent = txt;
        const low = this.phase === "live" && secs <= 10;
        this.hudClock.classList.toggle("low", low);
        if (low && secs <= 5 && secs > 0) this.audio.play("tick", { vol: 0.4 });
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
      if (this.hudBoard.classList.contains("show") && (!this.boardT || Math.abs(now - this.boardT) > 0.5)) { this.boardT = now; this.renderBoard(); }
      if (this.online) {
        const pg = this.net.ping != null ? this.net.ping + " ms" : "";
        if (this.hudNet.textContent !== pg) this.hudNet.textContent = pg;
      }
    }

    // ------------------------------------------------------------------
    // The end
    // ------------------------------------------------------------------
    finish(winner, why) {
      if (this.over) return;
      this.over = true;
      if (!this.online) this.paused = true;
      if (document.exitPointerLock && this.locked()) document.exitPointerLock();
      const won = winner === this.you;
      const ov = this.ovResult;
      ov.innerHTML = "";
      const p = el("div", "pb-panel pb-result");
      const big = why === "disconnected" ? "DISCONNECTED" : won ? "VICTORY" : winner ? "DEFEAT" : "DRAW";
      p.appendChild(el("div", "big " + (won ? "win" : winner ? "lose" : ""), big));

      if (!this.online) {
        const result = won ? "you" : winner ? "mii" : "draw";
        const st = this.opts.statsFor(this.o.opp);
        st.played = (st.played || 0) + 1;
        if (won) st.losses = (st.losses || 0) + 1; else if (winner) st.wins = (st.wins || 0) + 1;
        this.opts.onSave(this.o.opp);
        if (this.opts.onFinish) this.opts.onFinish({ result, you: this.o.you, opp: this.o.opp, score: { you: this.you.score, bot: this.bot.score } });
        p.appendChild(el("div", "score", this.you.score + " – " + this.bot.score));
      } else {
        p.appendChild(el("div", "score", winner ? winner.name + " wins with " + winner.score : why || ""));
      }
      if (why && why !== "disconnected") p.appendChild(el("p", null, why));
      const tbl = el("table");
      tbl.innerHTML = "<tr><th></th><th>" + (this.mode === "rounds" ? "Rounds" : "Score") + "</th><th>K</th><th>D</th><th>HS %</th></tr>";
      for (const f of this.fighters.slice().sort((x, z) => z.score - x.score)) {
        const s = f.stats;
        const tr = el("tr");
        const n = el("td", null, f.name + (f === this.you ? " (you)" : "")); n.style.color = f.color;
        tr.appendChild(n);
        for (const c of [f.score, s.kills, s.deaths, s.kills ? Math.round((s.hs / s.kills) * 100) + "%" : "–"]) tr.appendChild(el("td", null, String(c)));
        tbl.appendChild(tr);
      }
      p.appendChild(tbl);
      const G = root.MiniGames;
      if (!this.online && G && G.talk && root.Dialogue) {
        const st = this.opts.statsFor(this.o.opp);
        const line = G.talk(won ? "loseMatch" : winner ? "winMatch" : "draw", root.Dialogue.traits(this.o.opp));
        p.appendChild(el("div", "say", this.bot.name + ": “" + line + "”"));
        p.appendChild(el("div", "grow", this.botLearned >= 0.5
          ? this.bot.name + " got better at Paintball! +" + this.botLearned.toFixed(0) + " skill (" + G.skillLevel(st.skill) + ")"
          : this.bot.name + "'s Paintball skill: " + G.skillLevel(st.skill)));
      }
      const btns = el("div", "btns");
      if (this.online) {
        const back = el("button", "pb-btn primary", why === "disconnected" ? "OK" : "Back to the room");
        back.addEventListener("click", () => this.o.onExit("room"));
        const leave = el("button", "pb-btn", "Leave");
        leave.addEventListener("click", () => this.o.onExit("leave"));
        btns.append(back, leave);
      } else {
        const again = el("button", "pb-btn primary", "Rematch");
        again.addEventListener("click", () => this.o.onRematch());
        const lobby = el("button", "pb-btn", "Change Miis");
        lobby.addEventListener("click", () => this.o.onExit("lobby"));
        const hub = el("button", "pb-btn", "Back to the hub");
        hub.addEventListener("click", () => this.o.onExit("hub"));
        btns.append(again, lobby, hub);
      }
      p.appendChild(btns);
      ov.appendChild(p);
      ov.classList.add("show");
    }
    finishMatch() { this.finish(this.you.score > this.bot.score ? this.you : this.bot); }

    quit() {
      this.over = true;
      if (document.exitPointerLock && this.locked()) document.exitPointerLock();
      this.o.onExit(this.online ? "leave" : "lobby");
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      cancelAnimationFrame(this.raf);
      if (this.unbind) this.unbind();
      if (this.netOff) this.netOff();
      window.removeEventListener("resize", this.onResize);
      if (document.exitPointerLock && this.locked()) document.exitPointerLock();
      try { this.vm.dispose(); } catch (e) { /* ignore */ }
      try { this.map.dispose(); } catch (e) { /* ignore */ }
      try { this.audio.dispose(); } catch (e) { /* ignore */ }
      for (const f of this.fighters) if (f.inst && root.MiiModel.disposeObject) root.MiiModel.disposeObject(f.inst.holder);
      for (const m of this.splatMats.values()) m.dispose();
      this.splatGeo.dispose(); this.ballGeo.dispose();
      for (const t of this.splatTex) t.dispose();
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
      if (root.__pb === this) root.__pb = null;
    }
  }

  root.Paintball = { open, Match, TO_WIN, RESPAWN_TO_WIN, paintColor, el };
})(window);
