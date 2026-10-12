/*
 * miiRenderer.js
 * Draws a cute 2D Mii on a canvas using the "look" object from miiParser.js.
 * Everything is drawn with simple shapes, so no images are needed.
 */
(function (root) {
  "use strict";

  const TAU = Math.PI * 2;

  function ellipse(ctx, x, y, rx, ry, fill, stroke, lineWidth) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, amount) {
    // amount < 0 darkens, > 0 lightens
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // ---------- Hair ----------
  // Hair that sits behind the head (drawn first).
  function drawHairBack(ctx, look, R, side) {
    const c = look.hairColor;
    switch (look.hairStyle) {
      case 2: // long
        roundRect(ctx, -R * 1.02, -R * 0.4, R * 2.04, R * 1.75, R * 0.5);
        ctx.fillStyle = c; ctx.fill();
        break;
      case 3: // bob
        roundRect(ctx, -R * 1.05, -R * 0.5, R * 2.1, R * 1.3, R * 0.55);
        ctx.fillStyle = c; ctx.fill();
        break;
      case 6: // ponytail
        ellipse(ctx, -side * R * 0.95, -R * 0.15, R * 0.38, R * 0.6, c);
        break;
      case 7: // afro
        ellipse(ctx, 0, -R * 0.35, R * 1.38, R * 1.2, c);
        break;
      case 9: // bun
        ellipse(ctx, 0, -R * 1.12, R * 0.42, R * 0.36, c);
        break;
    }
  }

  // Hair that sits on top of the head (drawn after the face).
  function drawHairFront(ctx, look, R, side) {
    const c = look.hairColor;
    const flip = look.hairFlip ? -1 : 1;
    ctx.fillStyle = c;
    switch (look.hairStyle) {
      case 4: // bald with a little hair on the sides
        ellipse(ctx, -R * 0.93, -R * 0.05, R * 0.14, R * 0.32, c);
        ellipse(ctx, R * 0.93, -R * 0.05, R * 0.14, R * 0.32, c);
        return;
      case 8: // buzz cut
        ctx.globalAlpha = 0.75;
        capShape(ctx, R, 0.55);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      default:
        capShape(ctx, R, look.hairStyle === 7 ? 0.25 : 0.42);
        ctx.fill();
    }
    if (look.hairStyle === 1) {
      // spiky
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const x = i * R * 0.38;
        ctx.moveTo(x - R * 0.22, -R * 0.75);
        ctx.lineTo(x + R * 0.05 * side, -R * 1.35 + Math.abs(i) * R * 0.1);
        ctx.lineTo(x + R * 0.22, -R * 0.75);
      }
      ctx.fill();
    } else if (look.hairStyle === 5) {
      // side-swept fringe
      ctx.beginPath();
      ctx.moveTo(-R * 0.95 * flip, -R * 0.45);
      ctx.quadraticCurveTo(-R * 0.1 * flip, -R * 0.05, R * 0.55 * flip, -R * 0.42);
      ctx.quadraticCurveTo(R * 0.2 * flip, -R * 0.9, -R * 0.95 * flip, -R * 0.45);
      ctx.fill();
    } else if (look.hairStyle === 0) {
      // short with sideburns
      ellipse(ctx, -R * 0.9, -R * 0.1, R * 0.13, R * 0.3, c);
      ellipse(ctx, R * 0.9, -R * 0.1, R * 0.13, R * 0.3, c);
    } else if (look.hairStyle === 2 || look.hairStyle === 3) {
      // long / bob: side curtains framing the face
      roundRect(ctx, -R * 1.04, -R * 0.55, R * 0.3, look.hairStyle === 2 ? R * 1.6 : R * 1.05, R * 0.15);
      ctx.fill();
      roundRect(ctx, R * 0.74, -R * 0.55, R * 0.3, look.hairStyle === 2 ? R * 1.6 : R * 1.05, R * 0.15);
      ctx.fill();
    } else if (look.hairStyle === 7) {
      // curly top
      for (let i = -3; i <= 3; i++) ellipse(ctx, i * R * 0.3, -R * 0.82 + Math.abs(i) * R * 0.06, R * 0.3, R * 0.25, c);
    }
    // a soft shine on the hair
    ctx.globalAlpha = 0.18;
    ellipse(ctx, -R * 0.35, -R * 0.78, R * 0.3, R * 0.1, "#ffffff");
    ctx.globalAlpha = 1;
  }

  // A rounded cap over the top of the head. `fringe` is how far down the forehead it reaches.
  function capShape(ctx, R, fringe) {
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.1, R * 1.03, R * 0.98, 0, Math.PI, TAU);
    ctx.lineTo(R * 1.03, -R * 0.1);
    ctx.quadraticCurveTo(R * 0.6, -R * fringe, 0, -R * (fringe + 0.06));
    ctx.quadraticCurveTo(-R * 0.6, -R * fringe, -R * 1.03, -R * 0.1);
    ctx.closePath();
  }

  // ---------- Face ----------
  function drawEyes(ctx, look, R, lookX, o) {
    const ey = -R * 0.02;
    const gap = R * 0.36;
    for (const s of [-1, 1]) {
      const ex = s * gap + lookX;
      if (o.blink || o.expression === "laugh" || o.sleep) {
        // closed eyes: happy arcs
        ctx.beginPath();
        ctx.strokeStyle = "#2a1e1a";
        ctx.lineWidth = R * 0.07;
        ctx.lineCap = "round";
        if (o.expression === "laugh") ctx.arc(ex, ey + R * 0.05, R * 0.11, Math.PI * 1.1, Math.PI * 1.9);
        else ctx.arc(ex, ey - R * 0.02, R * 0.11, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
        continue;
      }
      switch (look.eyeStyle) {
        case 1: // simple dot eyes
          ellipse(ctx, ex, ey, R * 0.08, R * 0.12, "#2a1e1a");
          ellipse(ctx, ex - R * 0.025, ey - R * 0.04, R * 0.025, R * 0.03, "#ffffff");
          break;
        case 2: // sleepy / relaxed eyes
          ellipse(ctx, ex, ey, R * 0.15, R * 0.15, "#ffffff");
          ellipse(ctx, ex + lookX * 0.15, ey + R * 0.03, R * 0.09, R * 0.1, look.eyeColor);
          ellipse(ctx, ex + lookX * 0.15, ey + R * 0.03, R * 0.045, R * 0.05, "#111111");
          ctx.beginPath();
          ctx.ellipse(ex, ey, R * 0.16, R * 0.16, 0, Math.PI, TAU);
          ctx.fillStyle = look.skin;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ex - R * 0.16, ey);
          ctx.lineTo(ex + R * 0.16, ey);
          ctx.strokeStyle = "#2a1e1a";
          ctx.lineWidth = R * 0.05;
          ctx.stroke();
          break;
        case 3: // big sparkly eyes
          ellipse(ctx, ex, ey, R * 0.17, R * 0.22, "#ffffff", "#2a1e1a", R * 0.035);
          ellipse(ctx, ex + lookX * 0.2, ey + R * 0.02, R * 0.12, R * 0.15, look.eyeColor);
          ellipse(ctx, ex + lookX * 0.2, ey + R * 0.03, R * 0.06, R * 0.07, "#111111");
          ellipse(ctx, ex + lookX * 0.2 - R * 0.05, ey - R * 0.05, R * 0.04, R * 0.04, "#ffffff");
          ellipse(ctx, ex + lookX * 0.2 + R * 0.04, ey + R * 0.07, R * 0.02, R * 0.02, "#ffffff");
          break;
        default: // classic almond eyes
          ellipse(ctx, ex, ey, R * 0.14, R * 0.18, "#ffffff", "#2a1e1a", R * 0.03);
          ellipse(ctx, ex + lookX * 0.2, ey + R * 0.02, R * 0.09, R * 0.12, look.eyeColor);
          ellipse(ctx, ex + lookX * 0.2, ey + R * 0.02, R * 0.045, R * 0.06, "#111111");
          ellipse(ctx, ex + lookX * 0.2 - R * 0.03, ey - R * 0.04, R * 0.03, R * 0.03, "#ffffff");
      }
    }
  }

  function drawBrows(ctx, look, R, lookX, o) {
    const by = -R * 0.3;
    const gap = R * 0.37;
    ctx.strokeStyle = look.browColor;
    ctx.lineCap = "round";
    ctx.lineWidth = R * (look.browStyle === 2 ? 0.1 : 0.07);
    for (const s of [-1, 1]) {
      const bx = s * gap + lookX;
      // worried / angry tilt depends on expression
      let tilt = look.browStyle === 1 ? 0.06 : 0;
      if (o.expression === "angry") tilt = -0.12;
      if (o.expression === "surprised") tilt = 0.1;
      const lift = o.expression === "surprised" ? -R * 0.08 : 0;
      ctx.beginPath();
      ctx.moveTo(bx - R * 0.15, by + lift + s * tilt * R * -1);
      ctx.quadraticCurveTo(bx, by + lift - R * 0.07, bx + R * 0.15, by + lift + s * tilt * R);
      ctx.stroke();
    }
  }

  function drawMouth(ctx, look, R, lookX, o, t) {
    const mx = lookX * 0.8;
    const my = R * 0.5;
    ctx.lineCap = "round";
    const lips = look.mouthColor;
    if (o.talking) {
      const open = 0.06 + Math.abs(Math.sin(t * 14)) * 0.12;
      ellipse(ctx, mx, my, R * 0.16, R * open, "#7a2a22", lips, R * 0.04);
      return;
    }
    switch (o.expression) {
      case "laugh":
        ctx.beginPath();
        ctx.moveTo(mx - R * 0.22, my - R * 0.05);
        ctx.quadraticCurveTo(mx, my + R * 0.35, mx + R * 0.22, my - R * 0.05);
        ctx.closePath();
        ctx.fillStyle = "#7a2a22";
        ctx.fill();
        ctx.strokeStyle = lips; ctx.lineWidth = R * 0.04; ctx.stroke();
        break;
      case "surprised":
        ellipse(ctx, mx, my + R * 0.02, R * 0.08, R * 0.11, "#7a2a22", lips, R * 0.04);
        break;
      case "sad":
      case "angry":
        ctx.beginPath();
        ctx.arc(mx, my + R * 0.16, R * 0.15, Math.PI * 1.2, Math.PI * 1.8);
        ctx.strokeStyle = lips; ctx.lineWidth = R * 0.06; ctx.stroke();
        break;
      default: // smile
        ctx.beginPath();
        ctx.arc(mx, my - R * 0.1, R * 0.17, Math.PI * 0.2, Math.PI * 0.8);
        ctx.strokeStyle = lips; ctx.lineWidth = R * 0.06; ctx.stroke();
    }
  }

  function drawGlasses(ctx, look, R, lookX) {
    if (!look.glasses) return;
    const ey = -R * 0.02;
    const gap = R * 0.36;
    ctx.strokeStyle = look.glassesColor;
    ctx.lineWidth = R * 0.05;
    for (const s of [-1, 1]) {
      roundRect(ctx, s * gap + lookX - R * 0.23, ey - R * 0.19, R * 0.46, R * 0.36, R * 0.12);
      if (look.glasses === 2) {
        ctx.fillStyle = "rgba(20,20,30,0.85)";
        ctx.fill();
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-gap + lookX + R * 0.23, ey - R * 0.05);
    ctx.lineTo(gap + lookX - R * 0.23, ey - R * 0.05);
    ctx.stroke();
  }

  function drawFacialHair(ctx, look, R, lookX) {
    const c = look.facialHairColor;
    if (look.beard) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.88, R * 0.05);
      ctx.quadraticCurveTo(-R * 0.75, R * 0.95, 0, R * 1.0);
      ctx.quadraticCurveTo(R * 0.75, R * 0.95, R * 0.88, R * 0.05);
      ctx.quadraticCurveTo(R * 0.5, R * 0.55, lookX, R * 0.62);
      ctx.quadraticCurveTo(-R * 0.5, R * 0.55, -R * 0.88, R * 0.05);
      ctx.fillStyle = c;
      ctx.fill();
    }
    if (look.mustache) {
      ctx.fillStyle = c;
      ellipse(ctx, lookX * 0.8 - R * 0.13, R * 0.33, R * 0.15, R * 0.07, c);
      ellipse(ctx, lookX * 0.8 + R * 0.13, R * 0.33, R * 0.15, R * 0.07, c);
    }
  }

  // Draws only the head. (0,0) is the centre of the head.
  function drawHead(ctx, look, R, o) {
    o = o || {};
    const t = o.t || 0;
    const side = o.facing || 0;
    const lookX = side * R * 0.14;

    drawHairBack(ctx, look, R, side || 1);

    // ears
    ellipse(ctx, -R * 0.95, R * 0.05, R * 0.17, R * 0.22, shade(look.skin, -0.08));
    ellipse(ctx, R * 0.95, R * 0.05, R * 0.17, R * 0.22, shade(look.skin, -0.08));
    // face
    ellipse(ctx, 0, 0, R * 0.95, R, look.skin);
    // cheeks
    ctx.globalAlpha = o.expression === "love" || o.expression === "laugh" ? 0.45 : 0.18;
    ellipse(ctx, -R * 0.52 + lookX, R * 0.3, R * 0.16, R * 0.09, "#ff6f7a");
    ellipse(ctx, R * 0.52 + lookX, R * 0.3, R * 0.16, R * 0.09, "#ff6f7a");
    ctx.globalAlpha = 1;

    drawEyes(ctx, look, R, lookX, o);
    drawBrows(ctx, look, R, lookX, o);

    // nose
    ctx.beginPath();
    ctx.arc(lookX * 1.1, R * 0.2, R * 0.08, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = shade(look.skin, -0.3);
    ctx.lineWidth = R * 0.05;
    ctx.lineCap = "round";
    ctx.stroke();

    drawFacialHair(ctx, look, R, lookX);
    drawMouth(ctx, look, R, lookX, o, t);
    if (look.mole) ellipse(ctx, R * 0.45 + lookX, R * 0.45, R * 0.035, R * 0.035, "#3a2a20");
    drawGlasses(ctx, look, R, lookX);
    drawHairFront(ctx, look, R, side || 1);

    if (o.helmet) {
      ellipse(ctx, 0, -R * 0.05, R * 1.55, R * 1.5, "rgba(190,230,255,0.18)", "rgba(220,240,255,0.85)", R * 0.08);
      ctx.beginPath();
      ctx.ellipse(-R * 0.6, -R * 0.7, R * 0.35, R * 0.16, -0.6, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
    }
  }

  /*
   * Draws a whole Mii standing with feet at (x, y).
   * o = { t, scale, walking, phase, facing (-1/0/1), lift, talking, expression,
   *       arms ("down" | "wave" | "up" | "cheer"), blink, helmet, held }
   */
  function drawMii(ctx, look, x, y, o) {
    const s = o.scale || 1;
    const t = o.t || 0;
    const R = 20;
    const bodyH = 20 + (look.height / 127) * 18;
    const bodyW = 18 + (look.build / 127) * 14;
    const legH = 13 + (look.height / 127) * 5;
    const phase = o.phase || 0;
    const walking = !!o.walking;
    const lift = o.lift || 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    // shadow stays on the ground, shrinking as the Mii goes up
    const shadowShrink = 1 / (1 + lift / 60);
    ctx.globalAlpha = 0.22 * shadowShrink;
    ellipse(ctx, 0, 0, (bodyW * 0.75 + 6) * shadowShrink, 5 * shadowShrink, "#000000");
    ctx.globalAlpha = 1;

    const bob = walking ? Math.abs(Math.sin(phase)) * 2.2 : Math.sin(t * 2) * 0.4;
    ctx.translate(0, -lift - bob);

    // ----- legs -----
    const pants = "#3b4a6b";
    const swing = walking ? Math.sin(phase) : 0;
    const dangle = o.held ? Math.sin(t * 9) * 4 : 0;
    for (const side of [-1, 1]) {
      const lx = side * bodyW * 0.22;
      const stepLift = walking ? Math.max(0, Math.sin(phase + (side > 0 ? Math.PI : 0))) * 4 : 0;
      const kick = walking ? swing * side * 3 : dangle * side;
      roundRect(ctx, lx - 4.5 + kick * 0.3, -legH, 9, legH - stepLift, 4);
      ctx.fillStyle = pants;
      ctx.fill();
      ellipse(ctx, lx + kick * 0.5 + (o.facing || 0) * 2, -stepLift - 2, 6, 3.6, "#2b2b35");
    }

    // ----- arms (behind body when down) -----
    const shoulderY = -legH - bodyH + 6;
    const armLen = bodyH * 0.85;
    function drawArm(side) {
      let angle; // 0 = straight down, positive = outward
      const mode = o.arms || "down";
      if (mode === "wave") angle = side > 0 ? 2.5 + Math.sin(t * 12) * 0.35 : 0.25;
      else if (mode === "up") angle = 2.7;
      else if (mode === "cheer") angle = 2.4 + Math.sin(t * 10 + side) * 0.3;
      else if (mode === "out") angle = 1.3 + Math.sin(t * 8 + side * 2) * 0.4;
      else if (o.held) angle = 0.9 + Math.sin(t * 8 + side) * 0.3;
      else angle = 0.15 + (walking ? Math.sin(phase) * side * 0.35 : 0);
      ctx.save();
      ctx.translate(side * bodyW * 0.48, shoulderY);
      ctx.rotate(-side * angle);
      roundRect(ctx, -3.5, 0, 7, armLen, 3.5);
      ctx.fillStyle = shade(look.shirt, -0.12);
      ctx.fill();
      ellipse(ctx, 0, armLen, 4.2, 4.2, look.skin);
      ctx.restore();
    }
    drawArm(-1);
    drawArm(1);

    // ----- body -----
    const top = -legH - bodyH;
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.38, top);
    ctx.lineTo(bodyW * 0.38, top);
    ctx.quadraticCurveTo(bodyW * 0.55, top + 2, bodyW * 0.55, top + 8);
    ctx.lineTo(bodyW * 0.5, -legH + 2);
    ctx.quadraticCurveTo(0, -legH + 5, -bodyW * 0.5, -legH + 2);
    ctx.lineTo(-bodyW * 0.55, top + 8);
    ctx.quadraticCurveTo(-bodyW * 0.55, top + 2, -bodyW * 0.38, top);
    ctx.closePath();
    ctx.fillStyle = look.shirt;
    ctx.fill();
    // collar
    ctx.beginPath();
    ctx.moveTo(-5, top);
    ctx.lineTo(0, top + 5);
    ctx.lineTo(5, top);
    ctx.fillStyle = shade(look.shirt, 0.35);
    ctx.fill();

    // ----- head -----
    const tilt = (o.facing || 0) * 0.05 + (o.expression === "laugh" ? Math.sin(t * 16) * 0.05 : 0);
    ctx.translate(0, top - R * 0.9);
    ctx.rotate(tilt);
    drawHead(ctx, look, R, o);

    ctx.restore();

    // Return where the top of the head is, so bubbles can be placed above it.
    return { headTopY: y - (lift + bob + legH + bodyH + R * 1.9) * s, headX: x };
  }

  // A small portrait for the roster list.
  function drawPortrait(canvas, look) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h * 0.54);
    const R = Math.min(w, h) * 0.3;
    drawHead(ctx, look, R, { facing: 0 });
    ctx.restore();
  }

  root.MiiRenderer = { drawMii, drawHead, drawPortrait, roundRect, ellipse, shade };
})(typeof self !== "undefined" ? self : this);
