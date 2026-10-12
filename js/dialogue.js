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

  // ---------- Things to say when two Miis first meet ----------
  function greeting(A, B, points) {
    if (points === 0) {
      return [
        { who: "A", say: pick(["Hi! I'm {A}!", "Hello there! I'm {A}.", "Oh, a new face! I'm {A}!"]), arms: "wave", dur: 2.2 },
        { who: "B", say: pick(["Nice to meet you! I'm {B}.", "Hi {A}! I'm {B}!", "Hey! Call me {B}."]), arms: "wave", dur: 2.2 },
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
        ["Nice weather, huh?", "Yeah! Perfect day."],
      ];
      const [q, a] = pick((topics[scene.id] || []).concat(generic));
      return [
        { who: "A", say: q, dur: 2.6 },
        { who: "B", say: a, dur: 2.6 },
        { who: "A", say: pick(["Haha, true!", "Same here!", "Ha! Classic {B}.", "Cool!"]), expr: "laugh", dur: 1.6 },
      ];
    },

    compliment(A, B) {
      return [
        { who: "A", say: pick([
          "I love your " + B.look.favoriteColorName + " shirt!",
          "Your hair looks great today!",
          "You're so fun to hang out with, {B}!",
        ]), dur: 2.4 },
        { who: "B", say: pick(["Aww, thanks {A}!", "You're too kind!", "*blushes*"]), expr: "love", emote: "😊", dur: 2.2 },
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

  // Chooses what two Miis will do, based on where they are and how close they are.
  function buildInteraction(A, B, scene, points) {
    const choices = ["chat", "chat", "joke", "compliment", "highFive", "rockPaperScissors", "dance"];
    if (points >= 4) choices.push("dance", "joke", "sleepy");
    if (points >= 1) choices.push("disagree");
    if (scene.id === "space") choices.push("spaceBounce", "spaceBounce");
    const type = points === 0 ? "chat" : pick(choices);
    const steps = greeting(A, B, points).concat(interactions[type](A, B, scene));
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

  function soloLine(mii, scene, bestFriendName) {
    const pool = scene.lines.concat(SOLO_LINES);
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
    LEVELS, levelFor, buildInteraction, FRIENDSHIP_GAIN, FEED_TEXT,
    soloLine, CLICK_LINES, PICKUP_LINES, DROP_LINES, pick,
  };
})(typeof self !== "undefined" ? self : this);
