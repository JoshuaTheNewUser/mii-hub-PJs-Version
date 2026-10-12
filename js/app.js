/*
 * app.js
 * Connects the buttons and side panels on the page to the hub.
 */
(function () {
  "use strict";

  const P = window.MiiParser;
  const D = window.Dialogue;
  const hub = new window.MiiHub.Hub(document.getElementById("hub"));

  const $ = (id) => document.getElementById(id);
  const errorMsg = $("errorMsg");
  let editingId = null;

  // ---------- scene buttons ----------
  const tabs = $("sceneTabs");
  for (const scene of window.Scenes.list) {
    const b = document.createElement("button");
    b.className = "scene-tab";
    b.textContent = scene.icon + " " + scene.name;
    b.dataset.scene = scene.id;
    b.addEventListener("click", () => {
      hub.setScene(scene.id);
      hub.save();
      updateTabs();
    });
    tabs.appendChild(b);
  }
  function updateTabs() {
    for (const b of tabs.children) b.setAttribute("aria-pressed", String(b.dataset.scene === hub.scene.id));
  }

  // ---------- loading files ----------
  async function loadFiles(files) {
    errorMsg.textContent = "";
    const problems = [];
    for (const file of files) {
      try {
        if (file.size > 4096) throw new Error("too big to be a Mii");
        const bytes = new Uint8Array(await file.arrayBuffer());
        hub.addFromBytes(bytes, file.name);
      } catch (e) {
        problems.push(file.name + " (" + e.message + ")");
      }
    }
    if (problems.length) errorMsg.textContent = "Couldn't read: " + problems.join(", ");
  }

  $("fileInput").addEventListener("change", (e) => {
    loadFiles(Array.from(e.target.files));
    e.target.value = "";
  });

  // drag & drop onto the hub
  const stage = $("stage");
  stage.addEventListener("dragover", (e) => { e.preventDefault(); stage.classList.add("dragover"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragover"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("dragover");
    loadFiles(Array.from(e.dataTransfer.files));
  });

  // ---------- demo friends ----------
  let demoIndex = 0;
  function addDemoFriends(count) {
    const taken = new Set(hub.walkers.map((w) => w.look.name));
    let added = 0;
    for (let i = 0; i < window.DEMO_FRIENDS.length && added < count; i++) {
      const look = window.DEMO_FRIENDS[(demoIndex + i) % window.DEMO_FRIENDS.length];
      if (taken.has(look.name)) continue;
      hub.addRecord({ id: "demo-" + look.name + "-" + Date.now(), demo: true, look, overrides: {} });
      added++;
    }
    demoIndex += count;
    if (!added) errorMsg.textContent = "All the demo friends are already here!";
  }
  $("demoBtn").addEventListener("click", () => { errorMsg.textContent = ""; addDemoFriends(3); });

  $("chatty").addEventListener("input", (e) => { hub.chattiness = parseFloat(e.target.value); });

  $("clearBtn").addEventListener("click", () => {
    if (hub.walkers.length && confirm("Send all Miis home? (This removes them from the hub.)")) hub.clearAll();
  });

  // ---------- roster ----------
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

      const portrait = document.createElement("canvas");
      portrait.width = 88;
      portrait.height = 88;
      window.MiiRenderer.drawPortrait(portrait, w.look);

      const info = document.createElement("div");
      info.className = "info";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = w.look.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = w.record.demo ? "Demo friend" : (w.look.format || "Mii");
      if (w.look.approximate && !w.record.demo) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "look guessed";
        badge.title = "This file's layout isn't publicly documented, so the name was read but the look was guessed. Use ✏️ to adjust it.";
        meta.appendChild(badge);
      }
      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      const edit = document.createElement("button");
      edit.textContent = "✏️";
      edit.title = "Change how " + w.look.name + " looks";
      edit.addEventListener("click", () => {
        editingId = editingId === w.id ? null : w.id;
        renderRoster();
      });
      const remove = document.createElement("button");
      remove.textContent = "🗑️";
      remove.title = "Send " + w.look.name + " home";
      remove.addEventListener("click", () => hub.removeWalker(w.id));
      actions.append(edit, remove);

      row.append(portrait, info, actions);
      li.appendChild(row);
      if (editingId === w.id) li.appendChild(buildEditor(w));
      list.appendChild(li);
    }
  }

  // A small editor so you can fix colours/hair if the look was guessed.
  function buildEditor(w) {
    const box = document.createElement("div");
    box.className = "editor";

    function swatchRow(label, colors, key) {
      const l = document.createElement("label");
      l.textContent = label;
      const row = document.createElement("div");
      row.className = "swatches";
      for (const c of colors) {
        const s = document.createElement("button");
        s.type = "button";
        s.className = "swatch" + (w.look[key] === c ? " selected" : "");
        s.style.background = c;
        s.title = c;
        s.addEventListener("click", (e) => {
          e.preventDefault();
          const change = { [key]: c };
          if (key === "hairColor") { change.browColor = c; change.facialHairColor = c; }
          hub.updateOverrides(w.id, change);
        });
        row.appendChild(s);
      }
      l.appendChild(row);
      return l;
    }

    function selectRow(label, options, key, toValue) {
      const l = document.createElement("label");
      l.textContent = label;
      const sel = document.createElement("select");
      options.forEach((text, i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = text;
        sel.appendChild(o);
      });
      sel.value = String(typeof w.look[key] === "boolean" ? Number(w.look[key]) : w.look[key]);
      sel.addEventListener("change", () => hub.updateOverrides(w.id, { [key]: toValue(parseInt(sel.value, 10)) }));
      l.appendChild(sel);
      return l;
    }

    box.append(
      swatchRow("Skin", P.SKIN_COLORS, "skin"),
      swatchRow("Hair", P.HAIR_COLORS, "hairColor"),
      swatchRow("Shirt", P.FAVORITE_COLORS.map((c) => c.hex), "shirt"),
      swatchRow("Eyes", P.EYE_COLORS, "eyeColor"),
      selectRow("Hairstyle", ["Short", "Spiky", "Long", "Bob", "Bald", "Swoop", "Ponytail", "Curly", "Buzz", "Bun"], "hairStyle", (v) => v),
      selectRow("Eye shape", ["Classic", "Dots", "Relaxed", "Sparkly"], "eyeStyle", (v) => v),
      selectRow("Glasses", ["None", "Glasses", "Sunglasses"], "glasses", (v) => v),
      selectRow("Beard", ["No", "Yes"], "beard", (v) => v === 1),
      selectRow("Mustache", ["No", "Yes"], "mustache", (v) => v === 1),
    );
    return box;
  }

  // ---------- friendships & feed ----------
  function renderFriends() {
    const list = $("friends");
    list.innerHTML = "";
    const byId = new Map(hub.walkers.map((w) => [w.id, w]));
    const pairs = Object.entries(hub.friendships)
      .map(([key, pts]) => {
        const [a, b] = key.split("|");
        return { a: byId.get(a), b: byId.get(b), pts };
      })
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

  // Re-draw the side panels whenever something changes (but not more than ~4 times a second).
  let pending = false;
  hub.onChange = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      renderRoster();
      renderFriends();
      renderFeed();
      updateTabs();
    }, 250);
  };

  // ---------- start ----------
  if (!hub.restore()) {
    // First visit: add the sample Mii(s) plus a few demo friends.
    for (const s of window.SAMPLE_FILES) {
      try { hub.addFromBytes(window.MiiHub.base64ToBytes(s.bytes), s.fileName); } catch (e) { console.warn(e); }
    }
    addDemoFriends(4);
  }
  hub.onChange();
  updateTabs();
  hub.start();

  // Handy for debugging in the browser console.
  window.hub = hub;
})();
