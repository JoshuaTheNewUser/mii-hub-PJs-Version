/*
 * gamesUI.js
 * The window where you play a mini-game against a Mii (rules and Mii brains
 * are in minigames.js). It shows the Mii's skill meter, the score, the board,
 * and what the Mii says while playing.
 *
 * Use: MiiGamesUI.open({ walker, game: "rps" | "ttt" | "c4", portrait, stats, hub, onSave })
 */
(function (root) {
  "use strict";

  const G = root.MiniGames;
  const D = root.Dialogue;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let current = null; // the open game, if any

  function open(opts) {
    if (current) current.close(true);
    const { walker: w, game, hub } = opts;
    const info = G.GAMES[game];
    const stats = opts.stats;
    const p = D.traits(w.record);
    const startSkill = stats.skill;
    const name = w.look.name;
    let closed = false;

    // ---------- the window ----------
    const backdrop = el("div", "game-modal");
    const card = el("div", "game-card");
    backdrop.appendChild(card);

    const head = el("div", "gm-head");
    const img = el("img");
    img.src = opts.portrait || "";
    img.alt = "";
    const titles = el("div", "gm-titles");
    titles.append(el("div", "gm-title", info.icon + " " + info.name), el("div", "gm-sub", info.format + " vs " + name));
    const closeBtn = el("button", "gm-close", "✕");
    closeBtn.title = "Quit game";
    head.append(img, titles, closeBtn);

    // skill meter
    const skillRow = el("div", "gm-skill");
    const skillLabel = el("span", "gm-skill-label");
    const meter = el("div", "skill-meter");
    const fill = el("div", "skill-fill");
    meter.appendChild(fill);
    skillRow.append(el("span", "gm-skill-name", name + "'s skill"), meter, skillLabel);
    const showSkill = () => {
      fill.style.width = stats.skill.toFixed(0) + "%";
      skillLabel.textContent = G.skillLevel(stats.skill) + " · " + Math.round(stats.skill);
    };
    showSkill();

    // score
    const score = el("div", "gm-score");
    const youScore = el("span", "gm-num", "0");
    const miiScore = el("span", "gm-num", "0");
    const youSide = el("div", "gm-side");
    youSide.append(el("span", "gm-who", "You"), youScore);
    const miiSide = el("div", "gm-side");
    miiSide.append(el("span", "gm-who", name), miiScore);
    score.append(youSide, el("span", "gm-dash", "–"), miiSide);
    if (info.target === 1) score.classList.add("single");

    const speech = el("div", "gm-speech");
    const board = el("div", "gm-board");
    const status = el("div", "gm-status");
    const footer = el("div", "gm-footer");
    card.append(head, skillRow, score, speech, status, board, footer);
    opts.stage.appendChild(backdrop);

    const say = (text) => {
      speech.textContent = "“" + text + "”";
      speech.classList.remove("pop");
      void speech.offsetWidth;
      speech.classList.add("pop");
      w.say(text, 2.2); // the Mii says it in the 3D world too
    };

    const tally = { you: 0, mii: 0 };
    const setScore = () => { youScore.textContent = tally.you; miiScore.textContent = tally.mii; };

    // the Mii stops what it's doing to play with you
    hub.startGame(w, info.icon);
    say(G.talk("start", p));

    // ---------- finishing ----------
    function finish(result) {
      if (closed) return;
      stats.played += 1;
      if (result === "mii") stats.wins += 1;
      if (result === "you") stats.losses += 1;
      opts.onSave();
      hub.endGame(w, result);
      if (opts.onFinish) opts.onFinish(result);
      say(G.talk(result === "mii" ? "winMatch" : result === "you" ? "loseMatch" : "draw", p));
      board.classList.add("done");
      const gained = stats.skill - startSkill;
      status.innerHTML = "";
      const big = el("div", "gm-result " + result, result === "you" ? "🏆 You win!" : result === "mii" ? "🎉 " + name + " wins!" : "🤝 It's a draw!");
      const grow = el("div", "gm-grow", gained >= 0.5
        ? name + " got better at " + info.short + "! +" + gained.toFixed(0) + " skill (" + G.skillLevel(stats.skill) + ")"
        : name + "'s " + info.short + " skill: " + G.skillLevel(stats.skill));
      status.append(big, grow);
      footer.innerHTML = "";
      const again = el("button", "gm-btn primary", "Play again");
      again.addEventListener("click", () => { close(true); open(opts); });
      const done = el("button", "gm-btn", "Back to the hub");
      done.addEventListener("click", () => close());
      footer.append(again, done);
    }

    function close(silent) {
      if (closed) return;
      closed = true;
      backdrop.remove();
      if (current && current.close === close) current = null;
      if (!silent) hub.endGame(w, null);
    }
    closeBtn.addEventListener("click", () => close());
    backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) close(); });
    current = { close };

    // after each single game/round the Mii learns a little
    function learned(miiLost) {
      G.learn(stats, game, miiLost);
      showSkill();
      opts.onSave();
    }

    // ================= Rock Paper Scissors =================
    if (game === "rps") {
      const history = [];
      const favorite = G.RPS[Math.abs(hashName(name)) % 3];
      const hands = el("div", "rps-hands");
      const youHand = el("div", "rps-hand", "✊");
      const miiHand = el("div", "rps-hand mii", "✊");
      hands.append(youHand, el("div", "rps-vs", "vs"), miiHand);
      const buttons = el("div", "rps-buttons");
      board.append(hands, buttons);
      status.textContent = "First to 3 wins. Pick your move!";
      let busy = false;
      for (const m of G.RPS) {
        const b = el("button", "rps-btn");
        b.innerHTML = "<span>" + G.RPS_ICON[m] + "</span>" + m[0].toUpperCase() + m.slice(1);
        b.addEventListener("click", async () => {
          if (busy || closed) return;
          busy = true;
          buttons.classList.add("busy");
          const mine = G.rpsMove(stats.skill, history, favorite);
          // "Rock... paper... scissors... shoot!"
          youHand.textContent = miiHand.textContent = "✊";
          hands.classList.add("shake");
          for (const word of ["Rock…", "Paper…", "Scissors…", "Shoot!"]) { status.textContent = word; await wait(260); }
          hands.classList.remove("shake");
          youHand.textContent = G.RPS_ICON[m];
          miiHand.textContent = G.RPS_ICON[mine];
          history.push(m);
          const r = G.rpsResult(m, mine);
          if (r === 1) { tally.you++; status.textContent = cap(m) + " beats " + mine + ". You get a point!"; say(G.talk("loseRound", p)); }
          else if (r === -1) { tally.mii++; status.textContent = cap(mine) + " beats " + m + ". " + name + " gets a point!"; say(G.talk("winRound", p)); }
          else { status.textContent = "Both picked " + m + ". Tie!"; say(G.talk("tie", p)); }
          setScore();
          learned(r === 1);
          if (tally.you >= 3 || tally.mii >= 3) { await wait(900); finish(tally.you >= 3 ? "you" : "mii"); return; }
          busy = false;
          buttons.classList.remove("busy");
        });
        buttons.appendChild(b);
      }
    }

    // ================= Tic-Tac-Toe =================
    if (game === "ttt") {
      const grid = el("div", "ttt-grid");
      board.appendChild(grid);
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const c = el("button", "ttt-cell");
        c.setAttribute("aria-label", "Square " + (i + 1));
        grid.appendChild(c);
        cells.push(c);
      }
      let b, myTurn, gameNo = 0, busy = false;
      const draw = () => cells.forEach((c, i) => { c.textContent = b[i] === "X" ? "✕" : b[i] === "O" ? "◯" : ""; c.classList.toggle("o", b[i] === "O"); });

      async function newGame() {
        gameNo++;
        b = Array(9).fill(null);
        cells.forEach((c) => c.classList.remove("win"));
        draw();
        myTurn = gameNo % 2 === 1; // you go first in games 1, 3, 5...
        status.textContent = "Game " + gameNo + " · first to 2 wins. " + (myTurn ? "You're ✕, you go first!" : name + " goes first.");
        if (!myTurn) await miiTurn();
      }

      async function miiTurn() {
        busy = true;
        status.textContent = name + " is thinking…";
        if (Math.random() < 0.35) say(G.talk("think", p));
        await wait(500 + Math.random() * 600);
        if (closed) return;
        b[G.tttMove(b, stats.skill, "O")] = "O";
        draw();
        busy = false;
        if (!(await checkEnd())) { myTurn = true; status.textContent = "Your turn!"; }
      }

      async function checkEnd() {
        const r = G.tttWinner(b);
        if (!r) return false;
        busy = true;
        if (r.line) r.line.forEach((i) => cells[i].classList.add("win"));
        if (r.winner === "X") { tally.you++; status.textContent = "You win game " + gameNo + "!"; say(G.talk("loseRound", p)); }
        else if (r.winner === "O") { tally.mii++; status.textContent = name + " wins game " + gameNo + "!"; say(G.talk("winRound", p)); }
        else { status.textContent = "Game " + gameNo + " is a draw!"; say(G.talk("tie", p)); }
        setScore();
        learned(r.winner === "X");
        await wait(1500);
        if (closed) return true;
        if (tally.you >= 2 || tally.mii >= 2) finish(tally.you >= 2 ? "you" : "mii");
        else if (gameNo >= 5) finish(tally.you > tally.mii ? "you" : tally.mii > tally.you ? "mii" : "draw");
        else { busy = false; newGame(); }
        return true;
      }

      cells.forEach((c, i) => c.addEventListener("click", async () => {
        if (busy || closed || !myTurn || b[i]) return;
        b[i] = "X";
        myTurn = false;
        draw();
        if (!(await checkEnd())) await miiTurn();
      }));
      newGame();
    }

    // ================= Connect 4 =================
    if (game === "c4") {
      const grid = el("div", "c4-grid");
      board.appendChild(grid);
      const slots = [];
      for (let r = 0; r < G.ROWS; r++) {
        slots.push([]);
        for (let c = 0; c < G.COLS; c++) {
          const s = el("div", "c4-slot");
          s.dataset.col = c;
          grid.appendChild(s);
          slots[r].push(s);
        }
      }
      const b = G.c4New();
      let busy = false, done = false;
      status.textContent = "One game, winner takes all! You're 🔴, " + name + " is 🟡. Pick a column.";

      const place = async (col, who) => {
        const row = G.c4Drop(b, col, who);
        const disc = el("div", "c4-disc " + (who === 1 ? "you" : "mii"));
        disc.style.setProperty("--fall", (row + 1) * 100 + "%");
        slots[row][col].appendChild(disc);
        await wait(320);
        return row;
      };
      const checkEnd = () => {
        const r = G.c4Winner(b);
        if (!r) return false;
        done = true;
        if (r.cells) r.cells.forEach(([rr, cc]) => slots[rr][cc].classList.add("win"));
        learned(r.winner === 1);
        setTimeout(() => finish(r.winner === 1 ? "you" : r.winner === 2 ? "mii" : "draw"), 1200);
        status.textContent = r.winner === 1 ? "Four in a row!" : r.winner === 2 ? name + " got four in a row!" : "The board is full!";
        return true;
      };
      grid.addEventListener("click", async (e) => {
        const slot = e.target.closest(".c4-slot");
        if (!slot || busy || done || closed) return;
        const col = Number(slot.dataset.col);
        if (b[0][col]) { status.textContent = "That column is full!"; return; }
        busy = true;
        grid.classList.remove("hover-" + col);
        await place(col, 1);
        if (checkEnd()) return;
        status.textContent = name + " is thinking…";
        if (Math.random() < 0.3) say(G.talk("think", p));
        await wait(450 + Math.random() * 500);
        if (closed) return;
        const mine = G.c4Move(b, stats.skill, 2);
        await place(mine, 2);
        if (checkEnd()) return;
        status.textContent = "Your turn!";
        busy = false;
      });
      // highlight the column under the pointer
      grid.addEventListener("pointermove", (e) => {
        const slot = e.target.closest(".c4-slot");
        for (let c = 0; c < G.COLS; c++) grid.classList.toggle("hover-" + c, !!slot && Number(slot.dataset.col) === c && !busy && !done);
      });
      grid.addEventListener("pointerleave", () => { for (let c = 0; c < G.COLS; c++) grid.classList.remove("hover-" + c); });
    }

    return { close };
  }

  function cap(s) { return s[0].toUpperCase() + s.slice(1); }
  function hashName(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }

  root.MiiGamesUI = { open, isOpen: () => !!current };
})(typeof self !== "undefined" ? self : this);
