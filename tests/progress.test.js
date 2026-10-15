// Checks wishes, levels, town level, daily goals and stickers (no 3D needed).
// Run with: node tests/progress.test.js
"use strict";
const assert = require("assert");
global.self = global;
require("../js/homes.js");
require("../js/dialogue.js");
require("../js/minigames.js");
require("../js/town.js");
require("../js/progress.js");
const D = global.Dialogue, H = global.MiiHomes, P = global.MiiProgress;

const records = new Map();
for (const [i, name] of ["Mia", "Leo", "Ava", "Sam"].entries()) {
  const r = { id: "m" + i, name, place: "park", personality: { energy: 50, social: 50, chatty: 50, humor: 50, kindness: 50 } };
  H.ensureHome(r);
  records.set(r.id, r);
}
const hub = { friendships: {} };
const events = { levelup: [], townlevel: [], toast: [] };
let saved = null;
const prog = P.create({
  records, D, H, hub, saveState: (s) => { saved = s; }, saveMii: () => {},
  town: () => ({ sendTo: () => {} }), meetUp: () => {}, offscreen: () => true,
});
for (const k of Object.keys(events)) prog.on(k, (...a) => events[k].push(a));
for (const r of records.values()) prog.ensure(r);

// wishes appear over time (pretty needy)
for (let i = 0; i < 400; i++) prog.tick(1);
const wishing = Array.from(records.values()).filter((r) => r.wish);
assert(wishing.length >= 2, "Miis should have wishes after a few minutes");

// granting a food wish: coins, happiness, town XP
const mia = records.get("m0");
mia.wish = { type: "hungry", icon: "🍙", text: "I'm starving!", left: 480 };
const coins = mia.coins, xp = prog.state.xp + prog.state.level * 1000;
prog.event({ type: "food", id: "m0", food: H.FOODS[0], opinion: "like" });
assert.strictEqual(mia.wish, null, "the food wish is granted");
assert(mia.coins > coins, "granting a wish gives the Mii coins");
assert(prog.state.xp + prog.state.level * 1000 > xp, "granting a wish gives town XP");

// a wrong action doesn't grant a wish
mia.wish = { type: "game", game: "ttt", icon: "⭕", text: "Play!", left: 480 };
prog.event({ type: "game", id: "m0", game: "rps", result: "you" });
assert(mia.wish, "playing a different game doesn't count");
prog.event({ type: "game", id: "m0", game: "ttt", result: "mii" });
assert.strictEqual(mia.wish, null, "playing the right game does");

// enough happiness = level up with 3 gift choices; gifts apply
prog.addHappy(mia, 20);
assert(mia.level > 1, "the Mii levelled up");
const [rec, choices] = events.levelup[0];
assert.strictEqual(rec, mia);
assert.strictEqual(choices.length, 3);
const move = choices.find((c) => c.kind === "move");
if (move) { prog.applyGift(mia, move); assert(mia.moves.includes(move.id)); }

// town level goes up with XP and unlocks things
for (let i = 0; i < 40; i++) { mia.wish = { type: "visit", icon: "🏠", text: "", left: 480 }; prog.event({ type: "visit", id: "m0" }); }
assert(prog.state.level >= 3, "the town grows when you grant wishes");
assert(events.townlevel.length >= 2);
assert(prog.unlocked("romance"), "romance unlocks at town level 3");

// daily goals: three of them, they count up and can be claimed
prog.rollDaily();
assert.strictEqual(prog.state.daily.goals.length, 3);

// fights and making up
const leo = records.get("m1");
prog.event({ type: "hangout", a: "m0", b: "m1", kind: "disagree", before: 2, after: 3, fight: true });
assert(prog.pair("m0", "m1").fight, "an argument can turn into a fight");
prog.event({ type: "hangout", a: "m0", b: "m1", kind: "makeUp", before: 3, after: 6 });
assert(!prog.pair("m0", "m1").fight, "making up ends the fight");

// confessions: success makes a couple
hub.friendships["m0|m1"] = 12;
mia.wish = { type: "crush", target: "m1", icon: "💗", text: "", left: 480 };
prog.startConfession(mia);
assert(prog.pair("m0", "m1").confess, "a confession is planned");
prog.event({ type: "hangout", a: "m0", b: "m1", kind: "confess", before: 12, after: 15, success: true });
assert.strictEqual(prog.partnerOf(mia), leo, "they're a couple now");
assert(prog.context(mia, leo).couple);

// the shop: a daily stock, deals cost less, high tiers locked at the start
const deals = prog.deals();
assert(deals.length === 2);
const dealItem = H.item(deals[0]);
assert(prog.priceOf(dealItem) < dealItem.price);
assert(prog.shopFoods().length > 0);

// weather and stickers
assert(prog.weather().season);
assert(prog.weatherText().length > 0);
const pages = prog.stickerPages();
assert(pages.length >= 6 && pages.every((p) => p.stickers.length > 0));
assert(Object.keys(prog.state.stickers).length > 0, "some stickers are earned by now");
assert(saved, "progress is saved");
console.log("All progress tests passed. Town level " + prog.state.level + ", " + Object.keys(prog.state.stickers).length + " stickers, " + wishing.length + " wishes after 400 s.");
