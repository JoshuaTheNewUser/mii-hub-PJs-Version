/*
 * pb-audio.js
 * Procedural sound effects for the Paintball mini-game. Every sound is synthesised with WebAudio
 * (noise buffers, filters, oscillators, envelopes) and pre-rendered ONCE into an AudioBuffer with
 * an OfflineAudioContext at create() time, so play() is just "start a buffer source" and can be
 * fired 10+ times per second with a little random pitch variation.
 * Classic script, exposes window.PBAudio. Never throws when WebAudio is missing (play() = no-op).
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------------------------
  // Synthesis helpers (all operate on an OfflineAudioContext `c`, output node `o`)
  // ---------------------------------------------------------------------------------------------
  function noiseBuffer(c, dur, color) {
    var len = Math.max(1, Math.ceil(dur * c.sampleRate));
    var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), i;
    var b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (color === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else if (color === "brown") {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else if (color === "crackle") {
        d[i] = Math.random() < 0.012 ? (Math.random() * 2 - 1) : w * 0.08;
      } else d[i] = w;
    }
    return buf;
  }

  function env(param, t, a, peak, d, shape) {
    param.setValueAtTime(0.0001, t);
    if (a > 0) param.linearRampToValueAtTime(peak, t + a); else param.setValueAtTime(peak, t);
    if (shape === "lin") param.linearRampToValueAtTime(0.0001, t + a + d);
    else param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // filtered noise burst. p: { t, dur, type, f, f2, Q, a, d, vol, color, fT }
  function burst(c, o, p) {
    var t = p.t || 0, a = p.a === undefined ? 0.002 : p.a, d = p.d || 0.1;
    var s = c.createBufferSource();
    s.buffer = noiseBuffer(c, a + d + 0.05, p.color);
    var f = c.createBiquadFilter();
    f.type = p.type || "bandpass";
    f.frequency.setValueAtTime(p.f || 1000, t);
    if (p.f2) f.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fT || a + d));
    f.Q.value = p.Q === undefined ? 1 : p.Q;
    var g = c.createGain();
    env(g.gain, t, a, p.vol === undefined ? 1 : p.vol, d, p.shape);
    s.connect(f); f.connect(g); g.connect(o);
    s.start(t); s.stop(t + a + d + 0.04);
  }

  // oscillator tone with pitch sweep. p: { t, type, f, f2, fT, a, d, vol }
  function tone(c, o, p) {
    var t = p.t || 0, a = p.a === undefined ? 0.002 : p.a, d = p.d || 0.2;
    var osc = c.createOscillator();
    osc.type = p.type || "sine";
    osc.frequency.setValueAtTime(p.f, t);
    if (p.f2) osc.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fT || a + d));
    if (p.detune) osc.detune.value = p.detune;
    var g = c.createGain();
    env(g.gain, t, a, p.vol === undefined ? 1 : p.vol, d, p.shape);
    var out = o;
    if (p.lp) { var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = p.lp; lp.connect(o); out = lp; }
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + a + d + 0.03);
  }

  // metallic ring: inharmonic partials
  function ring(c, o, t, freqs, d, vol, a) {
    for (var i = 0; i < freqs.length; i++) {
      tone(c, o, { t: t, f: freqs[i], a: a || 0.0008, d: d * (1 - i * 0.12), vol: vol / (1 + i * 0.6) });
    }
  }

  function click(c, o, t, f, vol, d) { burst(c, o, { t: t, type: "bandpass", f: f || 2500, Q: 0.9, a: 0.0005, d: d || 0.012, vol: (vol || 1) * 1.6 }); }

  function shaper(c, amount) {
    var ws = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    ws.curve = curve;
    return ws;
  }

  function echo(c, inp, out, time, fb, wet, lp) {
    var dl = c.createDelay(1.0); dl.delayTime.value = time;
    var g = c.createGain(); g.gain.value = fb;
    var w = c.createGain(); w.gain.value = wet;
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp || 2500;
    inp.connect(dl); dl.connect(f); f.connect(g); g.connect(dl); f.connect(w); w.connect(out);
  }

  function splat(c, o, t, vol, wet) { // wet paint splat
    burst(c, o, { t: t, type: "lowpass", f: 2600, f2: 500, Q: 0.8, a: 0.001, d: 0.09, vol: vol });
    burst(c, o, { t: t + 0.004, type: "bandpass", f: 900, f2: 260, Q: 2.5, a: 0.003, d: 0.12, vol: vol * 0.8 * (wet || 1) });
    burst(c, o, { t: t + 0.02, type: "bandpass", f: 1800, f2: 700, Q: 4, a: 0.002, d: 0.05, vol: vol * 0.35 * (wet || 1), color: "crackle" });
    tone(c, o, { t: t, f: 160, f2: 60, a: 0.002, d: 0.08, vol: vol * 0.5 });
  }

  function notes(c, o, seq, type, vol, lp) { // seq: [[t, freq, dur], ...]
    for (var i = 0; i < seq.length; i++) {
      var n = seq[i];
      tone(c, o, { t: n[0], f: n[1], type: type || "triangle", a: 0.006, d: n[2], vol: vol * (n[3] || 1), lp: lp });
      tone(c, o, { t: n[0], f: n[1] * 2, type: "sine", a: 0.004, d: n[2] * 0.6, vol: vol * 0.25 * (n[3] || 1) });
    }
  }
  var NOTE = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  // glockenspiel-ish bell: a sine with inharmonic partials
  function bell(c, o, t, f, d, vol) {
    tone(c, o, { t: t, f: f, a: 0.002, d: d, vol: vol });
    tone(c, o, { t: t, f: f * 2.76, a: 0.001, d: d * 0.45, vol: vol * 0.35 });
    tone(c, o, { t: t, f: f * 5.4, a: 0.001, d: d * 0.2, vol: vol * 0.15 });
  }
  // shimmering glitter: lots of tiny high bells over `dur`
  function sparkle(c, o, t, dur, count, vol) {
    for (var i = 0; i < count; i++) {
      var tt = t + Math.pow(Math.random(), 1.4) * dur;
      bell(c, o, tt, 2400 + Math.random() * 4200, 0.12 + Math.random() * 0.25, vol * (1 - (tt - t) / (dur * 1.3)));
    }
  }
  // warm sustained chord (detuned saws through a lowpass)
  function pad(c, o, t, midi, d, vol) {
    for (var i = 0; i < midi.length; i++) {
      tone(c, o, { t: t, f: NOTE(midi[i]), type: "sawtooth", a: 0.15, d: d, vol: vol, lp: 1800, detune: -7 });
      tone(c, o, { t: t, f: NOTE(midi[i]), type: "sawtooth", a: 0.15, d: d, vol: vol, lp: 1800, detune: 7 });
    }
  }
  // brassy fanfare: seq [[t, midi, dur, vol], ...]
  function fanfare(c, o, t, seq, vol) {
    for (var i = 0; i < seq.length; i++) {
      var n = seq[i], v = vol * (n[3] || 1);
      tone(c, o, { t: t + n[0], f: NOTE(n[1]), type: "sawtooth", a: 0.012, d: n[2], vol: v, lp: 2600 });
      tone(c, o, { t: t + n[0], f: NOTE(n[1]), type: "square", a: 0.01, d: n[2] * 0.8, vol: v * 0.35, lp: 1400, detune: 5 });
    }
  }
  // the "BOOM" when a rare item lands
  function impact(c, o, t, k) {
    tone(c, o, { t: t, f: 140, f2: 38, fT: 0.4, a: 0.002, d: 0.6 * k, vol: 1.2 * k });
    burst(c, o, { t: t, type: "lowpass", f: 2400, f2: 200, Q: 0.7, a: 0.002, d: 0.5 * k, vol: 0.8 * k, color: "brown" });
    burst(c, o, { t: t, type: "highpass", f: 3000, Q: 0.5, a: 0.002, d: 0.35, vol: 0.35 * k, color: "pink" });
    ring(c, o, t, [523, 1046, 1568, 2093, 3136], 1.2, 0.35 * k);
  }

  // ---------------------------------------------------------------------------------------------
  // Recipes: { dur, level (peak after normalisation), variants, build(c, out, variantIndex) }
  // ---------------------------------------------------------------------------------------------
  var R = {
    ak: { dur: 0.42, level: 0.95, variants: 3, build: function (c, o) {
      var pre = c.createGain(); var sh = shaper(c, 2.2); pre.connect(sh); sh.connect(o);
      click(c, pre, 0, 2600, 0.35, 0.005); // hammer/valve click
      burst(c, pre, { t: 0.001, type: "bandpass", f: 1500, f2: 800, Q: 1.1, a: 0.001, d: 0.035, vol: 0.85 }); // "pak" crack
      burst(c, pre, { t: 0.0, type: "bandpass", f: 650, f2: 240, Q: 1.4, a: 0.004, d: 0.1, vol: 1.1 }); // pneumatic thwup
      tone(c, pre, { t: 0, f: 180, f2: 48, fT: 0.09, a: 0.002, d: 0.15, vol: 1.3 }); // body thump
      tone(c, pre, { t: 0, f: 95, f2: 40, a: 0.003, d: 0.2, vol: 0.55 });
      burst(c, pre, { t: 0.012, type: "lowpass", f: 1400, f2: 500, Q: 0.5, a: 0.01, d: 0.3, vol: 0.22, color: "pink" }); // air tail
      echo(c, pre, o, 0.06, 0.25, 0.18, 1800);
    } },
    akFar: { dur: 0.9, level: 0.6, variants: 2, build: function (c, o) {
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100; lp.connect(o);
      burst(c, lp, { t: 0, type: "bandpass", f: 700, f2: 300, Q: 1, a: 0.004, d: 0.08, vol: 0.9 });
      tone(c, lp, { t: 0, f: 120, f2: 45, a: 0.004, d: 0.16, vol: 0.9 });
      burst(c, lp, { t: 0.01, type: "lowpass", f: 800, Q: 0.5, a: 0.03, d: 0.5, vol: 0.25, color: "pink" });
      echo(c, lp, o, 0.13, 0.35, 0.35, 900);
    } },
    // AWP: a huge pneumatic "KA-THOOM": sharp crack, heavy low body, compressed-air blast and a long tail
    awp: { dur: 1.4, level: 0.98, variants: 2, build: function (c, o) {
      var pre = c.createGain(); var sh = shaper(c, 2.6); pre.connect(sh); sh.connect(o);
      click(c, pre, 0, 3200, 0.6, 0.004); // sear / valve
      burst(c, pre, { t: 0.0, type: "highpass", f: 2500, Q: 0.6, a: 0.0005, d: 0.025, vol: 0.55 }); // supersonic-ish crack
      burst(c, pre, { t: 0.001, type: "bandpass", f: 1900, f2: 700, Q: 0.9, a: 0.001, d: 0.06, vol: 1.2 }); // "KA"
      burst(c, pre, { t: 0.0, type: "bandpass", f: 520, f2: 140, Q: 1.1, a: 0.004, d: 0.22, vol: 1.4 }); // pneumatic thump
      tone(c, pre, { t: 0, f: 150, f2: 34, fT: 0.25, a: 0.002, d: 0.38, vol: 1.8 }); // body boom
      tone(c, pre, { t: 0, f: 70, f2: 28, a: 0.004, d: 0.55, vol: 1.0 });
      burst(c, pre, { t: 0.005, type: "lowpass", f: 900, f2: 160, Q: 0.6, a: 0.01, d: 0.6, vol: 0.9, color: "brown" }); // boom tail
      burst(c, pre, { t: 0.015, type: "lowpass", f: 2200, f2: 500, Q: 0.5, a: 0.02, d: 0.5, vol: 0.35, color: "pink" }); // air blast hiss
      echo(c, pre, o, 0.11, 0.38, 0.32, 1400); // slap back off the walls
      echo(c, pre, o, 0.23, 0.3, 0.18, 800);
    } },
    awpFar: { dur: 2.0, level: 0.7, variants: 2, build: function (c, o) {
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(o);
      burst(c, lp, { t: 0, type: "bandpass", f: 800, f2: 250, Q: 0.9, a: 0.003, d: 0.12, vol: 1.0 });
      tone(c, lp, { t: 0, f: 110, f2: 32, a: 0.004, d: 0.4, vol: 1.2 });
      burst(c, lp, { t: 0.01, type: "lowpass", f: 600, f2: 150, Q: 0.5, a: 0.04, d: 0.9, vol: 0.5, color: "brown" }); // rolling thunder
      echo(c, lp, o, 0.21, 0.45, 0.45, 700);
      echo(c, lp, o, 0.37, 0.35, 0.3, 500);
    } },
    // Deagle: a deep, punchy hand-cannon "BLAM": sharp slide crack, fat low body, short room tail
    deagle: { dur: 0.75, level: 0.97, variants: 2, build: function (c, o, v) {
      var k = v ? 0.94 : 1; // the second variant is a touch lower and darker
      var pre = c.createGain(); var sh = shaper(c, 3.0); pre.connect(sh); sh.connect(o);
      click(c, pre, 0, 3600 * k, 0.7, 0.004); // hammer / valve
      burst(c, pre, { t: 0.0, type: "highpass", f: 2800, Q: 0.6, a: 0.0005, d: 0.018, vol: 0.5 }); // crack
      burst(c, pre, { t: 0.001, type: "bandpass", f: 1250 * k, f2: 520, Q: 1.0, a: 0.001, d: 0.05, vol: 1.25 }); // "BLA-"
      burst(c, pre, { t: 0.0, type: "bandpass", f: 420 * k, f2: 120, Q: 1.2, a: 0.003, d: 0.17, vol: 1.5 }); // "-AM" thump
      tone(c, pre, { t: 0, f: 135 * k, f2: 36, fT: 0.16, a: 0.002, d: 0.26, vol: 2.0 }); // chest punch
      tone(c, pre, { t: 0, f: 62 * k, f2: 30, a: 0.003, d: 0.32, vol: 1.0 });
      burst(c, pre, { t: 0.004, type: "lowpass", f: 1000, f2: 180, Q: 0.6, a: 0.008, d: 0.32, vol: 0.6, color: "brown" }); // boom tail
      burst(c, pre, { t: 0.01, type: "lowpass", f: 2400, f2: 600, Q: 0.5, a: 0.012, d: 0.22, vol: 0.28, color: "pink" }); // gas hiss
      click(c, pre, 0.035, 2100, 0.35, 0.008); ring(c, pre, 0.035, [1350, 2550], 0.04, 0.12); // slide cycling
      echo(c, pre, o, 0.08, 0.3, 0.25, 1500);
      echo(c, pre, o, 0.17, 0.25, 0.14, 900);
    } },
    deagleFar: { dur: 1.3, level: 0.66, variants: 2, build: function (c, o, v) {
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = v ? 850 : 1000; lp.connect(o);
      burst(c, lp, { t: 0, type: "bandpass", f: 650, f2: 240, Q: 1, a: 0.003, d: 0.1, vol: 1.0 });
      tone(c, lp, { t: 0, f: 105, f2: 36, a: 0.004, d: 0.26, vol: 1.1 });
      burst(c, lp, { t: 0.01, type: "lowpass", f: 700, f2: 170, Q: 0.5, a: 0.03, d: 0.6, vol: 0.4, color: "brown" });
      echo(c, lp, o, 0.17, 0.4, 0.4, 800);
      echo(c, lp, o, 0.31, 0.3, 0.25, 550);
    } },
    // Deagle reload foley (viewmodel: mag drops at ~0.3 s, new mag seated at ~1.3 s, slide release ~1.75 s)
    deagleMagOut: { dur: 0.42, level: 0.72, build: function (c, o) {
      click(c, o, 0, 2900, 0.9, 0.007); ring(c, o, 0, [1700, 2900, 4300], 0.05, 0.28); // mag catch
      burst(c, o, { t: 0.015, type: "bandpass", f: 1800, f2: 800, Q: 2, a: 0.012, d: 0.09, vol: 0.55 }); // slides out of the grip
      burst(c, o, { t: 0.13, type: "lowpass", f: 1100, Q: 0.7, a: 0.002, d: 0.05, vol: 0.35 }); // light rattle of the balls
      burst(c, o, { t: 0.14, type: "bandpass", f: 3200, Q: 1.5, a: 0.004, d: 0.05, vol: 0.2, color: "crackle" });
    } },
    deagleMagIn: { dur: 0.42, level: 0.82, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 900, f2: 2000, Q: 2, a: 0.03, d: 0.06, vol: 0.4 }); // slide in
      click(c, o, 0.09, 2400, 1, 0.011); ring(c, o, 0.09, [1400, 2600, 4100], 0.09, 0.38); // seat
      tone(c, o, { t: 0.09, f: 230, f2: 95, a: 0.001, d: 0.06, vol: 0.6 });
      click(c, o, 0.16, 3600, 0.6, 0.005); ring(c, o, 0.16, [2300, 3900], 0.05, 0.2); // palm tap click
    } },
    // slide pulled back and let go: rack (also used for the draw and the slide release after an empty reload)
    deagleSlide: { dur: 0.4, level: 0.82, build: function (c, o) {
      click(c, o, 0, 2300, 0.7, 0.008);
      burst(c, o, { t: 0.005, type: "bandpass", f: 1500, f2: 2800, Q: 2.5, a: 0.015, d: 0.06, vol: 0.45, color: "crackle" }); // slide back
      click(c, o, 0.07, 2000, 0.8, 0.009); ring(c, o, 0.07, [1150, 2100], 0.05, 0.22); // stop
      click(c, o, 0.13, 1700, 1, 0.012); ring(c, o, 0.13, [880, 1620, 2700, 4000], 0.15, 0.5); // slams home
      tone(c, o, { t: 0.13, f: 210, f2: 85, a: 0.001, d: 0.08, vol: 0.7 });
    } },
    // bolt cycle, timed to the viewmodel (lift 0.06, pull back 0.11-0.23, push 0.29-0.39, lock 0.47)
    awpBolt: { dur: 0.62, level: 0.8, build: function (c, o) {
      click(c, o, 0.03, 2600, 0.6, 0.006); click(c, o, 0.06, 3400, 0.8, 0.006); ring(c, o, 0.06, [2100, 3700], 0.04, 0.2); // lift
      burst(c, o, { t: 0.11, type: "bandpass", f: 1300, f2: 2600, Q: 2.5, a: 0.02, d: 0.1, vol: 0.55, color: "crackle" }); // slide back
      burst(c, o, { t: 0.11, type: "bandpass", f: 3000, Q: 1.5, a: 0.03, d: 0.09, vol: 0.18 });
      click(c, o, 0.23, 1900, 1, 0.01); ring(c, o, 0.23, [1150, 2250, 3500], 0.08, 0.35); // stop clack
      tone(c, o, { t: 0.23, f: 240, f2: 110, a: 0.001, d: 0.05, vol: 0.5 });
      burst(c, o, { t: 0.29, type: "bandpass", f: 2400, f2: 1300, Q: 2.5, a: 0.02, d: 0.09, vol: 0.5, color: "crackle" }); // push
      click(c, o, 0.39, 1700, 1, 0.012); ring(c, o, 0.39, [950, 1800, 2900, 4300], 0.12, 0.45); // chamber
      tone(c, o, { t: 0.39, f: 200, f2: 85, a: 0.001, d: 0.07, vol: 0.6 });
      click(c, o, 0.47, 3000, 0.9, 0.007); ring(c, o, 0.47, [2500, 4100], 0.05, 0.25); // handle down / lock
    } },
    awpMagOut: { dur: 0.45, level: 0.7, build: function (c, o) {
      click(c, o, 0, 2600, 0.9, 0.008); ring(c, o, 0, [1500, 2600], 0.06, 0.25); // release
      burst(c, o, { t: 0.03, type: "bandpass", f: 1300, f2: 600, Q: 2, a: 0.02, d: 0.14, vol: 0.55 }); // slide out
      burst(c, o, { t: 0.2, type: "lowpass", f: 800, Q: 0.7, a: 0.002, d: 0.07, vol: 0.5 });
      tone(c, o, { t: 0.2, f: 160, f2: 80, a: 0.002, d: 0.07, vol: 0.45 });
    } },
    awpMagIn: { dur: 0.5, level: 0.8, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 700, f2: 1600, Q: 2, a: 0.04, d: 0.08, vol: 0.4 }); // slide in
      click(c, o, 0.13, 2200, 1, 0.012); ring(c, o, 0.13, [1250, 2300, 3900], 0.1, 0.35);
      tone(c, o, { t: 0.13, f: 190, f2: 80, a: 0.001, d: 0.08, vol: 0.65 });
      click(c, o, 0.24, 3200, 0.7, 0.006); ring(c, o, 0.24, [1900, 3300], 0.06, 0.25); // seat click
    } },
    // scope zoom: quick lens whir + detent click
    zoom: { dur: 0.22, level: 0.5, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 1800, f2: 4200, Q: 3, a: 0.02, d: 0.07, vol: 0.5 });
      tone(c, o, { t: 0, f: 900, f2: 1500, a: 0.01, d: 0.07, vol: 0.12, type: "triangle" });
      click(c, o, 0.075, 4200, 0.9, 0.004); ring(c, o, 0.075, [3300, 5600], 0.03, 0.2);
    } },
    dry: { dur: 0.15, level: 0.5, build: function (c, o) {
      click(c, o, 0, 4000, 1, 0.004);
      ring(c, o, 0.001, [2300, 3900], 0.03, 0.25);
      click(c, o, 0.045, 3000, 0.6, 0.006);
    } },
    magOut: { dur: 0.4, level: 0.7, build: function (c, o) {
      click(c, o, 0, 3000, 0.8, 0.008); ring(c, o, 0, [1900, 3100], 0.05, 0.25);
      burst(c, o, { t: 0.02, type: "bandpass", f: 1600, f2: 700, Q: 2, a: 0.02, d: 0.12, vol: 0.6 }); // slide out
      burst(c, o, { t: 0.15, type: "lowpass", f: 900, Q: 0.7, a: 0.002, d: 0.06, vol: 0.5 });
      tone(c, o, { t: 0.15, f: 180, f2: 90, a: 0.002, d: 0.06, vol: 0.4 });
    } },
    magIn: { dur: 0.45, level: 0.8, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 800, f2: 1800, Q: 2, a: 0.03, d: 0.07, vol: 0.4 }); // slide in
      click(c, o, 0.11, 2600, 1, 0.01); ring(c, o, 0.11, [1500, 2700, 4300], 0.08, 0.35);
      tone(c, o, { t: 0.11, f: 220, f2: 90, a: 0.001, d: 0.07, vol: 0.6 });
      click(c, o, 0.2, 3500, 0.7, 0.006); ring(c, o, 0.2, [2100, 3600], 0.06, 0.25); // seat click
    } },
    bolt: { dur: 0.55, level: 0.8, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 1200, f2: 2400, Q: 3, a: 0.01, d: 0.09, vol: 0.5, color: "crackle" }); // pull rattle
      click(c, o, 0.0, 2200, 0.7, 0.008);
      click(c, o, 0.1, 2000, 0.8, 0.01); ring(c, o, 0.1, [1200, 2300], 0.06, 0.25);
      // slam forward
      click(c, o, 0.24, 1800, 1, 0.012); ring(c, o, 0.24, [900, 1650, 2750, 4100], 0.16, 0.5);
      tone(c, o, { t: 0.24, f: 200, f2: 80, a: 0.001, d: 0.08, vol: 0.7 });
    } },
    deploy: { dur: 0.6, level: 0.55, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 500, f2: 1400, Q: 0.8, a: 0.12, d: 0.15, vol: 0.4, color: "pink", shape: "lin" }); // cloth/whoosh
      click(c, o, 0.3, 2400, 0.7, 0.008); ring(c, o, 0.3, [1700, 2900], 0.05, 0.25);
      tone(c, o, { t: 0.3, f: 160, f2: 80, d: 0.05, vol: 0.4 });
    } },
    knifeDeploy: { dur: 1.0, level: 0.75, build: function (c, o) {
      burst(c, o, { t: 0.05, type: "bandpass", f: 600, f2: 2200, Q: 1.2, a: 0.08, d: 0.12, vol: 0.35 }); // flick whoosh
      var ts = [0.22, 0.4, 0.47, 0.72, 0.78];
      for (var i = 0; i < ts.length; i++) {
        var k = 0.6 + Math.random() * 0.4;
        click(c, o, ts[i], 3500, 0.9 * k, 0.006);
        ring(c, o, ts[i], [3100 + i * 170, 5200 + i * 230, 7600], 0.07, 0.3 * k);
      }
      burst(c, o, { t: 0.5, type: "bandpass", f: 900, f2: 2600, Q: 1.2, a: 0.06, d: 0.1, vol: 0.25 });
    } },
    slash: { dur: 0.35, level: 0.6, variants: 2, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 350, f2: 2600, fT: 0.11, Q: 1.6, a: 0.09, d: 0.14, vol: 1, color: "pink" });
      burst(c, o, { t: 0.05, type: "bandpass", f: 3200, Q: 1.2, a: 0.05, d: 0.07, vol: 0.12 });
    } },
    stab: { dur: 0.5, level: 0.7, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 250, f2: 1400, fT: 0.16, Q: 1.3, a: 0.14, d: 0.12, vol: 1, color: "pink" });
      burst(c, o, { t: 0.2, type: "bandpass", f: 1400, f2: 500, Q: 1, a: 0.01, d: 0.1, vol: 0.6 });
    } },
    knifeHit: { dur: 0.35, level: 0.85, build: function (c, o) {
      tone(c, o, { t: 0, f: 140, f2: 55, a: 0.001, d: 0.14, vol: 1 });
      burst(c, o, { t: 0, type: "lowpass", f: 900, f2: 300, Q: 1, a: 0.001, d: 0.1, vol: 0.9 });
      splat(c, o, 0.01, 0.45, 0.6);
    } },
    hitBody: { dur: 0.35, level: 0.8, variants: 3, build: function (c, o) {
      splat(c, o, 0, 1, 1.2);
      tone(c, o, { t: 0, f: 110, f2: 55, a: 0.001, d: 0.1, vol: 0.7 });
    } },
    hitHead: { dur: 0.75, level: 0.95, build: function (c, o) {
      // the iconic sharp metallic helmet "dink"
      click(c, o, 0, 6000, 1, 0.004);
      ring(c, o, 0, [3350, 4870, 6920, 8940], 0.42, 0.9, 0.0005);
      ring(c, o, 0.0, [2210], 0.25, 0.35);
      splat(c, o, 0.012, 0.55, 1);
    } },
    hitWall: { dur: 0.4, level: 0.7, variants: 3, build: function (c, o) {
      splat(c, o, 0, 0.9, 0.9);
      ring(c, o, 0, [1250, 2710, 4100], 0.12, 0.18);
    } },
    hitWood: { dur: 0.35, level: 0.7, variants: 2, build: function (c, o) {
      splat(c, o, 0, 0.8, 0.9);
      tone(c, o, { t: 0, f: 420, f2: 380, a: 0.001, d: 0.06, vol: 0.5 });
      tone(c, o, { t: 0, f: 610, a: 0.001, d: 0.04, vol: 0.3 });
      burst(c, o, { t: 0, type: "bandpass", f: 950, Q: 3, a: 0.001, d: 0.05, vol: 0.5 });
    } },
    step: { dur: 0.22, level: 0.6, variants: 5, build: function (c, o, v) {
      var f = 1 + (v - 2) * 0.06;
      tone(c, o, { t: 0, f: 95 * f, f2: 55, a: 0.002, d: 0.06, vol: 0.8 });
      burst(c, o, { t: 0, type: "lowpass", f: 1600 * f, f2: 400, Q: 0.7, a: 0.002, d: 0.06, vol: 0.7 });
      burst(c, o, { t: 0.004, type: "highpass", f: 2600 * f, Q: 0.5, a: 0.003, d: 0.07, vol: 0.55, color: "crackle" }); // grit
      burst(c, o, { t: 0.03, type: "bandpass", f: 4200, Q: 1, a: 0.01, d: 0.06, vol: 0.18, color: "crackle" });
    } },
    land: { dur: 0.4, level: 0.8, build: function (c, o) {
      tone(c, o, { t: 0, f: 85, f2: 40, a: 0.002, d: 0.14, vol: 1 });
      burst(c, o, { t: 0, type: "lowpass", f: 1400, f2: 300, Q: 0.7, a: 0.002, d: 0.12, vol: 0.9 });
      burst(c, o, { t: 0.005, type: "highpass", f: 2400, Q: 0.5, a: 0.004, d: 0.14, vol: 0.6, color: "crackle" });
      burst(c, o, { t: 0.03, type: "highpass", f: 3000, Q: 0.5, a: 0.01, d: 0.1, vol: 0.3, color: "crackle" });
    } },
    jump: { dur: 0.3, level: 0.45, build: function (c, o) {
      burst(c, o, { t: 0, type: "highpass", f: 2200, Q: 0.5, a: 0.002, d: 0.05, vol: 0.6, color: "crackle" });
      tone(c, o, { t: 0, f: 110, f2: 70, d: 0.04, vol: 0.4 });
      burst(c, o, { t: 0.02, type: "bandpass", f: 500, f2: 1100, Q: 0.8, a: 0.05, d: 0.12, vol: 0.4, color: "pink" }); // cloth
    } },
    hurt: { dur: 0.5, level: 0.85, build: function (c, o) {
      var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500; lp.connect(o);
      tone(c, lp, { t: 0, f: 90, f2: 42, a: 0.003, d: 0.3, vol: 1 });
      burst(c, lp, { t: 0, type: "lowpass", f: 600, f2: 150, Q: 0.7, a: 0.003, d: 0.22, vol: 0.9, color: "brown" });
      splat(c, lp, 0.005, 0.5, 1);
    } },
    kill: { dur: 0.75, level: 0.7, build: function (c, o) {
      var b = function (t, f, v) { tone(c, o, { t: t, f: f, a: 0.002, d: 0.5, vol: v }); tone(c, o, { t: t, f: f * 2.01, a: 0.002, d: 0.25, vol: v * 0.3 }); tone(c, o, { t: t, f: f * 3.02, a: 0.001, d: 0.12, vol: v * 0.15 }); };
      b(0, NOTE(88), 0.8); b(0.07, NOTE(95), 1);
      click(c, o, 0, 5000, 0.3, 0.003);
    } },
    roundStart: { dur: 1.3, level: 0.6, build: function (c, o) {
      notes(c, o, [[0, NOTE(69), 0.12], [0.25, NOTE(69), 0.12], [0.5, NOTE(69), 0.12], [0.75, NOTE(81), 0.45, 1.2]], "square", 0.25, 2600);
    } },
    roundWin: { dur: 1.7, level: 0.65, build: function (c, o) {
      notes(c, o, [[0, NOTE(72), 0.14], [0.13, NOTE(76), 0.14], [0.26, NOTE(79), 0.14], [0.42, NOTE(84), 0.7, 1.2], [0.42, NOTE(76), 0.7, 0.6], [0.42, NOTE(79), 0.7, 0.6]], "square", 0.22, 3000);
    } },
    roundLose: { dur: 1.6, level: 0.55, build: function (c, o) {
      notes(c, o, [[0, NOTE(67), 0.22], [0.22, NOTE(63), 0.22], [0.44, NOTE(60), 0.22], [0.66, NOTE(55), 0.75, 1.1], [0.66, NOTE(58), 0.75, 0.6]], "triangle", 0.4, 1800);
    } },
    matchWin: { dur: 2.6, level: 0.7, build: function (c, o) {
      notes(c, o, [[0, NOTE(72), 0.12], [0.12, NOTE(72), 0.12], [0.24, NOTE(72), 0.12], [0.36, NOTE(72), 0.3], [0.7, NOTE(68), 0.3], [1.0, NOTE(70), 0.3], [1.3, NOTE(72), 0.15], [1.5, NOTE(70), 0.1], [1.62, NOTE(72), 0.9, 1.25], [1.62, NOTE(76), 0.9, 0.7], [1.62, NOTE(79), 0.9, 0.7]], "square", 0.2, 3200);
    } },
    matchLose: { dur: 2.4, level: 0.55, build: function (c, o) {
      notes(c, o, [[0, NOTE(64), 0.35], [0.35, NOTE(63), 0.35], [0.7, NOTE(62), 0.35], [1.05, NOTE(61), 1.1, 1.1], [1.05, NOTE(54), 1.1, 0.8]], "triangle", 0.4, 1500);
    } },
    tick: { dur: 0.08, level: 0.45, build: function (c, o) {
      tone(c, o, { t: 0, f: 1250, a: 0.001, d: 0.04, vol: 0.8 });
      click(c, o, 0, 4000, 0.4, 0.003);
    } },
    uiClick: { dur: 0.06, level: 0.4, build: function (c, o) {
      tone(c, o, { t: 0, f: 1900, f2: 1400, a: 0.001, d: 0.025, vol: 0.7 });
      click(c, o, 0, 3500, 0.5, 0.003);
    } },

    // ---- crates (pb-crates.js) ----
    // the reel's "tk" each time an item passes the marker
    crateTick: { dur: 0.07, level: 0.5, build: function (c, o) {
      tone(c, o, { t: 0, f: 2300, f2: 1700, type: "triangle", a: 0.0008, d: 0.018, vol: 0.8 });
      tone(c, o, { t: 0, f: 820, a: 0.001, d: 0.025, vol: 0.45 });
      click(c, o, 0, 5200, 0.5, 0.004);
    } },
    // unlocking the case: two latch clacks, the lid swinging open
    crateOpen: { dur: 1.0, level: 0.8, build: function (c, o) {
      click(c, o, 0, 2200, 1, 0.01); ring(c, o, 0, [1400, 2600, 3900], 0.12, 0.4);
      tone(c, o, { t: 0, f: 210, f2: 90, a: 0.001, d: 0.08, vol: 0.6 });
      click(c, o, 0.11, 2600, 0.9, 0.008); ring(c, o, 0.11, [1700, 3100, 4600], 0.1, 0.35);
      tone(c, o, { t: 0.11, f: 240, f2: 100, a: 0.001, d: 0.07, vol: 0.5 });
      burst(c, o, { t: 0.18, type: "bandpass", f: 380, f2: 2600, fT: 0.35, Q: 1.1, a: 0.16, d: 0.38, vol: 0.55, color: "pink" }); // lid whoosh
      burst(c, o, { t: 0.22, type: "bandpass", f: 2600, f2: 1200, Q: 3, a: 0.05, d: 0.18, vol: 0.18, color: "crackle" }); // hinge creak
      tone(c, o, { t: 0.5, f: 130, f2: 70, a: 0.002, d: 0.12, vol: 0.45 });
      burst(c, o, { t: 0.5, type: "lowpass", f: 900, f2: 300, Q: 0.7, a: 0.002, d: 0.1, vol: 0.4 }); // lid lands
    } },
    reveal_blue: { dur: 1.5, level: 0.6, build: function (c, o) {
      bell(c, o, 0, NOTE(76), 0.9, 0.8); bell(c, o, 0.1, NOTE(83), 1.1, 0.9);
      tone(c, o, { t: 0, f: NOTE(64), type: "triangle", a: 0.01, d: 0.8, vol: 0.25 });
    } },
    reveal_purple: { dur: 2.0, level: 0.68, build: function (c, o) {
      var seq = [74, 79, 83, 86];
      for (var i = 0; i < seq.length; i++) bell(c, o, i * 0.08, NOTE(seq[i]), 1.0 + i * 0.15, 0.85);
      tone(c, o, { t: 0, f: NOTE(55), type: "triangle", a: 0.02, d: 1.2, vol: 0.3, lp: 1500 });
      sparkle(c, o, 0.3, 0.9, 8, 0.12);
    } },
    reveal_pink: { dur: 2.6, level: 0.75, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 600, f2: 5000, fT: 0.22, Q: 1.5, a: 0.2, d: 0.08, vol: 0.4, color: "pink", shape: "lin" }); // swoosh up
      var seq = [72, 76, 79, 84, 88];
      for (var i = 0; i < seq.length; i++) bell(c, o, 0.22 + i * 0.07, NOTE(seq[i]), 1.2 + i * 0.12, 0.85);
      pad(c, o, 0.5, [60, 64, 67, 72], 1.6, 0.18);
      sparkle(c, o, 0.5, 1.6, 16, 0.14);
    } },
    reveal_red: { dur: 3.3, level: 0.85, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 300, f2: 6000, fT: 0.4, Q: 1.3, a: 0.38, d: 0.06, vol: 0.55, color: "pink", shape: "lin" }); // riser
      impact(c, o, 0.4, 1);
      fanfare(c, o, 0.4, [[0, 67, 0.13], [0.12, 72, 0.13], [0.24, 76, 0.13], [0.36, 79, 1.7, 1.2], [0.36, 72, 1.7, 0.8], [0.36, 76, 1.7, 0.8], [0.36, 84, 1.7, 0.6]], 0.3);
      for (var i = 0; i < 5; i++) bell(c, o, 0.76 + i * 0.06, NOTE([84, 88, 91, 96, 100][i]), 1.4, 0.55);
      sparkle(c, o, 0.75, 2.2, 30, 0.16);
    } },
    reveal_gold: { dur: 4.4, level: 0.9, build: function (c, o) {
      burst(c, o, { t: 0, type: "bandpass", f: 200, f2: 7000, fT: 0.62, Q: 1.2, a: 0.6, d: 0.05, vol: 0.6, color: "pink", shape: "lin" }); // long riser
      tone(c, o, { t: 0, f: 110, f2: 440, fT: 0.62, type: "sawtooth", a: 0.55, d: 0.08, vol: 0.18, lp: 1800, shape: "lin" });
      impact(c, o, 0.64, 1.4);
      fanfare(c, o, 0.64, [[0, 67, 0.11], [0.1, 67, 0.11], [0.2, 67, 0.11], [0.3, 72, 0.36], [0.68, 71, 0.12], [0.8, 72, 0.12], [0.92, 76, 0.12],
        [1.04, 79, 2.2, 1.25], [1.04, 72, 2.2, 0.8], [1.04, 76, 2.2, 0.8], [1.04, 84, 2.2, 0.7], [1.04, 60, 2.2, 0.7]], 0.32);
      pad(c, o, 1.6, [60, 67, 72, 76, 79], 2.4, 0.16);
      for (var i = 0; i < 8; i++) bell(c, o, 1.68 + i * 0.055, NOTE([84, 88, 91, 96, 100, 103, 108, 103][i]), 1.6, 0.5);
      sparkle(c, o, 0.66, 3.5, 60, 0.18);
    } },
    // trade-up contract: the machine clunks three times, whirs, then dings
    tradeUp: { dur: 1.9, level: 0.8, build: function (c, o) {
      for (var i = 0; i < 3; i++) {
        var t = i * 0.16;
        click(c, o, t, 1800, 1, 0.012); ring(c, o, t, [900 + i * 120, 1700 + i * 200, 2900], 0.1, 0.35);
        tone(c, o, { t: t, f: 170, f2: 70, a: 0.001, d: 0.09, vol: 0.7 });
      }
      tone(c, o, { t: 0.45, f: 160, f2: 900, fT: 0.5, type: "sawtooth", a: 0.08, d: 0.45, vol: 0.22, lp: 1600, shape: "lin" }); // servo whir
      burst(c, o, { t: 0.45, type: "bandpass", f: 500, f2: 3500, fT: 0.5, Q: 2, a: 0.4, d: 0.1, vol: 0.3, shape: "lin" });
      bell(c, o, 1.0, NOTE(84), 0.9, 0.9); bell(c, o, 1.08, NOTE(91), 0.9, 0.7);
      sparkle(c, o, 1.0, 0.7, 8, 0.1);
    } }
  };
  var NO_PITCH_VAR = { roundStart: 1, roundWin: 1, roundLose: 1, matchWin: 1, matchLose: 1, kill: 1, tick: 1, uiClick: 1,
    crateTick: 1, crateOpen: 1, reveal_blue: 1, reveal_purple: 1, reveal_pink: 1, reveal_red: 1, reveal_gold: 1, tradeUp: 1 };

  function renderRecipe(OAC, sampleRate, recipe, v) {
    var len = Math.ceil(recipe.dur * sampleRate);
    var c = new OAC(1, len, sampleRate);
    var out = c.createGain(); out.connect(c.destination);
    recipe.build(c, out, v);
    var done = function (buf) {
      // normalise peak to the recipe level and fade the very end
      var d = buf.getChannelData(0), peak = 0, i;
      for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
      var k = peak > 0 ? (recipe.level || 0.8) / peak : 1;
      var fade = Math.min(d.length, Math.floor(sampleRate * 0.01));
      for (i = 0; i < d.length; i++) d[i] *= k;
      for (i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
      return buf;
    };
    var p = c.startRendering();
    if (p && typeof p.then === "function") return p.then(done);
    return new Promise(function (res) { c.oncomplete = function (e) { res(done(e.renderedBuffer)); }; });
  }

  // opts.only: render just these sounds (e.g. the crate screen only needs its own few)
  function create(opts) {
    var AC = root.AudioContext || root.webkitAudioContext;
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    var names = Object.keys(R);
    if (opts && opts.only) names = names.filter(function (n) { return opts.only.indexOf(n) >= 0; });
    var noop = { resume: function () {}, play: function () { return null; }, setVolume: function () {}, dispose: function () {}, ready: Promise.resolve(), names: names, buffers: {} };
    if (!AC || !OAC) return noop;
    var ctx, master, comp;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.8;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { return noop; }

    var buffers = {}, voices = {}, disposed = false, MAX_VOICES = 10;
    var jobs = [];
    names.forEach(function (name) {
      var n = R[name].variants || 1;
      buffers[name] = [];
      for (var v = 0; v < n; v++) {
        (function (v) {
          var job;
          try { job = renderRecipe(OAC, ctx.sampleRate, R[name], v); } catch (e) { job = Promise.reject(e); }
          jobs.push(job.then(function (b) { buffers[name][v] = b; }, function (e) { if (root.console) console.warn("PBAudio: failed to render " + name, e); }));
        })(v);
      }
    });
    var ready = Promise.all(jobs);

    var api = {
      ready: ready,
      names: names,
      buffers: buffers,
      resume: function () { try { if (ctx && ctx.state !== "running" && ctx.resume) ctx.resume(); } catch (e) {} },
      play: function (name, o) {
        if (disposed || !ctx) return null;
        try {
          if (ctx.state !== "running") { api.resume(); if (ctx.state !== "running") return null; }
          var list = buffers[name];
          if (!list || !list.length) return null;
          var avail = list.filter(Boolean);
          if (!avail.length) return null;
          if ((voices[name] || 0) >= MAX_VOICES) return null;
          o = o || {};
          var buf = avail[(Math.random() * avail.length) | 0];
          var src = ctx.createBufferSource(); src.buffer = buf;
          var rate = o.rate === undefined ? 1 : o.rate;
          if (!NO_PITCH_VAR[name]) rate *= 1 + (Math.random() * 2 - 1) * 0.045;
          src.playbackRate.value = Math.max(0.1, rate);
          var g = ctx.createGain(); g.gain.value = Math.max(0, o.vol === undefined ? 1 : o.vol);
          src.connect(g);
          var last = g;
          var pan = o.pan || 0;
          if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); last = p; }
          last.connect(master);
          voices[name] = (voices[name] || 0) + 1;
          src.onended = function () { voices[name]--; try { src.disconnect(); g.disconnect(); if (last !== g) last.disconnect(); } catch (e) {} };
          src.start();
          return src;
        } catch (e) { return null; }
      },
      setVolume: function (v) { try { master.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.02); } catch (e) {} },
      dispose: function () { disposed = true; try { ctx.close(); } catch (e) {} ctx = null; }
    };
    return api;
  }

  root.PBAudio = { create: create };
})(typeof window !== "undefined" ? window : this);
