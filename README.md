# Mii Hub

A little web app where your Miis walk around, chat, and become friends, a bit like the Mii Parade/plaza in the Wii's Mii Channel.

## How to run it

You don't need to install anything. Open `index.html` in a web browser (double-clicking it usually works).

On first launch you'll see **Joe** (from `samples/Joe.miic`) plus a few demo friends.

## What you can do

- **Add your Miis:** click **Choose Mii files…** or drag files onto the hub.
- **Switch places:** use the **🌳 Park**, **🏢 Office** and **🚀 Outer Space** buttons at the top.
- **Click a Mii** to make it say hi and jump.
- **Drag a Mii** to pick it up. Let go and it drops back down.
- **✏️ Edit** a Mii in the *Residents* list to change its colours, hairstyle, glasses and facial hair.
- **🗑️** sends a Mii home (removes it).
- **How chatty?** sets how often Miis talk and hang out.

Your Miis, their friendships and the place you picked are saved in your browser, so they'll still be there next time.

## What the Miis do

- Walk around and visit spots in each place: the bench and duck pond in the park, desks and the water cooler in the office, the rocket and rover in space.
- Say things now and then. Some lines depend on the place they're in.
- Meet up in pairs and:
  - chat
  - tell jokes
  - give compliments
  - high-five
  - play rock-paper-scissors
  - have a dance party
  - argue about pizza and then make up
  - in space, hold moon-jump contests
- Build friendships over time, from *Strangers* to *Best Friends* 💖. You can watch this in the *Friendships* and *What's happening* panels.

## Supported Mii files

| File | Where it comes from | What's read |
| --- | --- | --- |
| `.mii`, `.rcd` (74 bytes) | Wii | Name and full look |
| `.ffsd`, `.cfsd`, `.3dsmii` (92–96 bytes) | 3DS / Wii U | Name and full look |
| `.miic` (104–108 bytes) | Older Mii Creator exports | Name and full look |
| `.miic` (140 bytes) and other layouts | Newer Mii Creator exports | Name only (see below) |

**About newer `.miic` files:** the newest Mii Creator layout isn't publicly documented. For these files the hub reads the Mii's **name** correctly, but has to **guess the look**. It makes the same guess every time for the same file. These Miis get a "look guessed" tag; use ✏️ to make them look right.

The full look is simplified into a cute 2D cartoon, so it won't match the official 3D Mii exactly.

## Project layout

```
index.html          the page
css/style.css       how the page looks
js/miiParser.js     reads Mii files and turns them into a "look"
js/miiRenderer.js   draws a Mii with simple shapes
js/scenes.js        the park, office and outer space
js/dialogue.js      what Miis say and the activities they do together
js/hub.js           moves the Miis around and runs the conversations
js/app.js           connects buttons and side panels to the hub
js/sampleMiis.js    Joe + the demo friends
samples/Joe.miic    the sample Mii file
tests/parser.test.js  checks that Mii files are read correctly
```

## Running the tests

If you have [Node.js](https://nodejs.org) installed:

```
node tests/parser.test.js
```

## Ideas for adding your own stuff

- **New lines for Miis to say:** add them to `lines` in `js/scenes.js` or `SOLO_LINES` in `js/dialogue.js`.
- **New activity for two Miis:** add a function to `interactions` in `js/dialogue.js`, then add its name to `choices` in `buildInteraction`.
- **New place:** copy one of the scenes in `js/scenes.js`, give it a new `id`, and add it to the `list` at the bottom.
