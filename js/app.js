/*
 * app.js
 * Connects the buttons and side panels on the page to the 3D hub,
 * and loads/saves the Miis.
 */
(async function () {
  "use strict";

  const M = window.MiiModel;
  const D = window.Dialogue;
  const S = window.MiiStorage;
  const $ = (id) => document.getElementById(id);
  const errorMsg = $("errorMsg");

  // ---------- colour choices for the editor ----------
  const SKINS = ["#ffd3ad", "#ffb669", "#de7942", "#ffaa8c", "#ad5129", "#632c18"];
  const HAIRS = ["#1e1a18", "#402010", "#5c1812", "#7c3a14", "#787878", "#4e3e10", "#84581c", "#d0a04a"];
  const SHIRTS = M.FAVORITE_COLORS.map((c) => c.hex).concat(["#191f40"]);
  const PANTS = ["#40464e", "#2b3a67", "#1c1c1c", "#6b4f2a", "#c9b38a", "#5a6b3a", "#e0e0e0"];
  const EYES = ["#0a4a35", "#000000", "#6c7070", "#663c2c", "#4870a0", "#605e30"];


  // Wait for the rounded font, so signs and posters drawn in 3D use it too.
  try {
    await Promise.all(["400", "700", "800"].map((w) => document.fonts.load(w + " 20px Nunito")));
  } catch (e) { /* the font is optional */ }

  // ---------- the hub ----------
  const hub = new window.MiiHub3D.Hub3D($("hub"), $("overlay"));
  const settings = S.loadSettings();
  hub.friendships = settings.friendships || {};
  hub.chattiness = settings.chattiness || 1;
  $("chatty").value = hub.chattiness;
  hub.setScene(settings.scene && window.World3D.list.some((l) => l.id === settings.scene) ? settings.scene : "park");

  // ---------- templates (one per .glb file) ----------
  const templates = new Map();
  function base64ToBuffer(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }
  function sampleTemplate() {
    if (!templates.has("sample")) {
      const s = window.SAMPLE_GLBS[0];
      templates.set("sample", M.loadTemplate(base64ToBuffer(s.base64), s.fileName));
    }
    return templates.get("sample");
  }
  function templateFor(record) {
    if (record.kind === "glb") {
      if (!templates.has(record.id)) templates.set(record.id, M.loadTemplate(record.bytes.slice(0), record.fileName));
      return templates.get(record.id);
    }
    return sampleTemplate();
  }

  function lookFor(record, template) {
    const look = Object.assign({}, record.look || {});
    look.name = record.name || template.info.name;
    look.favoriteColorName = M.colorName(look.shirt || template.source.shirt, "top");
    return look;
  }

  async function addRecord(record, silent) {
    // every Mii gets a personality (you can change it from its menu)
    if (!record.personality) {
      record.personality = D.randomPersonality();
      S.putMii(record);
    }
    const template = await templateFor(record);
    return hub.addWalker(record, template, lookFor(record, template), silent);
  }

  // ---------- scene buttons ----------
  const tabs = $("sceneTabs");
  for (const scene of window.World3D.list) {
    const b = document.createElement("button");
    b.className = "scene-tab";
    b.textContent = scene.icon + " " + scene.name;
    b.dataset.scene = scene.id;
    b.addEventListener("click", () => { hub.setScene(scene.id); saveSettings(); updateTabs(); });
    tabs.appendChild(b);
  }
  function updateTabs() {
    for (const b of document.querySelectorAll("[data-scene]")) b.setAttribute("aria-pressed", String(b.dataset.scene === hub.world.id));
  }

  function saveSettings() {
    S.saveSettings({ scene: hub.world.id, friendships: hub.friendships, chattiness: hub.chattiness });
  }

  // ---------- loading .glb files ----------
  async function loadFiles(files) {
    errorMsg.textContent = "";
    const problems = [];
    for (const file of files) {
      try {
        if (/\.(miic|mii|ffsd|cfsd)$/i.test(file.name)) {
          throw new Error("this app now uses 3D .glb files. In Mii Creator, export your Mii as a 3D model (.glb)");
        }
        if (file.size > 30 * 1024 * 1024) throw new Error("file is too big");
        const bytes = await file.arrayBuffer();
        M.readInfo(new Uint8Array(bytes), file.name); // throws if it isn't a .glb
        const record = { id: "glb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), kind: "glb", fileName: file.name, bytes, look: {}, added: Date.now() };
        await addRecord(record);
        S.putMii(record);
      } catch (e) {
        problems.push(file.name + " (" + e.message + ")");
      }
    }
    if (problems.length) errorMsg.textContent = "Couldn't add: " + problems.join("; ");
  }

  $("fileInput").addEventListener("change", (e) => {
    loadFiles(Array.from(e.target.files));
    e.target.value = "";
  });

  const stage = $("stage");
  stage.addEventListener("dragover", (e) => { e.preventDefault(); stage.classList.add("dragover"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragover"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("dragover");
    loadFiles(Array.from(e.dataTransfer.files));
  });

  // ---------- demo friends ----------
  // ---------- random generic Miis ----------
  // New players start with a few of these, and "Add random Miis" makes more.
  const NAMES = ["Mia", "Leo", "Ava", "Sam", "Kai", "Zoe", "Max", "Ivy", "Ben", "Lily", "Owen", "Ruby", "Finn", "Nora", "Theo",
    "Ella", "Jack", "Maya", "Noah", "Rosa", "Eli", "Luna", "Hugo", "Iris", "Gus", "June", "Omar", "Pia", "Ravi", "Suki",
    "Toby", "Vera", "Wade", "Yuki", "Zara", "Ash", "Bea", "Cole", "Dina", "Ezra", "Fay", "Gabe", "Hana", "Ian", "Jade",
    "Kian", "Lena", "Milo", "Nia", "Otto", "Pax", "Quinn", "Remy", "Sol", "Tess", "Uma", "Vic", "Wren", "Xavi", "Yara"];
  const CATCHPHRASES = ["Let's gooo!", "Yay, friends!", "Boop!", "Interesting!", "Oh, um... okay!", "Back in my day...",
    "Easy peasy!", "Wowza!", "Hmph. Fine.", "Let's do this!", "Snack time?", "You got this!", "Whoopsie!", "Neat-o!", ""];
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function randomMiiRecord(taken) {
    const free = NAMES.filter((n) => !taken.has(n));
    const name = free.length ? rnd(free) : rnd(NAMES) + " " + (2 + Math.floor(Math.random() * 8));
    taken.add(name);
    const personality = D.randomPersonality();
    // spread personalities out a bit so Miis feel different from each other
    for (const k of ["energy", "social", "chatty", "humor", "kindness"]) {
      personality[k] = Math.round(Math.max(5, Math.min(95, 50 + (Math.random() - 0.5) * 90)));
    }
    personality.catchphrase = rnd(CATCHPHRASES);
    return {
      id: "mii-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      kind: "demo", // built from the bundled model, recoloured
      name,
      look: { skin: rnd(SKINS), hair: rnd(HAIRS), shirt: rnd(SHIRTS), pants: rnd(PANTS), eyes: rnd(EYES), beard: Math.random() < 0.2 },
      personality,
      added: Date.now(),
    };
  }

  async function addRandomMiis(count) {
    const taken = new Set(hub.walkers.map((w) => w.look.name));
    for (let i = 0; i < count; i++) {
      const record = randomMiiRecord(taken);
      await addRecord(record);
      S.putMii(record);
    }
  }
  $("demoBtn").addEventListener("click", () => { errorMsg.textContent = ""; addRandomMiis(3); });

  $("chatty").addEventListener("input", (e) => { hub.chattiness = parseFloat(e.target.value); saveSettings(); });

  $("clearBtn").addEventListener("click", () => {
    if (hub.walkers.length && confirm("Send all Miis home? (This removes them from the hub.)")) {
      hub.clearAll();
      S.clearMiis();
      saveSettings();
    }
  });

  // ---------- roster ----------
  let editingId = null;
  const portraits = new Map(); // id -> { key, url }

  function portraitFor(w) {
    const key = JSON.stringify(w.look);
    const cached = portraits.get(w.id);
    if (cached && cached.key === key) return cached.url;
    const url = M.portrait(w.template, w.look, 96);
    portraits.set(w.id, { key, url });
    return url;
  }

  function renderRoster() {
    const list = $("roster");
    list.innerHTML = "";
    $("count").textContent = hub.walkers.length;
    if (!hub.walkers.length) {
      list.innerHTML = '<li class="empty">No Miis yet. Add some above!</li>';
      return;
    }
    for (const w of hub.walkers) {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "row";

      const img = document.createElement("img");
      img.alt = "";
      img.src = portraitFor(w);

      const info = document.createElement("div");
      info.className = "info";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = w.look.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = D.personalityLabel(w.record.personality);
      if (!w.inst.rig.canAnimate) {
        // e.g. a "head only" export: it can't walk properly
        const warn = document.createElement("div");
        warn.className = "warn";
        warn.textContent = "⚠ No skeleton found, so it can only hop. Export it from Mii Creator as \"Full body\".";
        meta.appendChild(warn);
      }
      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      const edit = document.createElement("button");
      edit.textContent = "✏️";
      edit.title = "Change " + w.look.name + "'s colours";
      edit.addEventListener("click", () => { editingId = editingId === w.id ? null : w.id; renderRoster(); });
      const remove = document.createElement("button");
      remove.textContent = "🗑️";
      remove.title = "Send " + w.look.name + " home";
      remove.addEventListener("click", () => {
        hub.removeWalker(w.id);
        S.deleteMii(w.id);
        portraits.delete(w.id);
        saveSettings();
      });
      actions.append(edit, remove);

      row.append(img, info, actions);
      // click the picture or name to open the Mii's menu
      for (const el of [img, info]) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => openMiiMenu(w, e.clientX, e.clientY));
      }
      li.appendChild(row);
      if (editingId === w.id) li.appendChild(buildEditor(w));
      list.appendChild(li);
    }
  }

  function changeLook(w, change) {
    w.record.look = Object.assign({}, w.record.look, change);
    const look = lookFor(w.record, w.template);
    w.look = look;
    w.buildModel();
    S.putMii(w.record);
    renderRoster();
  }

  function buildEditor(w) {
    const box = document.createElement("div");
    box.className = "editor";
    const current = w.record.look || {};

    function swatchRow(label, colors, key) {
      const l = document.createElement("div");
      l.className = "editor-row";
      const span = document.createElement("span");
      span.textContent = label;
      const row = document.createElement("div");
      row.className = "swatches";
      for (const c of colors) {
        const s = document.createElement("button");
        s.type = "button";
        s.className = "swatch" + (current[key] === c ? " selected" : "");
        s.style.background = c;
        s.title = label + " " + c;
        s.addEventListener("click", () => changeLook(w, { [key]: c }));
        row.appendChild(s);
      }
      l.append(span, row);
      return l;
    }

    const beardRow = document.createElement("div");
    beardRow.className = "editor-row";
    const beardLabel = document.createElement("span");
    beardLabel.textContent = "Beard";
    const sel = document.createElement("select");
    sel.innerHTML = '<option value="keep">As in the file</option><option value="no">No beard</option>';
    sel.value = current.beard === false ? "no" : "keep";
    sel.addEventListener("change", () => changeLook(w, { beard: sel.value === "no" ? false : true }));
    beardRow.append(beardLabel, sel);

    const reset = document.createElement("button");
    reset.className = "link-btn";
    reset.textContent = "Reset to original colours";
    reset.addEventListener("click", () => { w.record.look = {}; changeLook(w, {}); });

    box.append(
      swatchRow("Skin", SKINS, "skin"),
      swatchRow("Hair", HAIRS, "hair"),
      swatchRow("Top", SHIRTS, "shirt"),
      swatchRow("Pants", PANTS, "pants"),
      swatchRow("Eyes", EYES, "eyes"),
      beardRow,
      reset,
    );
    return box;
  }

  // ---------- friendships & feed ----------
  function renderFriends() {
    const list = $("friends");
    list.innerHTML = "";
    const byId = new Map(hub.walkers.map((w) => [w.id, w]));
    const pairs = Object.entries(hub.friendships)
      .map(([key, pts]) => { const [a, b] = key.split("|"); return { a: byId.get(a), b: byId.get(b), pts }; })
      .filter((p) => p.a && p.b && p.pts > 0)
      .sort((x, y) => y.pts - x.pts)
      .slice(0, 10);
    if (!pairs.length) {
      list.innerHTML = '<li class="empty">Nobody has met yet. Give them a minute!</li>';
      return;
    }
    for (const p of pairs) {
      const level = D.levelFor(p.pts);
      const li = document.createElement("li");
      li.textContent = p.a.look.name + " & " + p.b.look.name;
      const lv = document.createElement("span");
      lv.className = "level";
      lv.textContent = level.emoji + " " + level.name;
      li.appendChild(lv);
      list.appendChild(li);
    }
  }

  function renderFeed() {
    const list = $("feed");
    list.innerHTML = "";
    if (!hub.feed.length) {
      list.innerHTML = '<li class="empty">Nothing yet…</li>';
      return;
    }
    for (const item of hub.feed.slice(0, 12)) {
      const li = document.createElement("li");
      li.textContent = item.text;
      list.appendChild(li);
    }
  }

  let pending = false;
  let rosterCount = -1;
  hub.onChange = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      // only rebuild the roster when Miis come or go (portraits are slow-ish to draw)
      if (hub.walkers.length !== rosterCount) { rosterCount = hub.walkers.length; renderRoster(); }
      renderFriends();
      renderFeed();
      updateTabs();
      saveSettings();
    }, 250);
  };

  // ---------- start ----------
  updateTabs();
  hub.start();

  const saved = (await S.getAllMiis()).sort((a, b) => (a.added || 0) - (b.added || 0));
  if (saved.length) {
    for (const r of saved) {
      try { await addRecord(r, true); } catch (e) { console.warn("Couldn't load saved Mii", e); }
    }
  }
  if (!hub.walkers.length) {
    // First visit: a few random generic Miis to get things going.
    try {
      await addRandomMiis(5);
    } catch (e) {
      errorMsg.textContent = "Couldn't create the starter Miis: " + e.message;
    }
  }
  rosterCount = -1;
  hub.onChange();


  // ---------- the Mii menu (click or right-click a Mii) ----------
  const MG = window.MiniGames;
  // each Mii's record of how good it is at each game
  function gameStats(rec, id) {
    rec.games = rec.games || {};
    if (!rec.games[id]) rec.games[id] = MG.newStats();
    return rec.games[id];
  }

  const menu = document.createElement("div");
  menu.className = "mii-menu";
  menu.hidden = true;
  $("stage").appendChild(menu);
  let menuFor = null;
  let saveTimer = null;

  function saveSoon(record) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => S.putMii(record), 300);
  }

  function closeMiiMenu() {
    menu.hidden = true;
    menuFor = null;
  }

  function openMiiMenu(w, clientX, clientY) {
    menuFor = w;
    const rec = w.record;
    rec.personality = Object.assign({}, D.DEFAULT_PERSONALITY, rec.personality || {});
    const p = rec.personality;
    menu.innerHTML = "";

    // header: picture, name, personality type
    const head = document.createElement("div");
    head.className = "mm-head";
    const img = document.createElement("img");
    img.src = portraitFor(w);
    img.alt = "";
    const titles = document.createElement("div");
    titles.className = "mm-titles";
    const nameInput = document.createElement("input");
    nameInput.className = "mm-name";
    nameInput.value = w.look.name;
    nameInput.maxLength = 12;
    nameInput.setAttribute("aria-label", "Name");
    nameInput.addEventListener("input", () => {
      const name = nameInput.value.trim();
      if (!name) return;
      rec.name = name;
      w.look.name = name;
      w.uiName.textContent = name;
      saveSoon(rec);
      rosterCount = -1;
      hub.onChange();
    });
    const label = document.createElement("div");
    label.className = "mm-label";
    label.textContent = D.personalityLabel(p);
    titles.append(nameInput, label);
    const close = document.createElement("button");
    close.className = "mm-close";
    close.textContent = "✕";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closeMiiMenu);
    head.append(img, titles, close);

    // quick actions
    const acts = document.createElement("div");
    acts.className = "mm-actions";
    for (const [icon, text, kind] of [["👋", "Wave", "wave"], ["💃", "Dance", "dance"], ["🦘", "Jump", "jump"], ["😴", "Nap", "nap"], ["💬", "Catchphrase", "catchphrase"]]) {
      const b = document.createElement("button");
      b.innerHTML = "<span>" + icon + "</span>" + text;
      b.addEventListener("click", () => hub.perform(w, kind));
      acts.appendChild(b);
    }

    // personality sliders
    const pers = document.createElement("div");
    pers.className = "mm-section";
    pers.innerHTML = "<h3>Personality</h3>";
    for (const t of D.TRAITS) {
      const row = document.createElement("label");
      row.className = "mm-slider";
      const lo = document.createElement("span"); lo.textContent = t.low;
      const hi = document.createElement("span"); hi.textContent = t.high;
      const r = document.createElement("input");
      r.type = "range"; r.min = 0; r.max = 100; r.value = p[t.key];
      r.setAttribute("aria-label", t.low + " to " + t.high);
      r.addEventListener("input", () => {
        p[t.key] = Number(r.value);
        label.textContent = D.personalityLabel(p);
        saveSoon(rec);
      });
      r.addEventListener("change", () => { rosterCount = -1; hub.onChange(); });
      row.append(lo, r, hi);
      pers.appendChild(row);
    }
    const cpRow = document.createElement("label");
    cpRow.className = "mm-catch";
    cpRow.textContent = "Catchphrase";
    const cp = document.createElement("input");
    cp.maxLength = 40;
    cp.placeholder = "e.g. Let's gooo!";
    cp.value = p.catchphrase || "";
    cp.addEventListener("input", () => { p.catchphrase = cp.value; saveSoon(rec); });
    cpRow.appendChild(cp);
    pers.appendChild(cpRow);

    // mini-games, with this Mii's skill meter for each
    const games = document.createElement("div");
    games.className = "mm-section";
    games.innerHTML = "<h3>Play a game</h3>";
    for (const g of Object.values(MG.GAMES)) {
      const st = gameStats(rec, g.id);
      const row = document.createElement("div");
      row.className = "mm-game";
      const label = document.createElement("div");
      label.className = "mm-game-name";
      label.innerHTML = "<span>" + g.icon + "</span>" + g.short;
      const meterWrap = document.createElement("div");
      meterWrap.className = "mm-game-meter";
      const meter = document.createElement("div");
      meter.className = "skill-meter";
      const fill = document.createElement("div");
      fill.className = "skill-fill";
      fill.style.width = st.skill.toFixed(0) + "%";
      meter.appendChild(fill);
      const lvl = document.createElement("div");
      lvl.className = "mm-game-level";
      lvl.textContent = MG.skillLevel(st.skill) + " · " + Math.round(st.skill) + (st.played ? " · " + st.played + " played" : "");
      meterWrap.append(meter, lvl);
      const play = document.createElement("button");
      play.className = "mm-play";
      play.textContent = "Play";
      play.title = g.name + " (" + g.format + ")";
      play.addEventListener("click", () => {
        closeMiiMenu();
        window.MiiGamesUI.open({
          walker: w, game: g.id, hub, stage: $("stage"),
          portrait: portraitFor(w), stats: gameStats(rec, g.id),
          onSave: () => saveSoon(rec),
        });
      });
      row.append(label, meterWrap, play);
      games.appendChild(row);
    }

    // best friends
    const fr = document.createElement("div");
    fr.className = "mm-section";
    const pals = hub.walkers.filter((o) => o !== w)
      .map((o) => ({ o, pts: hub.points(w, o) })).filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts).slice(0, 3);
    fr.innerHTML = "<h3>Best friends</h3>";
    const ul = document.createElement("ul");
    if (!pals.length) ul.innerHTML = '<li class="empty">No friends yet!</li>';
    for (const { o, pts } of pals) {
      const li = document.createElement("li");
      const lv = D.levelFor(pts);
      li.textContent = lv.emoji + " " + o.look.name + " — " + lv.name;
      ul.appendChild(li);
    }
    fr.appendChild(ul);

    // footer
    const foot = document.createElement("div");
    foot.className = "mm-foot";
    const look = document.createElement("button");
    look.textContent = "🎨 Change look";
    look.addEventListener("click", () => {
      editingId = w.id;
      renderRoster();
      closeMiiMenu();
      const li = document.querySelector(".roster .editor");
      if (li) li.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const home = document.createElement("button");
    home.className = "danger";
    home.textContent = "🏠 Send home";
    home.addEventListener("click", () => {
      if (!confirm("Send " + w.look.name + " home? (This removes them from the hub.)")) return;
      closeMiiMenu();
      hub.removeWalker(w.id);
      S.deleteMii(w.id);
      portraits.delete(w.id);
      saveSettings();
    });
    foot.append(look, home);

    menu.append(head, acts, games, pers, fr, foot);
    menu.hidden = false;

    // place it next to where you clicked, but keep it inside the hub area
    const st = $("stage").getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = clientX - st.left + 16, y = clientY - st.top - mh / 2;
    if (x + mw > st.width - 8) x = clientX - st.left - mw - 16;
    x = Math.max(8, Math.min(x, st.width - mw - 8));
    y = Math.max(8, Math.min(y, st.height - mh - 8));
    menu.style.left = x + "px";
    menu.style.top = y + "px";
  }

  hub.onSelect = (w, x, y) => openMiiMenu(w, x, y);
  // close the menu when clicking somewhere else or pressing Escape
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== $("hub")) closeMiiMenu();
  });
  $("hub").addEventListener("pointerdown", (e) => {
    if (!menu.hidden && e.button === 0 && !hub.pickWalker(hub.pointerRay(e))) closeMiiMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMiiMenu(); });


  // ---------- full screen (just the 3D scene) ----------
  const stageEl = $("stage");
  const fsBtn = $("fullscreenBtn");
  const isFull = () => document.fullscreenElement === stageEl || document.webkitFullscreenElement === stageEl;
  function toggleFullscreen() {
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (stageEl.requestFullscreen || stageEl.webkitRequestFullscreen).call(stageEl).catch(() => {});
  }
  fsBtn.addEventListener("click", toggleFullscreen);
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) {
    document.addEventListener(ev, () => {
      const on = isFull();
      fsBtn.textContent = on ? "✕" : "⛶";
      fsBtn.title = on ? "Exit full screen (F or Esc)" : "Full screen (F)";
      stageEl.classList.toggle("is-full", on);
      // let the browser finish resizing, then fit the 3D view to the new size
      requestAnimationFrame(() => hub.resize());
    });
  }
  document.addEventListener("keydown", (e) => {
    const typing = /^(input|textarea|select)$/i.test((e.target && e.target.tagName) || "");
    if (!typing && (e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen();
  });

  // little place buttons on the scene itself (handy in full screen)
  const stageScenes = $("stageScenes");
  for (const scene of window.World3D.list) {
    const b = document.createElement("button");
    b.className = "stage-btn";
    b.textContent = scene.icon;
    b.title = scene.name;
    b.setAttribute("aria-label", scene.name);
    b.dataset.scene = scene.id;
    b.addEventListener("click", () => { hub.setScene(scene.id); saveSettings(); updateTabs(); });
    stageScenes.appendChild(b);
  }

  // ---------- desktop app: version and updates ----------
  const desktop = window.miiHubDesktop;
  if (desktop) {
    $("desktopPanel").hidden = false;
    const statusEl = $("updateStatus");
    const btn = $("checkUpdatesBtn");
    const show = (st) => {
      if (!st) return;
      $("appVersion").textContent = "v" + st.version;
      btn.disabled = st.state === "checking" || st.state === "downloading";
      statusEl.textContent = {
        idle: "Updates are checked automatically.",
        dev: "Running from source code: updates are off.",
        checking: "Checking for updates…",
        latest: "You have the latest version. ✓",
        available: "Version " + st.latest + " is available!",
        downloading: "Downloading update… " + (st.percent || 0) + "%",
        ready: "Update ready: it installs when you restart Mii Hub.",
        error: "Couldn't check for updates right now.",
      }[st.state] || "";
    };
    desktop.onUpdateStatus(show);
    desktop.getStatus().then(show);
    btn.addEventListener("click", () => desktop.checkForUpdates());
  }

  window.hub = hub; // handy for poking around in the browser console
})();
