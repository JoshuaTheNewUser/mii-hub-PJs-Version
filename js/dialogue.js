/*
 * dialogue.js
 * Everything the Miis say and the little "scripts" they act out together.
 *
 * A script is a list of steps. Each step says who does something:
 *   { who: "A" | "B" | "both", say: "text", emote: "😀", expr: "laugh",
 *     arms: "wave", hop: true, dur: seconds }
 * In the text, {A} and {B} are replaced with the Miis' names.
 */
(function (root) {
  "use strict";

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------- Friendship levels ----------
  const LEVELS = [
    { min: 0, name: "Strangers", emoji: "👋" },
    { min: 1, name: "Acquaintances", emoji: "🙂" },
    { min: 4, name: "Friends", emoji: "😊" },
    { min: 9, name: "Good Friends", emoji: "😄" },
    { min: 16, name: "Best Friends", emoji: "💖" },
  ];

  function levelFor(points) {
    let level = LEVELS[0];
    for (const l of LEVELS) if (points >= l.min) level = l;
    return level;
  }

  // ---------- Personality ----------
  // Each trait goes from 0 to 100 (50 = in the middle).
  const TRAITS = [
    { key: "energy", low: "Calm", high: "Energetic" },
    { key: "social", low: "Shy", high: "Outgoing" },
    { key: "chatty", low: "Quiet", high: "Chatty" },
    { key: "humor", low: "Serious", high: "Silly" },
    { key: "kindness", low: "Grumpy", high: "Sweet" },
  ];
  const DEFAULT_PERSONALITY = { energy: 50, social: 50, chatty: 50, humor: 50, kindness: 50, catchphrase: "" };

  function traits(m) {
    return Object.assign({}, DEFAULT_PERSONALITY, (m && m.personality) || {});
  }

  function randomPersonality() {
    const r = () => Math.round(20 + Math.random() * 60);
    return { energy: r(), social: r(), chatty: r(), humor: r(), kindness: r(), catchphrase: "" };
  }

  // A short Tomodachi-style description, like "Lively Joker" or "Quiet Sweetheart".
  function personalityLabel(p) {
    p = Object.assign({}, DEFAULT_PERSONALITY, p || {});
    let adj = "Easygoing";
    if (p.energy >= 60 && p.social >= 60) adj = "Lively";
    else if (p.energy >= 60) adj = "Adventurous";
    else if (p.social >= 60) adj = "Friendly";
    else if (p.energy <= 40 && p.social <= 40) adj = "Quiet";
    else if (p.energy <= 40) adj = "Laid-back";
    else if (p.social <= 40) adj = "Independent";
    let noun = "Buddy";
    if (p.humor >= 62 && p.humor >= p.kindness) noun = "Joker";
    else if (p.kindness >= 62) noun = "Sweetheart";
    else if (p.kindness <= 38) noun = "Grump";
    else if (p.humor <= 38) noun = "Thinker";
    return adj + " " + noun;
  }

  // Picks one option, where options with a bigger weight are picked more often.
  function weighted(options) {
    const total = options.reduce((t, o) => t + Math.max(0, o[1]), 0);
    let r = Math.random() * total;
    for (const [value, w] of options) { r -= Math.max(0, w); if (r <= 0) return value; }
    return options[options.length - 1][0];
  }

  // ---------- Things to say when two Miis first meet ----------
  function greeting(A, B, points) {
    const a = traits(A), b = traits(B);
    if (points === 0) {
      const sayA = a.social <= 35 ? pick(["Um... h-hi. I'm {A}.", "Oh! Um, hello... I'm {A}."])
        : a.energy >= 70 ? pick(["HEY THERE!! I'm {A}!!", "Hiii! I'm {A}! Nice to meet you!"])
        : pick(["Hi! I'm {A}!", "Hello there! I'm {A}.", "Oh, a new face! I'm {A}!"]);
      const sayB = b.social <= 35 ? pick(["...H-hi. I'm {B}.", "Oh... um, I'm {B}."])
        : b.kindness <= 35 ? pick(["Yeah, hi. I'm {B}.", "{B}. Nice to meet you, I guess."])
        : pick(["Nice to meet you! I'm {B}.", "Hi {A}! I'm {B}!", "Hey! Call me {B}."]);
      return [
        { who: "A", say: sayA, arms: a.social <= 35 ? undefined : "wave", dur: 2.2 },
        { who: "B", say: sayB, arms: b.social <= 35 ? undefined : "wave", dur: 2.2 },
      ];
    }
    if (points >= 16) {
      return [
        { who: "A", say: pick(["{B}!!! My best friend!", "BFF time!", "There you are, {B}!"]), arms: "cheer", hop: true, dur: 2 },
        { who: "B", say: pick(["{A}! I missed you!", "Yay, it's {A}!", "Best friends forever!"]), arms: "cheer", hop: true, emote: "💖", dur: 2 },
      ];
    }
    return [
      { who: "A", say: pick(["Hey {B}!", "Oh hi, {B}!", "What's up, {B}?", "Yo {B}!"]), arms: "wave", dur: 1.8 },
      { who: "B", say: pick(["Hi {A}!", "Oh hey!", "Not much, you?", "Hiya!"]), dur: 1.6 },
    ];
  }

  // ---------- The different things two Miis can do together ----------
  const interactions = {
    chat(A, B, scene) {
      const topics = {
        park: [
          ["Nice weather, huh?", "Yeah! Perfect day."],
          ["Want to feed the ducks later?", "Only if we bring bread!"],
          ["The flowers smell so good today.", "Achoo! ...I'm allergic."],
          ["Race you to the fountain!", "You're on!"],
        ],
        office: [
          ["Did you finish the report?", "...What report?!"],
          ["The coffee machine is broken again.", "Oh no! This is a disaster!"],
          ["Want to grab lunch?", "Pizza? Pizza."],
        ],
        space: [
          ["Do you think aliens are friendly?", "I hope so. I brought snacks."],
          ["How do you eat soup up here?", "Very... carefully."],
          ["Did you pack extra oxygen?", "I packed extra cookies."],
        ],
      };
      const generic = [
        ["What's your favorite food?", "Anything with cheese!"],
        ["I had the weirdest dream last night.", "Was I in it?"],
        ["Have you seen any good movies?", "I only watch cartoons."],
        ["Do you like video games?", "I'm the champion of my couch!"],
      ];
      const [q, a] = pick((topics[scene.id] || []).concat(generic));
      return [
        { who: "A", say: q, dur: 2.6 },
        { who: "B", say: a, dur: 2.6 },
        { who: "A", say: pick(["Haha, true!", "Same here!", "Ha! Classic {B}.", "Cool!"]), expr: "laugh", dur: 1.6 },
      ];
    },

    compliment(A, B, scene, points) {
      // Only say things that are really true about B. These come from the
      // Mii's file (its height, its hair colour, what it's wearing) or from
      // its personality. If we're not sure about something, we don't say it.
      const f = B.facts || {};
      const b = traits(B);
      const options = [];
      const garment = f.garment || "top";
      if (f.top) options.push("I love your " + f.top + " " + garment + "!", "That " + f.top + " " + garment + " really suits you!");
      else if (f.garment) options.push("Cool " + f.garment + ", {B}!", "Where did you get that " + f.garment + "?");
      if (f.hair) options.push("Your " + f.hair + " hair looks great today!");
      if (f.tall) options.push("You're so tall, {B}!");
      if (f.short) options.push("You're so cute and small, {B}!");
      if (points >= 4) {
        options.push("You're so fun to hang out with, {B}!");
        if (b.humor >= 60) options.push("You always make me laugh, {B}!");
        if (b.kindness >= 60) options.push("You're the nicest, {B}!");
        if (b.energy >= 65) options.push("How do you have so much energy?!");
        if (b.energy <= 35) options.push("You're so calm. It's nice being around you.");
        if (b.social <= 35) options.push("I'm glad you talk to me, {B}.");
      }
      if (!options.length) options.push("I like your style, {B}!", "You seem really nice, {B}!");
      const reply = b.kindness <= 35 ? pick(["Hmph. ...Thanks.", "I know.", "...You really think so?"])
        : b.social <= 35 ? pick(["*blushes* Th-thanks...", "Oh! Um... thank you!"])
        : pick(["Aww, thanks {A}!", "You're too kind!", "*blushes*"]);
      return [
        { who: "A", say: pick(options), dur: 2.4 },
        { who: "B", say: reply, expr: "love", emote: "😊", dur: 2.2 },
      ];
    },

    joke(A, B) {
      const jokes = [
        ["Why did the Mii cross the road?", "To get to the other plaza!"],
        ["What do you call a sleeping dinosaur?", "A dino-snore!"],
        ["Why are ghosts bad liars?", "You can see right through them!"],
        ["What do you call cheese that isn't yours?", "Nacho cheese!"],
        ["Why did the cookie go to the doctor?", "It felt crummy!"],
      ];
      const [setup, punch] = pick(jokes);
      return [
        { who: "A", say: "Want to hear a joke?", dur: 1.8 },
        { who: "B", say: "Sure!", dur: 1.2 },
        { who: "A", say: setup, dur: 2.6 },
        { who: "B", say: "Hmm... I don't know?", expr: "surprised", dur: 1.8 },
        { who: "A", say: punch, expr: "laugh", dur: 2.4 },
        { who: "B", say: pick(["HAHAHA!", "LOL!", "Oh no... that's so bad! Haha!"]), expr: "laugh", emote: "😂", hop: true, dur: 2 },
      ];
    },

    dance() {
      return [
        { who: "A", say: "Dance party!", arms: "cheer", dur: 1.4 },
        { who: "both", emote: "🎵", arms: "out", hop: true, dance: true, dur: 3.6 },
        { who: "B", say: pick(["Nice moves!", "Woo!", "That was fun!"]), expr: "laugh", dur: 1.6 },
      ];
    },

    highFive() {
      return [
        { who: "A", say: pick(["Up top!", "High five!", "Gimme five!"]), arms: "up", dur: 1.3 },
        { who: "both", arms: "up", emote: "✋", hop: true, sound: "clap", dur: 1.2 },
        { who: "B", say: pick(["Yeah!", "Nice!", "Boom!"]), expr: "laugh", dur: 1.3 },
      ];
    },

    rockPaperScissors() {
      const hands = ["✊", "✋", "✌️"];
      const names = ["Rock!", "Paper!", "Scissors!"];
      const a = Math.floor(Math.random() * 3);
      const b = Math.floor(Math.random() * 3);
      const steps = [
        { who: "A", say: "Rock, paper, scissors?", dur: 1.8 },
        { who: "B", say: "You're on!", dur: 1.2 },
        { who: "both", say: "Rock... paper... scissors...", arms: "up", dur: 1.8 },
        { who: "A", say: names[a], emote: hands[a], dur: 0.01 },
        { who: "B", say: names[b], emote: hands[b], dur: 1.8 },
      ];
      if (a === b) {
        steps.push({ who: "both", say: "A tie!", expr: "surprised", dur: 1.8 });
      } else {
        const aWins = (a - b + 3) % 3 === 1;
        const winner = aWins ? "A" : "B";
        const loser = aWins ? "B" : "A";
        steps.push({ who: winner, say: pick(["I win!", "Yes!!", "Victory!"]), arms: "cheer", hop: true, expr: "laugh", dur: 1.8 });
        steps.push({ who: loser, say: pick(["Aww, rematch!", "No fair!", "Next time!"]), expr: "sad", dur: 1.8 });
      }
      return steps;
    },

    disagree() {
      const topics = [
        ["Cats are the best pets.", "No way, dogs are!"],
        ["Pineapple belongs on pizza.", "Absolutely not!"],
        ["Summer is the best season.", "Winter is better!"],
      ];
      const [x, y] = pick(topics);
      return [
        { who: "A", say: x, dur: 2.2 },
        { who: "B", say: y, expr: "angry", emote: "💢", dur: 2.2 },
        { who: "A", say: "Hmph!", expr: "angry", dur: 1.4 },
        { who: "B", say: "...Want to be friends anyway?", dur: 2.2 },
        { who: "A", say: "Of course!", expr: "laugh", emote: "🤝", dur: 1.8 },
      ];
    },

    sleepy() {
      return [
        { who: "A", say: "*yawwwn*", sleep: true, emote: "💤", dur: 2 },
        { who: "B", say: "Wake up, {A}!", arms: "wave", expr: "surprised", dur: 1.8 },
        { who: "A", say: "I'm awake! I'm awake!", expr: "surprised", hop: true, dur: 1.8 },
      ];
    },

    spaceBounce() {
      return [
        { who: "A", say: "Moon jump contest!", arms: "cheer", dur: 1.6 },
        { who: "A", moonJump: true, emote: "⬆️", dur: 2.4 },
        { who: "B", moonJump: true, emote: "⬆️", dur: 2.4 },
        { who: "both", say: "Wheee!", expr: "laugh", dur: 1.6 },
      ];
    },
  };

  // Greetings when two Miis talk from far away (see buildInteraction).
  function remoteGreeting(A, B, points, mode) {
    if (mode === "phone") {
      return [
        { who: "A", say: pick(["*dials*", "*ring ring*"]), dur: 1.4 },
        { who: "B", say: points === 0 ? "Hello? Who is this?" : pick(["Hello?", "Oh hey, {A}!", "{A}! What's up?"]), dur: 1.8 },
        { who: "A", say: points === 0 ? "Hi! It's {A}! I can see you from over here!" : pick(["Hey {B}! It's me!", "Hiya! Got a minute?"]), dur: 2.2 },
      ];
    }
    return [
      { who: "A", say: points === 0 ? "Hey, you over there! I'm {A}!" : pick(["Hey {B}!", "Yoo-hoo, {B}!", "Over here, {B}!"]), arms: "wave", dur: 1.8 },
      { who: "B", say: points === 0 ? "Oh! Hi! I'm {B}!" : pick(["Oh, hi {A}!", "What?", "Hey!"]), arms: "wave", dur: 1.6 },
    ];
  }

  // Chooses what two Miis will do. Their personalities change the odds:
  // silly Miis tell more jokes, energetic ones dance, grumpy ones argue...
  // opts.remote = "shout" or "phone" when they're far apart (then only talking things).
  function buildInteraction(A, B, scene, points, opts) {
    const a = traits(A), b = traits(B);
    const avg = (k) => (a[k] + b[k]) / 2;
    const remote = opts && opts.remote;
    let type;
    if (remote) {
      type = points === 0 ? "chat" : weighted([
        ["chat", 3],
        ["joke", 0.5 + avg("humor") / 30],
        ["compliment", points >= 4 ? 0.3 + a.kindness / 35 : 0],
        ["disagree", points >= 1 ? 0.2 + (100 - avg("kindness")) / 40 : 0],
      ]);
    } else {
      type = points === 0 ? "chat" : weighted([
        ["chat", 3],
        ["joke", 0.5 + avg("humor") / 30],
        ["compliment", 0.3 + a.kindness / 35],
        ["highFive", 0.4 + avg("energy") / 45],
        ["rockPaperScissors", 1],
        ["dance", (points >= 4 ? 0.6 : 0.2) + avg("energy") / 40 + avg("humor") / 80],
        ["sleepy", points >= 4 ? 0.4 + (100 - a.energy) / 70 : 0],
        ["disagree", points >= 1 ? 0.2 + (100 - avg("kindness")) / 30 : 0],
        ["spaceBounce", scene.id === "space" ? 1.5 + avg("energy") / 50 : 0],
      ]);
    }
    const hello = remote ? remoteGreeting(A, B, points, remote) : greeting(A, B, points);
    let steps = hello.concat(interactions[type](A, B, scene, points));
    if (remote) {
      // far apart: no looking at each other's clothes, no high fives
      steps = steps.map((s) => Object.assign({}, s, { arms: remote === "phone" ? undefined : s.arms === "wave" ? "wave" : undefined, hop: remote === "phone" ? false : s.hop }));
      if (type === "compliment") steps[steps.length - 2].say = pick(["You're so fun to talk to, {B}!", "I'm glad we're friends, {B}!"]);
      steps.push({ who: "A", say: remote === "phone" ? pick(["Okay, talk later! Bye!", "Gotta go! Bye!"]) : pick(["See you later!", "Bye {B}!"]), dur: 1.8 });
      if (remote === "phone") steps.push({ who: "B", say: pick(["Bye!", "Later!", "*click*"]), dur: 1.4 });
    }
    // sometimes finish with a catchphrase
    const cp = a.catchphrase && a.catchphrase.trim();
    if (cp && Math.random() < 0.35) steps.push({ who: "A", say: cp, dur: 2.0 });
    return { type, steps };
  }

  // What happens to the friendship after an interaction (some are more fun than others!)
  const FRIENDSHIP_GAIN = {
    chat: 1, compliment: 2, joke: 2, dance: 2, highFive: 1,
    rockPaperScissors: 1, disagree: 1, sleepy: 1, spaceBounce: 2,
  };

  // Short descriptions for the activity feed.
  const FEED_TEXT = {
    chat: "{A} and {B} had a chat.",
    compliment: "{A} complimented {B}.",
    joke: "{A} told {B} a joke.",
    dance: "{A} and {B} had a dance party!",
    highFive: "{A} and {B} high-fived.",
    rockPaperScissors: "{A} and {B} played rock-paper-scissors.",
    disagree: "{A} and {B} argued... then made up.",
    sleepy: "{B} woke up a sleepy {A}.",
    spaceBounce: "{A} and {B} had a moon jump contest!",
  };

  // Things a Mii says to nobody in particular.
  const SOLO_LINES = [
    "Hmm hmm hmm~", "I'm hungry.", "What should I do today?", "♪ La la la ♪",
    "I feel great!", "Did I leave the oven on?", "*whistles*", "Hmm...",
  ];

  const TRAIT_LINES = {
    energyHigh: ["Let's go, go, go!", "I can't sit still!", "Race you! ...Anyone?", "Woohoo!"],
    energyLow: ["Ahh, so relaxing.", "Let's take it slow today.", "*yawn*", "Maybe a little nap..."],
    socialHigh: ["Who wants to hang out?", "I love meeting new people!", "Party at my place!"],
    socialLow: ["...", "*looks around nervously*", "I'll just stand over here.", "Um..."],
    humorHigh: ["*does a silly dance*", "Boop!", "I'm a little teapot~", "Knock knock! ...Anyone?"],
    humorLow: ["Hmm, let me think...", "Interesting.", "I should make a plan."],
    kindHigh: ["I hope everyone's having a nice day!", "You're all great!", "Group hug, anyone?"],
    kindLow: ["Hmph.", "Everyone's so loud today.", "Don't bother me.", "Whatever."],
  };

  function soloLine(mii, scene, bestFriendName) {
    const t = traits(mii);
    if (t.catchphrase && t.catchphrase.trim() && Math.random() < 0.2) return t.catchphrase.trim();
    const pool = scene.lines.concat(SOLO_LINES);
    // strong personality traits add their own lines
    const add = (cond, lines) => { if (cond) for (let i = 0; i < 2; i++) pool.push(...lines); };
    add(t.energy >= 65, TRAIT_LINES.energyHigh); add(t.energy <= 35, TRAIT_LINES.energyLow);
    add(t.social >= 65, TRAIT_LINES.socialHigh); add(t.social <= 35, TRAIT_LINES.socialLow);
    add(t.humor >= 65, TRAIT_LINES.humorHigh); add(t.humor <= 35, TRAIT_LINES.humorLow);
    add(t.kindness >= 65, TRAIT_LINES.kindHigh); add(t.kindness <= 35, TRAIT_LINES.kindLow);
    if (bestFriendName) {
      pool.push("I wonder what " + bestFriendName + " is doing.", bestFriendName + " is the best!");
    }
    return pick(pool);
  }

  const CLICK_LINES = [
    "Hi there!", "Oh! You startled me!", "Hehe, that tickles!", "Hello!", "Need something?",
    "*waves*", "Hey, that's me!",
  ];
  const PICKUP_LINES = ["Whoa!", "Put me down!", "Wheee!", "I'm flying!", "Eek!"];
  const DROP_LINES = ["Phew!", "Oof!", "That was fun!", "Again!", "Where am I?"];

  root.Dialogue = {
    TRAITS, DEFAULT_PERSONALITY, traits, randomPersonality, personalityLabel,
    LEVELS, levelFor, buildInteraction, FRIENDSHIP_GAIN, FEED_TEXT,
    soloLine, CLICK_LINES, PICKUP_LINES, DROP_LINES, pick, weighted,
  };
})(typeof self !== "undefined" ? self : this);
