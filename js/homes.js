/*
 * homes.js
 * Each Mii's home: the furniture shop, the food you can give them,
 * and what each Mii likes or doesn't like (based on its personality).
 *
 * This file is only data and small helpers (no 3D). The 3D rooms are
 * built in homes3d.js, and the Mii's coins are earned in hub3d.js.
 *
 * Furniture items:
 *   { id, slot, name, icon, price, tags, use }
 *   slot   where it goes in the room (one item per slot)
 *   tags   what kind of thing it is: cozy, sporty, fancy, silly, techy, nature, cute
 *   use    what the Mii does with it at home:
 *          { activity, emoji, lines, arms, sit, lie, lookUp }
 */
(function (root) {
  "use strict";

  const SLOTS = [
    { id: "bed", name: "Bed", icon: "🛏️" },
    { id: "sofa", name: "Seat", icon: "🛋️" },
    { id: "table", name: "Table", icon: "🍽️" },
    { id: "tv", name: "Fun", icon: "📺" },
    { id: "rug", name: "Rug", icon: "🟫" },
    { id: "lamp", name: "Lamp", icon: "💡" },
    { id: "plant", name: "Plant", icon: "🪴" },
    { id: "art", name: "Wall art", icon: "🖼️" },
    { id: "special", name: "Special", icon: "✨" },
    { id: "wallpaper", name: "Wallpaper", icon: "🧱" },
    { id: "floor", name: "Floor", icon: "🟧" },
  ];

  const ITEMS = [
    // beds
    { id: "bed-basic", slot: "bed", name: "Simple bed", icon: "🛏️", price: 0, tags: [], starter: true,
      use: { activity: "napping", emoji: "💤", lie: true, lines: ["Zzz...", "*snore*", "Five more minutes..."] } },
    { id: "bed-canopy", slot: "bed", name: "Princess canopy bed", icon: "👑", price: 45, tags: ["fancy", "cute"],
      use: { activity: "napping like royalty", emoji: "💤", lie: true, lines: ["I feel like a princess!", "Zzz... so fancy...", "*royal snore*"] } },
    { id: "bed-race", slot: "bed", name: "Race car bed", icon: "🏎️", price: 40, tags: ["sporty", "silly"],
      use: { activity: "napping in the race car bed", emoji: "🏁", lie: true, lines: ["Vroom... zzz...", "Dreaming of the finish line!", "Zzz... pit stop..."] } },
    { id: "bed-hammock", slot: "bed", name: "Hammock", icon: "🌴", price: 30, tags: ["nature", "cozy"],
      use: { activity: "swinging in the hammock", emoji: "🌴", lie: true, lines: ["Swing... swing...", "Just like a beach holiday.", "Ahh, so relaxing."] } },

    // seats
    { id: "sofa-basic", slot: "sofa", name: "Little armchair", icon: "🪑", price: 0, tags: [], starter: true,
      use: { activity: "relaxing in the armchair", emoji: "🪑", sit: true, lines: ["Ahh, comfy.", "Nice to sit down.", "Hmm hmm hmm~"] } },
    { id: "sofa-comfy", slot: "sofa", name: "Big comfy sofa", icon: "🛋️", price: 35, tags: ["cozy"],
      use: { activity: "sinking into the sofa", emoji: "🛋️", sit: true, lines: ["I'm never getting up.", "So squishy!", "This is the life."] } },
    { id: "sofa-beanbag", slot: "sofa", name: "Bean bag", icon: "🫘", price: 20, tags: ["silly", "cozy"],
      use: { activity: "flopping on the bean bag", emoji: "🫘", sit: true, lines: ["*flop*", "It's eating me!", "Wheee, squish!"] } },
    { id: "sofa-throne", slot: "sofa", name: "Golden throne", icon: "🏆", price: 60, tags: ["fancy", "silly"],
      use: { activity: "ruling from the throne", emoji: "👑", sit: true, lines: ["Bring me snacks!", "I am the ruler of this room.", "Bow before me! ...Please?"] } },

    // tables
    { id: "table-basic", slot: "table", name: "Small table", icon: "🍽️", price: 0, tags: [], starter: true,
      use: { activity: "sitting at the table", emoji: "🍽️", lines: ["What's for dinner?", "*taps table*", "I'm a bit peckish."] } },
    { id: "table-picnic", slot: "table", name: "Picnic table", icon: "🧺", price: 25, tags: ["nature", "cute"],
      use: { activity: "having an indoor picnic", emoji: "🧺", lines: ["Picnic inside!", "No ants in here!", "Sandwich time!"] } },
    { id: "table-desk", slot: "table", name: "Computer desk", icon: "🖥️", price: 40, tags: ["techy"],
      use: { activity: "using the computer", emoji: "🖥️", arms: "type", lines: ["*click clack*", "Just one more video...", "Who wrote this code?!"] } },
    { id: "table-tea", slot: "table", name: "Fancy tea table", icon: "🫖", price: 45, tags: ["fancy", "cozy"],
      use: { activity: "having tea", emoji: "🫖", lines: ["Tea, darling?", "Pinkies up!", "Mmm, Earl Grey."] } },

    // fun
    { id: "tv-none", slot: "tv", name: "Radio", icon: "📻", price: 0, tags: [], starter: true,
      use: { activity: "listening to the radio", emoji: "🎶", lines: ["♪ La la la ♪", "I love this song!", "*hums along*"] } },
    { id: "tv-retro", slot: "tv", name: "Retro TV", icon: "📺", price: 30, tags: ["cozy"],
      use: { activity: "watching TV", emoji: "📺", lines: ["Ooh, a cooking show!", "Don't go in there!", "Commercials again?"] } },
    { id: "tv-console", slot: "tv", name: "Game console", icon: "🎮", price: 50, tags: ["techy", "silly"],
      use: { activity: "playing video games", emoji: "🎮", arms: "type", lines: ["One more level!", "Boss fight!", "NOOO, I was so close!"] } },
    { id: "tv-treadmill", slot: "tv", name: "Treadmill", icon: "🏃", price: 45, tags: ["sporty"],
      use: { activity: "running on the treadmill", emoji: "🏃", run: true, lines: ["Feel the burn!", "*huff puff*", "Ten more minutes!"] } },
    { id: "tv-piano", slot: "tv", name: "Piano", icon: "🎹", price: 55, tags: ["fancy"],
      use: { activity: "playing the piano", emoji: "🎹", arms: "type", lines: ["♪ Plink plonk ♪", "Chopsticks, anyone?", "I've been practising!"] } },

    // rugs
    { id: "rug-none", slot: "rug", name: "No rug", icon: "⬜", price: 0, tags: [], starter: true },
    { id: "rug-round", slot: "rug", name: "Round rug", icon: "🟠", price: 12, tags: ["cozy"] },
    { id: "rug-stripes", slot: "rug", name: "Rainbow rug", icon: "🌈", price: 18, tags: ["silly", "cute"] },
    { id: "rug-fancy", slot: "rug", name: "Royal carpet", icon: "🟥", price: 25, tags: ["fancy"] },

    // lamps
    { id: "lamp-basic", slot: "lamp", name: "Floor lamp", icon: "💡", price: 0, tags: [], starter: true },
    { id: "lamp-lava", slot: "lamp", name: "Lava lamp", icon: "🫧", price: 20, tags: ["silly", "techy"],
      use: { activity: "staring at the lava lamp", emoji: "🫧", lines: ["So groovy...", "Blob... blob...", "Hypnotising!"] } },
    { id: "lamp-chandelier", slot: "lamp", name: "Chandelier", icon: "🕯️", price: 40, tags: ["fancy"],
      use: { activity: "admiring the chandelier", emoji: "✨", lookUp: 0.5, lines: ["So sparkly!", "Very elegant.", "Don't fall on me!"] } },

    // plants
    { id: "plant-none", slot: "plant", name: "No plant", icon: "⬜", price: 0, tags: [], starter: true },
    { id: "plant-pot", slot: "plant", name: "Potted plant", icon: "🪴", price: 10, tags: ["nature"],
      use: { activity: "watering the plant", emoji: "🪴", lines: ["Grow, little buddy!", "There you go.", "Who's a good plant?"] } },
    { id: "plant-cactus", slot: "plant", name: "Cactus", icon: "🌵", price: 12, tags: ["nature", "silly"],
      use: { activity: "talking to the cactus", emoji: "🌵", lines: ["Don't be so prickly!", "Ouch!", "You and me, buddy."] } },
    { id: "plant-tree", slot: "plant", name: "Little indoor tree", icon: "🌳", price: 28, tags: ["nature", "cozy"],
      use: { activity: "relaxing under the tree", emoji: "🌳", lines: ["A tree in my house!", "So fresh!", "Smells like the park."] } },

    // wall art
    { id: "art-none", slot: "art", name: "Bare wall", icon: "⬜", price: 0, tags: [], starter: true },
    { id: "art-sunset", slot: "art", name: "Sunset painting", icon: "🌅", price: 15, tags: ["nature", "cozy"],
      use: { activity: "admiring the painting", emoji: "🖼️", lines: ["So peaceful.", "I want to go there!", "What a sunset."] } },
    { id: "art-poster", slot: "art", name: "Sports poster", icon: "⚽", price: 15, tags: ["sporty"],
      use: { activity: "looking at the poster", emoji: "⚽", lines: ["My hero!", "GOOOAL!", "One day that'll be me."] } },
    { id: "art-portrait", slot: "art", name: "Self-portrait", icon: "🖼️", price: 30, tags: ["fancy", "silly"],
      use: { activity: "admiring their own portrait", emoji: "😎", lines: ["Looking good!", "What a handsome face.", "The artist got my best side."] } },

    // special
    { id: "special-none", slot: "special", name: "Nothing", icon: "⬜", price: 0, tags: [], starter: true },
    { id: "special-fishtank", slot: "special", name: "Fish tank", icon: "🐠", price: 35, tags: ["nature", "cute"],
      use: { activity: "watching the fish", emoji: "🐠", lines: ["Blub blub!", "That one's called Bubbles.", "Feeding time!"] } },
    { id: "special-drums", slot: "special", name: "Drum kit", icon: "🥁", price: 45, tags: ["sporty", "silly"],
      use: { activity: "playing the drums", emoji: "🥁", arms: "drum", lines: ["Ba-dum tss!", "ROCK ON!", "*CRASH*"] } },
    { id: "special-telescope", slot: "special", name: "Telescope", icon: "🔭", price: 40, tags: ["techy"],
      use: { activity: "looking through the telescope", emoji: "🔭", lookUp: 0.3, lines: ["I see a star!", "Is that... the moon base?", "Space is so big."] } },
    { id: "special-plushies", slot: "special", name: "Pile of plushies", icon: "🧸", price: 25, tags: ["cute", "cozy"],
      use: { activity: "hugging the plushies", emoji: "🧸", lines: ["So fluffy!", "This one's Mr. Snuggles.", "Group hug!"] } },
    { id: "special-punchbag", slot: "special", name: "Punching bag", icon: "🥊", price: 30, tags: ["sporty"],
      use: { activity: "punching the punching bag", emoji: "🥊", arms: "punch", lines: ["Hyah!", "Take that!", "Float like a butterfly!"] } },

    // wallpaper and floor (colours used by homes3d.js)
    { id: "wall-cream", slot: "wallpaper", name: "Cream", icon: "🟨", price: 0, tags: [], starter: true, color: "#f6ead2", accent: "#e8d6b2" },
    { id: "wall-mint", slot: "wallpaper", name: "Mint stripes", icon: "🟩", price: 10, tags: ["cute", "nature"], color: "#cdeedd", accent: "#ade0c6", pattern: "stripes" },
    { id: "wall-pink", slot: "wallpaper", name: "Pink hearts", icon: "🩷", price: 12, tags: ["cute"], color: "#ffd9e6", accent: "#ffb3cb", pattern: "hearts" },
    { id: "wall-blue", slot: "wallpaper", name: "Sky blue", icon: "🟦", price: 10, tags: ["cozy"], color: "#cfe6ff", accent: "#a9cff7", pattern: "clouds" },
    { id: "wall-dark", slot: "wallpaper", name: "Gamer neon", icon: "🟪", price: 15, tags: ["techy"], color: "#2d2a4a", accent: "#ff4fd8", pattern: "grid" },
    { id: "wall-gold", slot: "wallpaper", name: "Royal damask", icon: "🟫", price: 18, tags: ["fancy"], color: "#7a1f2b", accent: "#d9a441", pattern: "damask" },
    { id: "floor-wood", slot: "floor", name: "Wooden floor", icon: "🟫", price: 0, tags: [], starter: true, color: "#c98a52", accent: "#b57843", pattern: "planks" },
    { id: "floor-tiles", slot: "floor", name: "Checker tiles", icon: "🏁", price: 12, tags: ["silly"], color: "#ffffff", accent: "#ff6b6b", pattern: "checker" },
    { id: "floor-carpet", slot: "floor", name: "Soft carpet", icon: "🟦", price: 12, tags: ["cozy"], color: "#8fb3d9", accent: "#7ea2c8", pattern: "plain" },
    { id: "floor-marble", slot: "floor", name: "Marble", icon: "⬜", price: 20, tags: ["fancy"], color: "#eeeef2", accent: "#cfd0da", pattern: "marble" },
    { id: "floor-grass", slot: "floor", name: "Fake grass", icon: "🟩", price: 15, tags: ["nature", "sporty"], color: "#6fcf4f", accent: "#5cb840", pattern: "plain" },
  ];

  const FOODS = [
    { id: "apple", name: "Apple", icon: "🍎", price: 2, tags: ["healthy", "sweet"] },
    { id: "onigiri", name: "Rice ball", icon: "🍙", price: 3, tags: ["healthy"] },
    { id: "pizza", name: "Pizza", icon: "🍕", price: 4, tags: ["junk"] },
    { id: "burger", name: "Burger", icon: "🍔", price: 4, tags: ["junk"] },
    { id: "salad", name: "Salad", icon: "🥗", price: 3, tags: ["healthy"] },
    { id: "curry", name: "Spicy curry", icon: "🍛", price: 5, tags: ["spicy"] },
    { id: "ramen", name: "Ramen", icon: "🍜", price: 4, tags: ["spicy"] },
    { id: "sushi", name: "Sushi", icon: "🍣", price: 6, tags: ["fancy"] },
    { id: "cake", name: "Strawberry cake", icon: "🍰", price: 5, tags: ["sweet", "fancy"] },
    { id: "donut", name: "Donut", icon: "🍩", price: 3, tags: ["sweet", "junk"] },
    { id: "icecream", name: "Ice cream", icon: "🍦", price: 3, tags: ["sweet"] },
    { id: "broccoli", name: "Broccoli", icon: "🥦", price: 1, tags: ["healthy"] },
    { id: "taco", name: "Taco", icon: "🌮", price: 4, tags: ["spicy", "junk"] },
    { id: "cheese", name: "Fancy cheese", icon: "🧀", price: 5, tags: ["fancy"] },
  ];

  const byId = new Map(ITEMS.concat(FOODS).map((i) => [i.id, i]));
  const item = (id) => byId.get(id) || null;

  // The furniture every Mii starts with.
  function starterHome() {
    const home = { items: {}, owned: [] };
    for (const it of ITEMS) if (it.starter) { home.items[it.slot] = it.id; home.owned.push(it.id); }
    return home;
  }

  // Makes sure a saved Mii has everything its home needs.
  function ensureHome(record) {
    if (!record.home || !record.home.items) record.home = starterHome();
    const start = starterHome();
    for (const slot of Object.keys(start.items)) if (!record.home.items[slot]) record.home.items[slot] = start.items[slot];
    record.home.owned = Array.from(new Set((record.home.owned || []).concat(Object.values(start.items))));
    if (typeof record.coins !== "number") record.coins = 10; // a little pocket money to start
    if (typeof record.mood !== "number") record.mood = 60;
    if (!record.tastes) record.tastes = randomTastes(record);
    return record;
  }

  // A number that's always the same for the same text (so tastes don't change).
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Every Mii has a favourite food and one it can't stand.
  function randomTastes(record) {
    const h = hash(String(record.id || record.name || "mii"));
    const fav = FOODS[h % FOODS.length].id;
    let hate = FOODS[(h >>> 8) % FOODS.length].id;
    if (hate === fav) hate = FOODS[(FOODS.findIndex((f) => f.id === fav) + 5) % FOODS.length].id;
    return { favorite: fav, hate };
  }

  // How much a personality likes each kind of thing (about -2 to +3).
  function tagLikes(p) {
    const hi = (v) => (v - 50) / 25; // -2 .. +2
    return {
      cozy: -hi(p.energy) * 0.8 + 0.3,
      sporty: hi(p.energy) * 1.2,
      fancy: -hi(p.humor) * 0.6 + (-hi(p.kindness)) * 0.4,
      silly: hi(p.humor) * 1.2,
      techy: -hi(p.social) * 0.7 + (-hi(p.humor)) * 0.3,
      nature: hi(p.kindness) * 0.6 - hi(p.energy) * 0.2 + 0.2,
      cute: hi(p.kindness) * 0.9 + hi(p.social) * 0.2,
      // food
      sweet: hi(p.kindness) * 0.5 + 0.4,
      spicy: hi(p.energy) * 0.8,
      healthy: -hi(p.humor) * 0.5 + hi(p.energy) * 0.2,
      junk: hi(p.humor) * 0.6 + 0.2,
    };
  }

  // How much a Mii likes a thing: "love", "like", "okay" or "dislike".
  function opinion(personality, record, thing) {
    if (record && record.tastes) {
      if (thing.id === record.tastes.favorite) return "love";
      if (thing.id === record.tastes.hate) return "dislike";
    }
    const likes = tagLikes(personality);
    const tags = thing.tags || [];
    if (!tags.length) return "okay";
    const score = tags.reduce((t, k) => t + (likes[k] || 0), 0) / Math.sqrt(tags.length);
    if (score >= 1.3) return "love";
    if (score >= 0.4) return "like";
    if (score > -0.6) return "okay";
    return "dislike";
  }

  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // What a Mii says when you give it furniture or food.
  function reaction(kind, op, thing, p) {
    const grumpy = p.kindness <= 35, shy = p.social <= 35, loud = p.energy >= 70;
    const n = thing.name.toLowerCase();
    if (kind === "food") {
      if (op === "love") return pick(loud ? ["THIS IS MY FAVOURITE!!!", "NO WAY! " + thing.name.toUpperCase() + "!!"] : ["My favourite! How did you know?!", "Mmm! " + thing.name + "! I love it!"]);
      if (op === "like") return pick(["Yum! Thank you!", "Mmm, tasty!", grumpy ? "Not bad. ...Thanks." : "This hits the spot!"]);
      if (op === "okay") return pick(["Thanks, I guess I'll eat it.", "It's food!", "Okay... *munch*"]);
      return pick(grumpy ? ["Blech! Who eats this?!", "No. Just no."] : ["Um... I don't really like " + n + "...", "Blech! ...Sorry!"]);
    }
    if (op === "love") return pick(loud ? ["WOW! A " + n + "! BEST DAY EVER!", "IT'S PERFECT!!"] : shy ? ["F-for me? I love it...", "Oh! It's perfect... thank you."] : ["I love it! Thank you so much!", "A " + n + "! It's perfect!"]);
    if (op === "like") return pick(grumpy ? ["Hmph. It's... nice.", "I'll allow it."] : ["Ooh, nice!", "Thanks! Looks great!", "That's really cool!"]);
    if (op === "okay") return pick(["Oh, a " + n + ". Okay!", "Hmm, interesting choice.", "Thanks, I think?"]);
    return pick(grumpy ? ["Ugh. Really?", "Not my style. At all."] : ["Oh... um... it's not really me...", "Hmm... I'll get used to it?"]);
  }

  // A happier Mii does more at home. Mood goes up with gifts it likes.
  const MOOD_CHANGE = { love: 18, like: 9, okay: 2, dislike: -10 };

  function moodFace(mood) {
    return mood >= 85 ? "😍" : mood >= 65 ? "😄" : mood >= 45 ? "🙂" : mood >= 25 ? "😐" : "😟";
  }

  // What a Mii at home might say to you when you visit.
  function homeLine(record, p, latestGift) {
    const lines = [];
    const name = record.name || "";
    if (record.mood >= 70) lines.push("I love my home!", "Thanks for visiting!", "Make yourself at home!");
    if (record.mood < 40) lines.push("It's a bit boring in here...", "Got any snacks?", "I could use a new " + pick(["sofa", "rug", "plant", "poster"]) + ".");
    if (latestGift) lines.push("I really like the " + latestGift.toLowerCase() + "!", "Have you seen my " + latestGift.toLowerCase() + "?");
    if (p.social >= 65) lines.push("Want to hang out?", "Visitors! Yay!", "Did you bring friends?");
    if (p.social <= 35) lines.push("Oh! H-hi... I didn't know you were coming.", "...It's nice and quiet here.");
    if (p.humor >= 65) lines.push("Welcome to my castle!", "Wipe your feet! Just kidding.");
    if (p.kindness <= 35) lines.push("What do you want?", "Don't touch anything.");
    if (p.energy >= 65) lines.push("I can't sit still!", "Let's DO something!");
    if (!lines.length) lines.push("Hi there!", "Welcome!", "Oh, hello!");
    return pick(lines);
  }

  root.MiiHomes = {
    SLOTS, ITEMS, FOODS, item, starterHome, ensureHome, opinion, reaction, MOOD_CHANGE, moodFace, homeLine, hash,
  };
})(typeof self !== "undefined" ? self : this);
