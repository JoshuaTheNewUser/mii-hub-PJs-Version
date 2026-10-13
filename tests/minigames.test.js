// Run with: node tests/minigames.test.js
// Checks the mini-game rules, and that a Mii's skill really changes how well it plays.
const assert = require("assert");
const G = require("../js/minigames.js");

// a repeatable random number generator, so test results don't change
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---- Rock Paper Scissors ----
assert.strictEqual(G.rpsResult("rock", "scissors"), 1);
assert.strictEqual(G.rpsResult("rock", "paper"), -1);
assert.strictEqual(G.rpsResult("paper", "paper"), 0);
function rpsWinRate(skill, playerPattern, rounds) {
  const rand = seeded(7);
  const history = [];
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    const mine = G.rpsMove(skill, history, "rock", rand);
    const yours = playerPattern(i, rand);
    if (G.rpsResult(mine, yours) === 1) wins++;
    history.push(yours);
  }
  return wins / rounds;
}
const habit = (i) => ["rock", "rock", "paper"][i % 3]; // a player with a habit
const lowRps = rpsWinRate(0, habit, 600), highRps = rpsWinRate(100, habit, 600);
assert.ok(highRps > lowRps + 0.25, `skilled Miis should spot your habits (low ${lowRps.toFixed(2)}, high ${highRps.toFixed(2)})`);

// ---- Tic-Tac-Toe ----
assert.deepStrictEqual(G.tttWinner(["X", "X", "X", null, "O", "O", null, null, null]).line, [0, 1, 2]);
assert.strictEqual(G.tttWinner(["X", "O", "X", "X", "O", "O", "O", "X", "X"]).winner, "draw");
function tttGame(skillO, playerX, rand) {
  const b = Array(9).fill(null);
  let turn = rand() < 0.5 ? "X" : "O";
  for (;;) {
    const i = turn === "O" ? G.tttMove(b, skillO, "O", rand) : playerX(b, rand);
    assert.ok(b[i] === null, "moves must go in empty squares");
    b[i] = turn;
    const w = G.tttWinner(b);
    if (w) return w.winner;
    turn = turn === "X" ? "O" : "X";
  }
}
const randomPlayer = (b, rand) => { const e = G.tttEmpty(b); return e[Math.floor(rand() * e.length)]; };
const decentPlayer = (b, rand) => G.tttMove(b, 60, "X", rand);
let rand = seeded(3);
for (let i = 0; i < 300; i++) assert.notStrictEqual(tttGame(100, randomPlayer, rand), "X", "a master Mii must never lose at tic-tac-toe");
for (let i = 0; i < 200; i++) assert.notStrictEqual(tttGame(100, decentPlayer, rand), "X", "a master Mii must never lose at tic-tac-toe");
const tttLosses = (skill) => { const r = seeded(11); let l = 0; for (let i = 0; i < 400; i++) if (tttGame(skill, decentPlayer, r) === "X") l++; return l; };
const lowLoss = tttLosses(0), highLoss = tttLosses(80);
assert.ok(lowLoss > highLoss * 3, `beginners should lose much more often (beginner ${lowLoss}, expert ${highLoss})`);

// ---- Connect 4 ----
const board = G.c4New();
for (const c of [0, 1, 2]) G.c4Drop(board, c, 1);
assert.strictEqual(G.c4Winner(board), null);
G.c4Drop(board, 3, 1);
assert.strictEqual(G.c4Winner(board).winner, 1);
const col = G.c4New();
for (let i = 0; i < 6; i++) G.c4Drop(col, 0, 1 + (i % 2));
assert.strictEqual(G.c4Drop(col, 0, 1), -1, "a full column takes no more pieces");
// a skilled Mii takes a win when it sees one, and blocks yours
const nearWin = G.c4New();
for (const c of [2, 3, 4]) G.c4Drop(nearWin, c, 2);
assert.ok([1, 5].includes(G.c4Move(nearWin, 60, 2, seeded(1))), "should finish four in a row");
const mustBlock = G.c4New();
for (const c of [0, 0, 0]) G.c4Drop(mustBlock, c, 1);
assert.strictEqual(G.c4Move(mustBlock, 60, 2, seeded(1)), 0, "should block your four in a row");
function c4Match(skillA, skillB, rand) {
  const b = G.c4New();
  let who = rand() < 0.5 ? 1 : 2;
  for (;;) {
    const c = G.c4Move(b, who === 1 ? skillA : skillB, who, rand);
    G.c4Drop(b, c, who);
    const w = G.c4Winner(b);
    if (w) return w.winner;
    who = who === 1 ? 2 : 1;
  }
}
rand = seeded(5);
let strongWins = 0;
const t0 = Date.now();
for (let i = 0; i < 20; i++) if (c4Match(10, 95, rand) === 2) strongWins++;
assert.ok(strongWins >= 17, `an expert should beat a beginner at Connect 4 (won ${strongWins}/20)`);
const t = (Date.now() - t0) / 20;
assert.ok(t < 2500, "games should be quick to compute");

// ---- Skill growth ----
const stats = G.newStats(seeded(2));
let prev = stats.skill;
for (let i = 0; i < 30; i++) {
  const now = G.learn(stats, "c4", i % 2 === 0);
  assert.ok(now > prev && now <= 100, "skill should go up every game and stay at most 100");
  prev = now;
}
assert.ok(prev > 90, "lots of practice should make a Mii a master");
assert.strictEqual(G.skillLevel(10), "Beginner");
assert.strictEqual(G.skillLevel(95), "Master");

console.log(`All mini-game tests passed. RPS vs a habit: beginner ${(lowRps * 100).toFixed(0)}% / master ${(highRps * 100).toFixed(0)}% wins;`,
  `tic-tac-toe losses: beginner ${lowLoss}/400, expert ${highLoss}/400; Connect 4 expert beat beginner ${strongWins}/20 (${t.toFixed(0)} ms/game)`);
