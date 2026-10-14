/*
 * app.js
 * Connects the buttons and side panels on the page to the 3D hub,
 * loads/saves the Miis, and runs home visits (decorating and food).
 */
(async function () {
  "use strict";

  const M = window.MiiModel;
  const D = window.Dialogue;
  const S = window.MiiStorage;
  const H = window.MiiHomes;
  const $ = (id) => document.getElementById(id);
  const errorMsg = $("errorMsg");
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // colours for the random Miis (your own Miis keep the colours from Mii Creator)
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

  // ---------- every Mii you have (out and about, or at home) ----------
  const records = new Map(); // id -> record
  const infos = new Map();   // id -> info from the .glb (name, height...)

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
    // Your own Miis look exactly like they do in Mii Creator. Only the random
    // Miis get colours picked here.
    const look = record.kind === "demo" ? Object.assign({}, record.look || {}) : {};
    look.name = record.name || template.info.name;
    look.favoriteColorName = M.colorName(look.shirt || template.source.shirt, "top");
    return look;
  }

  const nameOf = (rec) => rec.name || (infos.get(rec.id) || {}).name || "Mii";
  const walkerOf = (id) => hub.walkers.find((w) => w.id === id) || (hub.visiting && hub.visiting.record.id === id ? hub.visiting.walker : null);

  function save(record) { S.putMii(record); }
  let saveTimers = new Map();
  function saveSoon(record) {
    clearTimeout(saveTimers.get(record.id));
    saveTimers.set(record.id, setTimeout(() => S.putMii(record), 400));
  }

  async function addRecord(record, silent, opts) {
    // every Mii gets a personality (you can change it from its menu) and a home
    if (!record.personality) record.personality = D.randomPersonality();
    H.ensureHome(record);
    // colours can only be changed in Mii Creator now, so drop any old changes
    if (record.kind === "glb" && record.look && Object.keys(record.look).length) record.look = {};
    records.set(record.id, record);
    const template = await templateFor(record);
    infos.set(record.id, template.info);
    if (!record.name) record.name = template.info.name;
    if (record.atHome) { refreshAll(); return null; }
    return hub.addWalker(record, template, lookFor(record, template), silent, opts);
  }

  // ---------- scene buttons ----------
  const tabs = $("sceneTabs");
  for (const scene of window.World3D.list) {
    const b = document.createElement("button");
    b.className = "scene-tab";
    b.textContent = scene.icon + " " + scene.name;
    b.dataset.scene = scene.id;
    b.addEventListener("click", () => goToScene(scene.id));
    tabs.appendChild(b);
  }
  function goToScene(id) {
    hub.setScene(id);
    saveSettings();
    updateTabs();
  }
  function updateTabs() {
    const current = hub.visiting ? null : hub.world.id;
    for (const b of document.querySelectorAll("[data-scene]")) b.setAttribute("aria-pressed", String(b.dataset.scene === current));
  }

  function saveSettings() {
    const scene = hub.visiting ? (hub.mainWorld && hub.mainWorld.id) : hub.world.id;
    S.saveSettings({ scene, friendships: hub.friendships, chattiness: hub.chattiness });
  }

  // ---------- a little pop-up with choices ----------
  // choices: [{ label, value, kind }] -> resolves with the chosen value (or null)
  function ask(title, text, choices) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "choice-modal";
      const card = document.createElement("div");
      card.className = "choice-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      const h = document.createElement("h3");
      h.textContent = title;
      const p = document.createElement("p");
      p.textContent = text;
      card.append(h, p);
      const done = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") done(null); };
      document.addEventListener("keydown", onKey);
      for (const c of choices) {
        const b = document.createElement("button");
        b.className = "choice-btn" + (c.kind ? " " + c.kind : "");
        b.innerHTML = c.label;
        b.addEventListener("click", () => done(c.value));
        card.appendChild(b);
      }
      back.appendChild(card);
      back.addEventListener("pointerdown", (e) => { if (e.target === back) done(null); });
      $("stage").appendChild(back);
      const first = card.querySelector("button");
      if (first) first.focus();
    });
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
        const info = M.readInfo(new Uint8Array(bytes), file.name); // throws if it isn't a .glb
        // already have a Mii with this name?
        const same = Array.from(records.values()).find((r) => nameOf(r).toLowerCase() === info.name.toLowerCase());
        if (same) {
          const choice = await ask("You already have a Mii called " + info.name + "!", "What would you like to do with this file?", [
            { label: "✨ <b>Update " + escapeHtml(info.name) + "'s look</b><small>New model, same personality, friends, home and coins</small>", value: "update", kind: "primary" },
            { label: "➕ <b>Add as a new Mii</b><small>Keep both</small>", value: "new" },
            { label: "🔄 <b>Replace " + escapeHtml(info.name) + "</b><small>Start fresh: the old one moves away</small>", value: "replace", kind: "danger" },
            { label: "Cancel", value: null, kind: "plain" },
          ]);
          if (!choice) continue;
          if (choice === "update") { await updateModel(same, bytes, file.name); continue; }
          if (choice === "replace") forgetMii(same, true);
          if (choice === "new") {
            const taken = new Set(Array.from(records.values()).map((r) => nameOf(r).toLowerCase()));
            let n = 2;
            while (taken.has((info.name + " " + n).toLowerCase())) n++;
            info.name = info.name + " " + n;
          }
        }
        const record = { id: "glb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), kind: "glb", fileName: file.name, bytes, name: info.name, look: {}, added: Date.now() };
        await addRecord(record);
        save(record);
      } catch (e) {
        problems.push(file.name + " (" + e.message + ")");
      }
    }
    if (problems.length) errorMsg.textContent = "Couldn't add: " + problems.join("; ");
    refreshAll();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // A new .glb for a Mii you already have: new model, same everything else.
  async function updateModel(rec, bytes, fileName) {
    const template = await M.loadTemplate(bytes.slice(0), fileName);
    rec.kind = "glb";
    rec.bytes = bytes;
    rec.fileName = fileName;
    rec.look = {};
    templates.set(rec.id, Promise.resolve(template));
    infos.set(rec.id, template.info);
    portraits.delete(rec.id);
    save(rec);
    const w = walkerOf(rec.id);
    if (w) {
      w.template = template;
      w.look = lookFor(rec, template);
      w.buildModel();
      w.say(pick(["Do you like my new look?", "Ta-da! New me!", "How do I look?"]), 2.5);
      w.hop(4);
    }
    hub.addFeed(nameOf(rec) + " got a new look! ✨");
    refreshAll(true);
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

  // ---------- random generic Miis ----------
  // New players start with a few of these, and "Add random Miis" makes more.
  const NAMES = ["Mia", "Leo", "Ava", "Sam", "Kai", "Zoe", "Max", "Ivy", "Ben", "Lily", "Owen", "Ruby", "Finn", "Nora", "Theo",
    "Ella", "Jack", "Maya", "Noah", "Rosa", "Eli", "Luna", "Hugo", "Iris", "Gus", "June", "Omar", "Pia", "Ravi", "Suki",
    "Toby", "Vera", "Wade", "Yuki", "Zara", "Ash", "Bea", "Cole", "Dina", "Ezra", "Fay", "Gabe", "Hana", "Ian", "Jade",
    "Kian", "Lena", "Milo", "Nia", "Otto", "Pax", "Quinn", "Remy", "Sol", "Tess", "Uma", "Vic", "Wren", "Xavi", "Yara"];
  const CATCHPHRASES = ["Let's gooo!", "Yay, friends!", "Boop!", "Interesting!", "Oh, um... okay!", "Back in my day...",
    "Easy peasy!", "Wowza!", "Hmph. Fine.", "Let's do this!", "Snack time?", "You got this!", "Whoopsie!", "Neat-o!", ""];

  function randomMiiRecord(taken) {
    const free = NAMES.filter((n) => !taken.has(n));
    const name = free.length ? pick(free) : pick(NAMES) + " " + (2 + Math.floor(Math.random() * 8));
    taken.add(name);
    const personality = D.randomPersonality();
    // spread personalities out a bit so Miis feel different from each other
    for (const k of ["energy", "social", "chatty", "humor", "kindness"]) {
      personality[k] = Math.round(Math.max(5, Math.min(95, 50 + (Math.random() - 0.5) * 90)));
    }
    personality.catchphrase = pick(CATCHPHRASES);
    return {
      id: "mii-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      kind: "demo", // built from the bundled model, recoloured
      name,
      look: { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS), eyes: pick(EYES), beard: Math.random() < 0.2 },
      personality,
      added: Date.now(),
    };
  }

  async function addRandomMiis(count) {
    const taken = new Set(Array.from(records.values()).map(nameOf));
    for (let i = 0; i < count; i++) {
      const record = randomMiiRecord(taken);
      await addRecord(record);
      save(record);
    }
  }
  $("demoBtn").addEventListener("click", () => { errorMsg.textContent = ""; addRandomMiis(3); });

  $("chatty").addEventListener("input", (e) => { hub.chattiness = parseFloat(e.target.value); saveSettings(); });

  $("clearBtn").addEventListener("click", async () => {
    if (!records.size) return;
    const ok = await ask("Remove every Mii?", "All your Miis, their homes, coins and friendships will be gone for good.", [
      { label: "<b>Yes, remove everyone</b>", value: true, kind: "danger" },
      { label: "Cancel", value: false, kind: "plain" },
    ]);
    if (!ok) return;
    closeHomePanel();
    hub.clearAll();
    S.clearMiis();
    records.clear();
    portraits.clear();
    saveSettings();
    refreshAll(true);
  });

  // ---------- going home, coming out, moving away ----------
  function sendHome(rec, then, quick) {
    const w = hub.walkers.find((x) => x.id === rec.id);
    const done = () => {
      rec.atHome = true;
      save(rec);
      refreshAll(true);
      if (then) then();
    };
    if (w) hub.sendHome(rec.id, done, quick);
    else done();
  }

  async function inviteOut(rec) {
    if (hub.visiting && hub.visiting.record.id === rec.id) leaveHome();
    rec.atHome = false;
    save(rec);
    const template = await templateFor(rec);
    const door = hub.world.doorFor && hub.world.doorFor(rec.id);
    hub.addWalker(rec, template, lookFor(rec, template), false, {
      at: door || null,
      lines: ["I'm back!", "Hi everyone, I'm out!", "What did I miss?", "Fresh air!"],
      feed: nameOf(rec) + " came out to hang out! 🚪",
    });
    refreshAll(true);
  }

  async function visit(rec) {
    closeMiiMenu();
    const go = async () => {
      const template = await templateFor(rec);
      hub.visitHome(rec, template, lookFor(rec, template));
      openHomePanel(rec);
      updateTabs();
    };
    if (rec.atHome) go();
    else sendHome(rec, go, true);
  }

  function leaveHome() {
    closeHomePanel();
    hub.leaveHome();
    updateTabs();
  }
  hub.onLeftHome = () => { closeHomePanel(); updateTabs(); };

  // Removes a Mii for good. quiet = no goodbye scene (used when replacing it).
  function forgetMii(rec, quiet) {
    if (hub.visiting && hub.visiting.record.id === rec.id) leaveHome();
    if (quiet) hub.removeWalker(rec.id, true);
    else hub.moveAway(rec.id, nameOf(rec));
    records.delete(rec.id);
    templates.delete(rec.id);
    portraits.delete(rec.id);
    S.deleteMii(rec.id);
    saveSettings();
    refreshAll(true);
  }

  async function moveAway(rec) {
    const ok = await ask(nameOf(rec) + " is moving away?", "This removes " + nameOf(rec) + " from your world for good, along with their home, coins and friendships. The other Miis will react depending on how close they were.", [
      { label: "📦 <b>Yes, move away</b>", value: true, kind: "danger" },
      { label: "Cancel", value: false, kind: "plain" },
    ]);
    if (ok) { closeMiiMenu(); forgetMii(rec, false); }
  }

  // Click an apartment in the Apartments to visit whoever lives there.
  hub.onApartmentClick = (id) => {
    const rec = records.get(id);
    if (rec) visit(rec);
  };

  // ---------- roster ----------
  const portraits = new Map(); // id -> { key, url }

  function portraitFor(rec) {
    const tpl = templates.get(rec.id) || (rec.kind !== "glb" ? templates.get("sample") : null);
    const cached = portraits.get(rec.id);
    const key = JSON.stringify(rec.look || {}) + (rec.fileName || "");
    if (cached && cached.key === key) return cached.url;
    // the template might still be loading: draw the picture once it's ready
    if (!cached || cached.key !== key) {
      portraits.set(rec.id, { key, url: cached ? cached.url : "" });
      Promise.resolve(tpl || templateFor(rec)).then((t) => {
        const url = M.portrait(t, lookFor(rec, t), 96);
        portraits.set(rec.id, { key, url });
        document.querySelectorAll('img[data-portrait="' + rec.id + '"]').forEach((img) => { img.src = url; });
      });
    }
    return portraits.get(rec.id).url;
  }

  function sortedRecords() {
    return Array.from(records.values()).sort((a, b) => (a.added || 0) - (b.added || 0));
  }

  function renderRoster() {
    const list = $("roster");
    list.innerHTML = "";
    const all = sortedRecords();
    $("count").textContent = all.length;
    if (!all.length) {
      list.innerHTML = '<li class="empty">No Miis yet. Add some above!</li>';
      return;
    }
    for (const rec of all) {
      const w = hub.walkers.find((x) => x.id === rec.id);
      const li = document.createElement("li");
      if (rec.atHome) li.className = "at-home";
      const row = document.createElement("div");
      row.className = "row";

      const img = document.createElement("img");
      img.alt = "";
      img.dataset.portrait = rec.id;
      img.src = portraitFor(rec);

      const info = document.createElement("div");
      info.className = "info";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = nameOf(rec);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = '<span class="coins" data-coins="' + rec.id + '">🪙 ' + (rec.coins || 0) + "</span> · " +
        escapeHtml(D.personalityLabel(rec.personality)) + (rec.atHome ? ' · <span class="home-tag">🏠 At home</span>' : "");
      if (w && !w.inst.rig.canAnimate) {
        // e.g. a "head only" export: it can't walk properly
        const warn = document.createElement("div");
        warn.className = "warn";
        warn.textContent = "⚠ No skeleton found, so it can only hop. Export it from Mii Creator as \"Full body\".";
        meta.appendChild(warn);
      }
      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      const btn = (icon, title, fn) => {
        const b = document.createElement("button");
        b.textContent = icon;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.addEventListener("click", fn);
        actions.appendChild(b);
      };
      if (rec.atHome) {
        btn("🏡", "Visit " + nameOf(rec) + " at home", () => visit(rec));
        btn("🚪", "Invite " + nameOf(rec) + " out", () => inviteOut(rec));
      } else {
        btn("🏠", "Send " + nameOf(rec) + " home", () => sendHome(rec));
      }

      row.append(img, info, actions);
      // click the picture or name to open the Mii's menu (or visit, if they're home)
      for (const el of [img, info]) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          const ww = walkerOf(rec.id);
          if (ww) openMiiMenu(ww, e.clientX, e.clientY);
          else visit(rec);
        });
      }
      li.appendChild(row);
      list.appendChild(li);
    }
  }

  // Updates just the coin numbers (cheap, so it can happen often).
  function renderCoins() {
    for (const el of document.querySelectorAll("[data-coins]")) {
      const rec = records.get(el.dataset.coins);
      if (rec) el.textContent = "🪙 " + (rec.coins || 0);
    }
  }

  hub.onCoins = (w) => {
    saveSoon(w.record);
    renderCoins();
  };

  // ---------- friendships & feed ----------
  function renderFriends() {
    const list = $("friends");
    list.innerHTML = "";
    const pairs = Object.entries(hub.friendships)
      .map(([key, pts]) => { const [a, b] = key.split("|"); return { a: records.get(a), b: records.get(b), pts }; })
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
      li.textContent = nameOf(p.a) + " & " + nameOf(p.b);
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

  // who lives in which apartment (for the Apartments place)
  function updateResidents() {
    hub.setResidents(sortedRecords().map((r) => ({ id: r.id, name: nameOf(r), home: !!r.atHome })));
  }

  let pending = false;
  let rosterKey = "";
  // force = rebuild the roster even if nobody came or went
  function refreshAll(force) {
    const key = sortedRecords().map((r) => r.id + (r.atHome ? "h" : "") + nameOf(r)).join(",");
    if (force || key !== rosterKey) { rosterKey = key; renderRoster(); updateResidents(); }
    renderFriends();
    renderFeed();
    updateTabs();
  }
  hub.onChange = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      refreshAll(false);
      saveSettings();
    }, 250);
  };

  // ---------- start ----------
  updateTabs();
  hub.start();

  const saved = (await S.getAllMiis()).sort((a, b) => (a.added || 0) - (b.added || 0));
  for (const r of saved) {
    try {
      const hadLook = r.kind === "glb" && r.look && Object.keys(r.look).length;
      const hadHome = !!r.home;
      await addRecord(r, true);
      if (hadLook || !hadHome) save(r);
    } catch (e) { console.warn("Couldn't load saved Mii", e); }
  }
  if (!records.size) {
    // First visit: a few random generic Miis to get things going.
    try {
      await addRandomMiis(5);
    } catch (e) {
      errorMsg.textContent = "Couldn't create the starter Miis: " + e.message;
    }
  }
  refreshAll(true);


  // ---------- the Mii menu (right-click a Mii) ----------
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

  function closeMiiMenu() {
    menu.hidden = true;
  }

  function openMiiMenu(w, clientX, clientY) {
    const rec = w.record;
    rec.personality = Object.assign({}, D.DEFAULT_PERSONALITY, rec.personality || {});
    const p = rec.personality;
    const atHomeVisit = hub.visiting && hub.visiting.walker === w;
    menu.innerHTML = "";

    // header: picture, name, personality type, coins
    const head = document.createElement("div");
    head.className = "mm-head";
    const img = document.createElement("img");
    img.src = portraitFor(rec);
    img.dataset.portrait = rec.id;
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
      hub.onChange();
    });
    const label = document.createElement("div");
    label.className = "mm-label";
    label.innerHTML = escapeHtml(D.personalityLabel(p)) + ' · <span data-coins="' + rec.id + '">🪙 ' + (rec.coins || 0) + "</span>";
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
        label.firstChild.textContent = D.personalityLabel(p) + " · ";
        saveSoon(rec);
      });
      r.addEventListener("change", () => refreshAll(true));
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
      const glabel = document.createElement("div");
      glabel.className = "mm-game-name";
      glabel.innerHTML = "<span>" + g.icon + "</span>" + g.short;
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
          portrait: portraitFor(rec), stats: gameStats(rec, g.id),
          onSave: () => saveSoon(rec),
        });
      });
      row.append(glabel, meterWrap, play);
      games.appendChild(row);
    }

    // best friends (including Miis who are at home right now)
    const fr = document.createElement("div");
    fr.className = "mm-section";
    const pals = sortedRecords().filter((o) => o.id !== rec.id)
      .map((o) => ({ o, pts: hub.friendships[rec.id < o.id ? rec.id + "|" + o.id : o.id + "|" + rec.id] || 0 }))
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts).slice(0, 3);
    fr.innerHTML = "<h3>Best friends</h3>";
    const ul = document.createElement("ul");
    if (!pals.length) ul.innerHTML = '<li class="empty">No friends yet!</li>';
    for (const { o, pts } of pals) {
      const li = document.createElement("li");
      const lv = D.levelFor(pts);
      li.textContent = lv.emoji + " " + nameOf(o) + " — " + lv.name;
      ul.appendChild(li);
    }
    fr.appendChild(ul);

    // footer
    const foot = document.createElement("div");
    foot.className = "mm-foot";
    const homeBtn = document.createElement("button");
    if (atHomeVisit) {
      homeBtn.textContent = "🚪 Invite out";
      homeBtn.title = "Bring " + nameOf(rec) + " back out to hang out";
      homeBtn.addEventListener("click", () => { closeMiiMenu(); inviteOut(rec); });
    } else {
      homeBtn.textContent = "🏠 Send home";
      homeBtn.title = nameOf(rec) + " goes home. You can visit them there, and invite them back out any time.";
      homeBtn.addEventListener("click", () => { closeMiiMenu(); sendHome(rec); });
    }
    const visitBtn = document.createElement("button");
    visitBtn.textContent = "🏡 Visit home";
    visitBtn.addEventListener("click", () => visit(rec));
    const away = document.createElement("button");
    away.className = "danger";
    away.textContent = "📦 Move away";
    away.title = "Remove " + nameOf(rec) + " from your world for good";
    away.addEventListener("click", () => moveAway(rec));
    foot.append(homeBtn);
    if (!atHomeVisit) foot.append(visitBtn);
    foot.append(away);

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
    if (!menu.hidden && e.button === 0) closeMiiMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMiiMenu(); });


  // ---------- visiting a Mii's home: decorating and food ----------
  const panel = document.createElement("div");
  panel.className = "home-panel";
  panel.hidden = true;
  $("stage").appendChild(panel);
  let panelTab = "decorate";
  let panelSlot = "bed";

  // What the Mii says to you while you visit.
  hub.onHomeTalk = (w, kind) => {
    const rec = w.record;
    const p = w.personality;
    if (kind === "hello") {
      if (p.social <= 35) return pick(["Oh! A visitor... h-hi!", "You came to see me? Um, come in..."]);
      if (p.kindness <= 35) return pick(["Oh. It's you. Come in, I guess.", "Wipe your feet."]);
      if (p.energy >= 70) return pick(["YOU'RE HERE! Come in, come in!", "A visitor! Yay!"]);
      return pick(["Welcome to my home!", "Oh, hi! Come on in!", "Make yourself at home!"]);
    }
    return H.homeLine(rec, p, rec.home && rec.home.lastGift);
  };

  function openHomePanel(rec) {
    panel.hidden = false;
    panel.dataset.id = rec.id;
    renderHomePanel();
  }
  function closeHomePanel() {
    panel.hidden = true;
    delete panel.dataset.id;
  }

  const EMOTE = { love: "😍", like: "😊", okay: "🙂", dislike: "😒" };

  function renderHomePanel() {
    const rec = records.get(panel.dataset.id);
    if (!rec) { closeHomePanel(); return; }
    const p = D.traits(rec);
    panel.innerHTML = "";

    const head = document.createElement("div");
    head.className = "hp-head";
    head.innerHTML = "<div><b>🏠 " + escapeHtml(nameOf(rec)) + "'s home</b><div class=\"hp-sub\">Mood " + H.moodFace(rec.mood) +
      ' · <span class="hp-coins" data-coins="' + rec.id + '">🪙 ' + (rec.coins || 0) + "</span></div></div>";
    const leave = document.createElement("button");
    leave.className = "hp-leave";
    leave.textContent = "← Leave";
    leave.title = "Go back outside";
    leave.addEventListener("click", leaveHome);
    head.appendChild(leave);

    const tabsEl = document.createElement("div");
    tabsEl.className = "hp-tabs";
    for (const [id, text] of [["decorate", "🛋️ Decorate"], ["food", "🍙 Give food"], ["more", "⋯ More"]]) {
      const b = document.createElement("button");
      b.textContent = text;
      b.setAttribute("aria-pressed", String(panelTab === id));
      b.addEventListener("click", () => { panelTab = id; renderHomePanel(); });
      tabsEl.appendChild(b);
    }
    panel.append(head, tabsEl);

    const body = document.createElement("div");
    body.className = "hp-body";
    if (panelTab === "decorate") {
      const slots = document.createElement("div");
      slots.className = "hp-slots";
      for (const s of H.SLOTS) {
        const b = document.createElement("button");
        b.textContent = s.icon;
        b.title = s.name;
        b.setAttribute("aria-label", s.name);
        b.setAttribute("aria-pressed", String(panelSlot === s.id));
        b.addEventListener("click", () => { panelSlot = s.id; renderHomePanel(); });
        slots.appendChild(b);
      }
      const slotName = document.createElement("div");
      slotName.className = "hp-slotname";
      slotName.textContent = H.SLOTS.find((s) => s.id === panelSlot).name;
      const grid = document.createElement("div");
      grid.className = "hp-grid";
      for (const it of H.ITEMS.filter((i) => i.slot === panelSlot)) {
        const owned = rec.home.owned.includes(it.id);
        const placed = rec.home.items[it.slot] === it.id;
        const b = document.createElement("button");
        b.className = "hp-item" + (placed ? " placed" : "");
        b.innerHTML = "<span class=\"hp-icon\">" + it.icon + "</span><span class=\"hp-name\">" + escapeHtml(it.name) + "</span><span class=\"hp-price\">" +
          (placed ? "✓ In use" : owned ? "Owned" : "🪙 " + it.price) + "</span>";
        b.disabled = placed || (!owned && (rec.coins || 0) < it.price);
        if (!owned && (rec.coins || 0) < it.price) b.title = nameOf(rec) + " needs " + (it.price - (rec.coins || 0)) + " more coins";
        b.addEventListener("click", () => placeItem(rec, it));
        grid.appendChild(b);
      }
      body.append(slots, slotName, grid);
    } else if (panelTab === "food") {
      const grid = document.createElement("div");
      grid.className = "hp-grid";
      for (const f of H.FOODS) {
        const b = document.createElement("button");
        b.className = "hp-item";
        b.innerHTML = "<span class=\"hp-icon\">" + f.icon + "</span><span class=\"hp-name\">" + escapeHtml(f.name) + "</span><span class=\"hp-price\">🪙 " + f.price + "</span>";
        b.disabled = (rec.coins || 0) < f.price;
        b.addEventListener("click", () => giveFood(rec, f));
        grid.appendChild(b);
      }
      const tip = document.createElement("p");
      tip.className = "hp-tip";
      tip.textContent = "Every Mii has a favourite food (and one they can't stand). Find out by trying!";
      body.append(tip, grid);
    } else {
      const tip = document.createElement("p");
      tip.className = "hp-tip";
      tip.innerHTML = "Miis earn 🪙 coins by spending meaningful time with each other: trying new things, making new friends and stepping out of their comfort zone. " +
        "Chatting about the same thing with the same Mii over and over doesn't earn much. Playing games with you earns coins too.";
      const out = document.createElement("button");
      out.className = "hp-wide";
      out.textContent = "🚪 Invite " + nameOf(rec) + " out";
      out.addEventListener("click", () => inviteOut(rec));
      const away = document.createElement("button");
      away.className = "hp-wide danger";
      away.textContent = "📦 Move away for good";
      away.addEventListener("click", () => moveAway(rec));
      body.append(tip, out, away);
    }
    panel.appendChild(body);
  }

  function placeItem(rec, it) {
    const owned = rec.home.owned.includes(it.id);
    if (!owned) {
      if ((rec.coins || 0) < it.price) return;
      rec.coins -= it.price;
      rec.home.owned.push(it.id);
    }
    rec.home.items[it.slot] = it.id;
    hub.refreshHome();
    if (it.price > 0 || it.tags.length) {
      const p = D.traits(rec);
      const op = H.opinion(p, rec, it);
      // a Mii only gets excited about something the first time
      if (!owned) rec.mood = Math.max(0, Math.min(100, (rec.mood || 60) + H.MOOD_CHANGE[op]));
      if (op !== "dislike") rec.home.lastGift = it.name;
      hub.homeReact(H.reaction("item", op, it, p), EMOTE[op], it.id);
    }
    save(rec);
    renderHomePanel();
    renderCoins();
  }

  function giveFood(rec, f) {
    if ((rec.coins || 0) < f.price) return;
    rec.coins -= f.price;
    const p = D.traits(rec);
    const op = H.opinion(p, rec, f);
    rec.mood = Math.max(0, Math.min(100, (rec.mood || 60) + H.MOOD_CHANGE[op] * 0.6));
    hub.giveFood(f, H.reaction("food", op, f, p), op === "dislike" ? "🤢" : EMOTE[op]);
    save(rec);
    renderHomePanel();
    renderCoins();
  }


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
    b.addEventListener("click", () => goToScene(scene.id));
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
  window.miiApp = { records, visit, sendHome, inviteOut, moveAway, forgetMii, loadFiles, leaveHome }; // for tests
})();
