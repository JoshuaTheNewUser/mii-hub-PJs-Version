/*
 * scenes.js
 * The places Miis can hang out: a park, an office and outer space.
 *
 * Each scene has:
 *  - drawStatic(ctx, W, H)      background that never moves (drawn once and cached)
 *  - drawAnimated(ctx, W, H, t) moving background bits (clouds, stars...)
 *  - props   things Miis walk around (x/y are fractions of the screen)
 *  - spots   places Miis can go to do an activity
 *  - lines   things Miis might say while they are here
 */
(function (root) {
  "use strict";

  const { ellipse, roundRect, shade } = root.MiiRenderer;
  const TAU = Math.PI * 2;

  function rand(seed) {
    // tiny deterministic random so the background looks the same every time
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  function sky(ctx, W, H, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    stops.forEach(([p, c]) => g.addColorStop(p, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // =====================================================================
  // PARK
  // =====================================================================
  const park = {
    id: "park",
    name: "Park",
    icon: "🌳",
    floorTop: 0.42,
    helmet: false,
    floaty: false,
    drawStatic(ctx, W, H) {
      sky(ctx, W, H, [[0, "#7ec8ff"], [0.42, "#d6f0ff"]]);
      // sun
      ellipse(ctx, W * 0.86, H * 0.11, H * 0.06, H * 0.06, "#ffe066");
      ctx.globalAlpha = 0.25;
      ellipse(ctx, W * 0.86, H * 0.11, H * 0.1, H * 0.1, "#fff3b0");
      ctx.globalAlpha = 1;
      // far hills
      ctx.fillStyle = "#9ed98a";
      ctx.beginPath();
      ctx.moveTo(0, H * 0.42);
      for (let x = 0; x <= W; x += W / 40) {
        ctx.lineTo(x, H * 0.36 - Math.sin(x / W * 5.5) * H * 0.04 - Math.sin(x / W * 13) * H * 0.012);
      }
      ctx.lineTo(W, H * 0.42);
      ctx.fill();
      // grass
      const g = ctx.createLinearGradient(0, H * 0.4, 0, H);
      g.addColorStop(0, "#7fcf5d");
      g.addColorStop(1, "#58b23f");
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.4, W, H * 0.6);
      // winding path
      ctx.fillStyle = "#e8d4a6";
      ctx.beginPath();
      ctx.moveTo(W * 0.42, H * 0.4);
      ctx.bezierCurveTo(W * 0.3, H * 0.6, W * 0.7, H * 0.7, W * 0.45, H);
      ctx.lineTo(W * 0.65, H);
      ctx.bezierCurveTo(W * 0.9, H * 0.7, W * 0.42, H * 0.6, W * 0.5, H * 0.4);
      ctx.fill();
      // pond
      ellipse(ctx, W * 0.17, H * 0.78, W * 0.13, H * 0.075, "#5a9e3c");
      ellipse(ctx, W * 0.17, H * 0.775, W * 0.12, H * 0.065, "#4aa8e0");
      ctx.globalAlpha = 0.35;
      ellipse(ctx, W * 0.14, H * 0.76, W * 0.05, H * 0.012, "#ffffff");
      ctx.globalAlpha = 1;
      // grass tufts and flowers
      const r = rand(7);
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = H * 0.44 + r() * H * 0.56;
        const k = 0.5 + (y / H);
        if (r() < 0.3) {
          ellipse(ctx, x, y, 2.4 * k, 2.4 * k, ["#ff8fb1", "#fff176", "#ffffff", "#c39bff"][Math.floor(r() * 4)]);
          ellipse(ctx, x, y, 1 * k, 1 * k, "#ffb300");
        } else {
          ctx.strokeStyle = "#4c9a33";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x - 3 * k, y); ctx.lineTo(x - 1 * k, y - 6 * k);
          ctx.moveTo(x, y); ctx.lineTo(x + 1 * k, y - 8 * k);
          ctx.moveTo(x + 3 * k, y); ctx.lineTo(x + 4 * k, y - 5 * k);
          ctx.stroke();
        }
      }
    },
    drawAnimated(ctx, W, H, t) {
      // drifting clouds
      for (let i = 0; i < 4; i++) {
        const x = ((t * (8 + i * 3) + i * W * 0.31) % (W + 240)) - 120;
        const y = H * (0.07 + i * 0.06);
        ctx.globalAlpha = 0.9;
        ellipse(ctx, x, y, 46, 16, "#ffffff");
        ellipse(ctx, x + 26, y - 9, 30, 16, "#ffffff");
        ellipse(ctx, x - 24, y - 4, 24, 12, "#ffffff");
        ctx.globalAlpha = 1;
      }
      // ducks on the pond
      for (let i = 0; i < 2; i++) {
        const dx = W * 0.17 + Math.sin(t * 0.3 + i * 2.4) * W * 0.07;
        const dy = H * 0.775 + Math.cos(t * 0.3 + i * 2.4) * H * 0.025;
        const face = Math.cos(t * 0.3 + i * 2.4) > 0 ? -1 : 1;
        ellipse(ctx, dx, dy, 10, 6, "#ffffff");
        ellipse(ctx, dx + face * 8, dy - 6, 5, 5, "#ffffff");
        ellipse(ctx, dx + face * 13, dy - 5, 3, 1.6, "#ff9800");
        ellipse(ctx, dx + face * 9, dy - 7, 1, 1, "#000000");
      }
      // birds
      ctx.strokeStyle = "#33415c";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const bx = ((t * 30 + i * 70) % (W + 200)) - 100;
        const by = H * 0.18 + Math.sin(t + i) * 10 + i * 12;
        const flap = Math.sin(t * 8 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(bx - 7, by - flap); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by);
        ctx.quadraticCurveTo(bx + 3, by - 3, bx + 7, by - flap);
        ctx.stroke();
      }
    },
    props: [
      { x: 0.08, y: 0.5, r: 26, draw: tree },
      { x: 0.9, y: 0.55, r: 26, draw: tree },
      { x: 0.7, y: 0.47, r: 22, draw: tree },
      { x: 0.25, y: 0.46, r: 22, draw: tree },
      { x: 0.82, y: 0.86, r: 30, draw: tree },
      { x: 0.6, y: 0.6, r: 36, draw: fountain },
      { x: 0.35, y: 0.62, r: 30, draw: bench },
      { x: 0.17, y: 0.78, r: 120, ry: 0.4, draw: null }, // the pond (invisible blocker)
    ],
    spots: [
      { x: 0.35, y: 0.645, activity: "sitting on the bench", emoji: "🪑", sit: true,
        lines: ["Ahh, nice to sit down.", "What a lovely bench.", "I could stay here all day."] },
      { x: 0.24, y: 0.72, activity: "watching the ducks", emoji: "🦆",
        lines: ["Quack quack!", "Look at the ducks!", "I wish I could swim like that."] },
      { x: 0.6, y: 0.66, activity: "looking at the fountain", emoji: "⛲",
        lines: ["*makes a wish*", "So sparkly!", "I threw a coin in!"] },
      { x: 0.86, y: 0.6, activity: "resting under a tree", emoji: "🍃",
        lines: ["Nice and shady here.", "*yawn*", "I love the sound of the leaves."] },
    ],
    lines: [
      "What a beautiful day!", "I love the park!", "Smell those flowers!",
      "Anyone want to have a picnic?", "The sun feels nice.", "Is that a butterfly?",
      "I should go jogging more.", "Let's play tag!", "La la la~", "Wheee!",
    ],
  };

  function tree(ctx, x, y, k) {
    ctx.globalAlpha = 0.2;
    ellipse(ctx, x, y, 30 * k, 8 * k, "#000000");
    ctx.globalAlpha = 1;
    roundRect(ctx, x - 7 * k, y - 60 * k, 14 * k, 60 * k, 4 * k);
    ctx.fillStyle = "#8b5a2b";
    ctx.fill();
    ellipse(ctx, x, y - 85 * k, 40 * k, 34 * k, "#3e9b3a");
    ellipse(ctx, x - 22 * k, y - 70 * k, 26 * k, 22 * k, "#45a540");
    ellipse(ctx, x + 22 * k, y - 72 * k, 26 * k, 22 * k, "#3a9236");
    ellipse(ctx, x - 8 * k, y - 100 * k, 22 * k, 16 * k, "#5cbf55");
  }

  function fountain(ctx, x, y, k, t) {
    ellipse(ctx, x, y, 46 * k, 15 * k, "#b9c3cf");
    ellipse(ctx, x, y - 3 * k, 40 * k, 11 * k, "#5ab8f0");
    roundRect(ctx, x - 5 * k, y - 40 * k, 10 * k, 38 * k, 3 * k);
    ctx.fillStyle = "#c9d2dc";
    ctx.fill();
    ellipse(ctx, x, y - 40 * k, 16 * k, 5 * k, "#c9d2dc");
    // water drops
    ctx.fillStyle = "#9fdcff";
    for (let i = 0; i < 8; i++) {
      const p = ((t * 0.8 + i / 8) % 1);
      const a = (i / 8) * TAU;
      const dx = Math.cos(a) * 26 * k * p;
      const dy = -40 * k - Math.sin(p * Math.PI) * 18 * k + p * 36 * k;
      ellipse(ctx, x + dx, y + dy, 2 * k, 2.6 * k, "#9fdcff");
    }
  }

  function bench(ctx, x, y, k) {
    ctx.fillStyle = "#6d4c2f";
    ctx.fillRect(x - 34 * k, y - 16 * k, 4 * k, 16 * k);
    ctx.fillRect(x + 30 * k, y - 16 * k, 4 * k, 16 * k);
    roundRect(ctx, x - 40 * k, y - 20 * k, 80 * k, 6 * k, 2 * k);
    ctx.fillStyle = "#a8743f"; ctx.fill();
    roundRect(ctx, x - 40 * k, y - 38 * k, 80 * k, 6 * k, 2 * k); ctx.fill();
    roundRect(ctx, x - 40 * k, y - 30 * k, 80 * k, 6 * k, 2 * k); ctx.fill();
  }

  // =====================================================================
  // OFFICE
  // =====================================================================
  const office = {
    id: "office",
    name: "Office",
    icon: "🏢",
    floorTop: 0.44,
    helmet: false,
    floaty: false,
    drawStatic(ctx, W, H) {
      // wall
      ctx.fillStyle = "#e9e4d8";
      ctx.fillRect(0, 0, W, H * 0.44);
      ctx.fillStyle = "#d8d1c0";
      ctx.fillRect(0, H * 0.4, W, H * 0.04);
      // windows with city view
      for (let i = 0; i < 3; i++) {
        const wx = W * (0.12 + i * 0.28), wy = H * 0.06, ww = W * 0.2, wh = H * 0.26;
        const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
        g.addColorStop(0, "#8ec9ff");
        g.addColorStop(1, "#d9eeff");
        ctx.fillStyle = g;
        ctx.fillRect(wx, wy, ww, wh);
        const r = rand(11 + i);
        for (let b = 0; b < 6; b++) {
          const bw = ww / 6;
          const bh = wh * (0.25 + r() * 0.55);
          ctx.fillStyle = ["#7d8ca8", "#93a1bb", "#6b7a96"][b % 3];
          ctx.fillRect(wx + b * bw, wy + wh - bh, bw - 2, bh);
          ctx.fillStyle = "#fff6c2";
          for (let wy2 = wy + wh - bh + 6; wy2 < wy + wh - 4; wy2 += 9) {
            for (let wx2 = wx + b * bw + 3; wx2 < wx + (b + 1) * bw - 5; wx2 += 7) {
              if (r() > 0.45) ctx.fillRect(wx2, wy2, 3, 4);
            }
          }
        }
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 6;
        ctx.strokeRect(wx, wy, ww, wh);
        ctx.beginPath();
        ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
        ctx.stroke();
      }
      // floor (carpet tiles)
      ctx.fillStyle = "#8aa0b8";
      ctx.fillRect(0, H * 0.44, W, H * 0.56);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let y = H * 0.44; y < H; y += 26 + (y - H * 0.44) * 0.08) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let i = -10; i <= 20; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 40, H * 0.44);
        ctx.lineTo(W / 2 + i * 110, H);
        ctx.stroke();
      }
      // motivational poster
      roundRect(ctx, W * 0.02, H * 0.12, W * 0.07, H * 0.16, 4);
      ctx.fillStyle = "#ffcf5a"; ctx.fill();
      ctx.fillStyle = "#5a3e00";
      ctx.font = "bold " + Math.max(9, H * 0.018) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TEAM", W * 0.055, H * 0.19);
      ctx.fillText("WORK!", W * 0.055, H * 0.22);
    },
    drawAnimated(ctx, W, H) {
      // wall clock showing the real time
      const cx = W * 0.95, cy = H * 0.13, r = Math.min(W, H) * 0.04;
      ellipse(ctx, cx, cy, r, r, "#ffffff", "#444", 3);
      const now = new Date();
      const hr = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU;
      const mn = now.getMinutes() / 60 * TAU;
      ctx.strokeStyle = "#333";
      ctx.lineCap = "round";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hr) * r * 0.5, cy - Math.cos(hr) * r * 0.5); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(mn) * r * 0.8, cy - Math.cos(mn) * r * 0.8); ctx.stroke();
    },
    props: [
      { x: 0.2, y: 0.58, r: 60, draw: desk },
      { x: 0.5, y: 0.58, r: 60, draw: desk },
      { x: 0.8, y: 0.58, r: 60, draw: desk },
      { x: 0.3, y: 0.86, r: 60, draw: desk },
      { x: 0.7, y: 0.86, r: 60, draw: desk },
      { x: 0.04, y: 0.7, r: 18, draw: plant },
      { x: 0.96, y: 0.82, r: 18, draw: plant },
      { x: 0.93, y: 0.5, r: 20, draw: waterCooler },
      { x: 0.06, y: 0.48, r: 26, draw: printer },
    ],
    spots: [
      { x: 0.2, y: 0.63, activity: "typing at a desk", emoji: "⌨️", faceUp: true,
        lines: ["*click clack*", "So many emails...", "Almost done with this report!"] },
      { x: 0.5, y: 0.63, activity: "on a video call", emoji: "💻", faceUp: true,
        lines: ["Can you hear me now?", "You're on mute!", "Let's circle back on that."] },
      { x: 0.8, y: 0.63, activity: "typing at a desk", emoji: "📊", faceUp: true,
        lines: ["Numbers are going up!", "Spreadsheet time!", "Who made this chart?"] },
      { x: 0.89, y: 0.53, activity: "getting water", emoji: "💧",
        lines: ["*glug glug*", "Staying hydrated!", "Any gossip today?"] },
      { x: 0.1, y: 0.52, activity: "using the printer", emoji: "🖨️",
        lines: ["Paper jam AGAIN?!", "Come on, print!", "Who used all the ink?"] },
    ],
    lines: [
      "Is it lunch time yet?", "I need more coffee.", "Meeting in 5 minutes!",
      "Did anyone see my stapler?", "I love Fridays.", "Working hard or hardly working?",
      "Great job, team!", "Who wants pizza?", "Let's brainstorm!", "My chair squeaks.",
    ],
  };

  function desk(ctx, x, y, k, t) {
    k *= 1.35;
    // desk legs
    ctx.fillStyle = "#6b5640";
    ctx.fillRect(x - 46 * k, y - 26 * k, 5 * k, 26 * k);
    ctx.fillRect(x + 41 * k, y - 26 * k, 5 * k, 26 * k);
    // top
    roundRect(ctx, x - 52 * k, y - 32 * k, 104 * k, 9 * k, 3 * k);
    ctx.fillStyle = "#c79a6a"; ctx.fill();
    // computer
    roundRect(ctx, x - 20 * k, y - 62 * k, 40 * k, 27 * k, 3 * k);
    ctx.fillStyle = "#2b2f3a"; ctx.fill();
    const glow = 0.75 + Math.sin(t * 2 + x) * 0.1;
    ctx.globalAlpha = glow;
    ctx.fillStyle = "#7fd3ff";
    ctx.fillRect(x - 17 * k, y - 59 * k, 34 * k, 20 * k);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2b2f3a";
    ctx.fillRect(x - 3 * k, y - 36 * k, 6 * k, 4 * k);
    // mug
    roundRect(ctx, x + 30 * k, y - 42 * k, 9 * k, 10 * k, 2 * k);
    ctx.fillStyle = "#ff7b54"; ctx.fill();
  }

  function plant(ctx, x, y, k) {
    k *= 1.4;
    roundRect(ctx, x - 12 * k, y - 22 * k, 24 * k, 22 * k, 4 * k);
    ctx.fillStyle = "#c9673a"; ctx.fill();
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(x + i * 6 * k, y - 38 * k, 6 * k, 18 * k, i * 0.35, 0, TAU);
      ctx.fillStyle = i % 2 ? "#3f9c45" : "#53b85a";
      ctx.fill();
    }
  }

  function waterCooler(ctx, x, y, k) {
    k *= 1.4;
    roundRect(ctx, x - 13 * k, y - 50 * k, 26 * k, 50 * k, 4 * k);
    ctx.fillStyle = "#eef1f5"; ctx.fill();
    ctx.strokeStyle = "#b8c0cc"; ctx.lineWidth = 1.5; ctx.stroke();
    roundRect(ctx, x - 11 * k, y - 80 * k, 22 * k, 32 * k, 9 * k);
    ctx.fillStyle = "rgba(110,190,255,0.75)"; ctx.fill();
    ctx.fillStyle = "#3d7bd9";
    ctx.fillRect(x - 3 * k, y - 38 * k, 6 * k, 5 * k);
  }

  function printer(ctx, x, y, k) {
    k *= 1.4;
    roundRect(ctx, x - 24 * k, y - 34 * k, 48 * k, 34 * k, 4 * k);
    ctx.fillStyle = "#d9dde3"; ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 14 * k, y - 42 * k, 28 * k, 9 * k);
    ctx.fillStyle = "#7d8592";
    ctx.fillRect(x - 18 * k, y - 22 * k, 36 * k, 4 * k);
    ellipse(ctx, x + 16 * k, y - 28 * k, 2.4 * k, 2.4 * k, "#4caf50");
  }

  // =====================================================================
  // OUTER SPACE
  // =====================================================================
  const space = {
    id: "space",
    name: "Outer Space",
    icon: "🚀",
    floorTop: 0.5,
    helmet: true,
    floaty: true,
    drawStatic(ctx, W, H) {
      sky(ctx, W, H, [[0, "#05051a"], [0.5, "#1a1240"], [1, "#2a1f4a"]]);
      // nebula glow
      const n = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.4);
      n.addColorStop(0, "rgba(180,80,255,0.25)");
      n.addColorStop(1, "rgba(180,80,255,0)");
      ctx.fillStyle = n;
      ctx.fillRect(0, 0, W, H);
      // Earth
      const ex = W * 0.8, ey = H * 0.2, er = Math.min(W, H) * 0.12;
      const eg = ctx.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
      eg.addColorStop(0, "#6fc3ff");
      eg.addColorStop(1, "#1d5fbf");
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      ctx.fillStyle = "#4cb050";
      ellipse(ctx, ex - er * 0.3, ey - er * 0.15, er * 0.32, er * 0.22, "#4cb050");
      ellipse(ctx, ex + er * 0.35, ey + er * 0.25, er * 0.25, er * 0.3, "#4cb050");
      ellipse(ctx, ex + er * 0.1, ey - er * 0.6, er * 0.2, er * 0.1, "#ffffff");
      ctx.globalAlpha = 0.25;
      ellipse(ctx, ex, ey, er * 1.12, er * 1.12, null, "#9fd8ff", 6);
      ctx.globalAlpha = 1;
      // ringed planet
      const px = W * 0.14, py = H * 0.16, pr = Math.min(W, H) * 0.05;
      ellipse(ctx, px, py, pr, pr, "#ffb46b");
      ctx.save();
      ctx.translate(px, py); ctx.rotate(-0.35);
      ellipse(ctx, 0, 0, pr * 1.9, pr * 0.45, null, "#ffe0b0", 3);
      ctx.restore();
      // moon surface
      ctx.fillStyle = "#b9b4c9";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H * 0.52);
      for (let x = 0; x <= W; x += W / 30) {
        ctx.lineTo(x, H * 0.5 - Math.sin(x / W * 7) * H * 0.015);
      }
      ctx.lineTo(W, H);
      ctx.fill();
      const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
      g.addColorStop(0, "rgba(255,255,255,0.1)");
      g.addColorStop(1, "rgba(60,50,90,0.35)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.48, W, H * 0.52);
      // craters
      const r = rand(3);
      for (let i = 0; i < 14; i++) {
        const cx = r() * W, cy = H * 0.55 + r() * H * 0.43;
        const cr = (8 + r() * 26) * (0.5 + cy / H);
        ellipse(ctx, cx, cy, cr, cr * 0.32, "#9d97b0");
        ellipse(ctx, cx, cy + cr * 0.05, cr * 0.85, cr * 0.24, "#a8a2bb");
      }
    },
    drawAnimated(ctx, W, H, t) {
      // twinkling stars
      const r = rand(42);
      for (let i = 0; i < 120; i++) {
        const x = r() * W, y = r() * H * 0.5;
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 3) + i);
        ctx.globalAlpha = 0.3 + tw * 0.7;
        const s = r() < 0.1 ? 2.2 : 1.2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
      // shooting star every few seconds
      const cycle = t % 7;
      if (cycle < 0.8) {
        const p = cycle / 0.8;
        const sx = W * (0.2 + p * 0.5), sy = H * (0.05 + p * 0.2);
        const g = ctx.createLinearGradient(sx - 80, sy - 32, sx, sy);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(255,255,255,0.9)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx - 80, sy - 32); ctx.lineTo(sx, sy); ctx.stroke();
      }
      // satellite
      const sx = ((t * 18) % (W + 100)) - 50, sy = H * 0.34 + Math.sin(t * 0.5) * 8;
      ctx.fillStyle = "#cfd6e6";
      ctx.fillRect(sx - 5, sy - 4, 10, 8);
      ctx.fillStyle = "#3b6fd8";
      ctx.fillRect(sx - 20, sy - 3, 13, 6);
      ctx.fillRect(sx + 7, sy - 3, 13, 6);
    },
    props: [
      { x: 0.12, y: 0.62, r: 34, draw: rocket },
      { x: 0.55, y: 0.56, r: 12, draw: flag },
      { x: 0.86, y: 0.76, r: 30, draw: rover },
      { x: 0.35, y: 0.9, r: 26, draw: moonRock },
    ],
    spots: [
      { x: 0.19, y: 0.65, activity: "checking the rocket", emoji: "🚀",
        lines: ["3... 2... 1... just kidding!", "Fuel looks good!", "Who wants a ride?"] },
      { x: 0.58, y: 0.6, activity: "saluting the flag", emoji: "🚩",
        lines: ["One small step for a Mii!", "We made it!", "I claim this rock!"] },
      { x: 0.8, y: 0.8, activity: "fixing the rover", emoji: "🔧",
        lines: ["Beep boop?", "Needs a new wheel.", "Vroom vroom... slowly."] },
      { x: 0.5, y: 0.75, activity: "gazing at Earth", emoji: "🌍",
        lines: ["I can see my house from here!", "Earth looks so tiny!", "Hi Mom!"] },
    ],
    lines: [
      "I'm floating!", "Look, no gravity!", "Space is so quiet...", "Houston, we have a Mii!",
      "Where's the space ice cream?", "Moon jump!", "The stars are amazing!", "Is that an alien?!",
      "Boing... boing...", "My helmet is foggy.",
    ],
  };

  function rocket(ctx, x, y, k, t) {
    // legs
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.moveTo(x - 18 * k, y - 30 * k); ctx.lineTo(x - 30 * k, y); ctx.lineTo(x - 14 * k, y - 8 * k); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 18 * k, y - 30 * k); ctx.lineTo(x + 30 * k, y); ctx.lineTo(x + 14 * k, y - 8 * k); ctx.fill();
    // body
    ctx.beginPath();
    ctx.moveTo(x, y - 120 * k);
    ctx.quadraticCurveTo(x + 24 * k, y - 90 * k, x + 20 * k, y - 10 * k);
    ctx.lineTo(x - 20 * k, y - 10 * k);
    ctx.quadraticCurveTo(x - 24 * k, y - 90 * k, x, y - 120 * k);
    ctx.fillStyle = "#f2f2f7"; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 120 * k);
    ctx.quadraticCurveTo(x + 14 * k, y - 105 * k, x + 17 * k, y - 95 * k);
    ctx.lineTo(x - 17 * k, y - 95 * k);
    ctx.quadraticCurveTo(x - 14 * k, y - 105 * k, x, y - 120 * k);
    ctx.fillStyle = "#e74c3c"; ctx.fill();
    ellipse(ctx, x, y - 70 * k, 9 * k, 9 * k, "#6fc3ff", "#7f8c8d", 3 * k);
    // little puffs of smoke
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.6 + i / 3) % 1;
      ellipse(ctx, x + (i - 1) * 10 * k, y - 4 * k - p * 10 * k, (4 + p * 8) * k, (3 + p * 5) * k, "#d8d4e6");
    }
    ctx.globalAlpha = 1;
  }

  function flag(ctx, x, y, k, t) {
    ctx.fillStyle = "#d0d0d8";
    ctx.fillRect(x - 1.5 * k, y - 70 * k, 3 * k, 70 * k);
    ctx.beginPath();
    ctx.moveTo(x, y - 70 * k);
    for (let i = 0; i <= 10; i++) {
      ctx.lineTo(x + i * 4 * k, y - 70 * k + Math.sin(t * 2 + i * 0.6) * 1.5 * k);
    }
    for (let i = 10; i >= 0; i--) {
      ctx.lineTo(x + i * 4 * k, y - 46 * k + Math.sin(t * 2 + i * 0.6) * 1.5 * k);
    }
    ctx.fillStyle = "#ff5a7a"; ctx.fill();
    ellipse(ctx, x + 20 * k, y - 58 * k, 6 * k, 6 * k, "#ffffff");
  }

  function rover(ctx, x, y, k, t) {
    roundRect(ctx, x - 30 * k, y - 32 * k, 60 * k, 18 * k, 5 * k);
    ctx.fillStyle = "#e0b93c"; ctx.fill();
    for (const wx of [-20, 0, 20]) {
      ellipse(ctx, x + wx * k, y - 8 * k, 8 * k, 8 * k, "#444");
      ellipse(ctx, x + wx * k, y - 8 * k, 3 * k, 3 * k, "#999");
    }
    ctx.fillStyle = "#888";
    ctx.fillRect(x + 14 * k, y - 50 * k, 3 * k, 18 * k);
    ctx.save();
    ctx.translate(x + 15 * k, y - 52 * k);
    ctx.rotate(Math.sin(t) * 0.6);
    ellipse(ctx, 0, 0, 10 * k, 4 * k, "#cfd6e6");
    ctx.restore();
  }

  function moonRock(ctx, x, y, k) {
    ctx.beginPath();
    ctx.moveTo(x - 26 * k, y);
    ctx.lineTo(x - 20 * k, y - 18 * k);
    ctx.lineTo(x - 4 * k, y - 26 * k);
    ctx.lineTo(x + 16 * k, y - 20 * k);
    ctx.lineTo(x + 26 * k, y);
    ctx.closePath();
    ctx.fillStyle = "#8f88a6"; ctx.fill();
    ctx.fillStyle = "#a79fbf";
    ctx.beginPath();
    ctx.moveTo(x - 20 * k, y - 18 * k); ctx.lineTo(x - 4 * k, y - 26 * k); ctx.lineTo(x - 2 * k, y - 10 * k); ctx.fill();
  }

  root.Scenes = { park, office, space, list: [park, office, space] };
})(typeof self !== "undefined" ? self : this);
