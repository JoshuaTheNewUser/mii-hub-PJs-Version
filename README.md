# Mii Hub

A 3D web app where your Miis walk around, chat and become friends, a bit like the Mii plaza in the Wii's Mii Channel. The style is inspired by Tomodachi Life: soft cartoon shading, bright colours and rounded shapes. Everything is 3D: the Miis, the island park, the office and the moon base.

## How to run it

You don't need to install anything:

1. Download the project and unzip it.
2. Double-click `index.html`. It opens in your web browser.

On first launch you'll see **Joe** (from `samples/Joe.glb`) plus a few demo friends.

The 3D library (Three.js) is included in the project, so it works offline. It needs a browser with WebGL, which almost every modern browser has.

## Adding your own Miis

The hub uses **full-body 3D Mii models (`.glb` files)** exported from [Mii Creator](https://mii.nxw.pw).

1. In Mii Creator, export your Mii as a full-body 3D model (`.glb`).
2. In the hub, click **Choose Mii .glb files…**, or drag the files onto the 3D view.

The hub reads the Mii's name from the file. It also uses the height setting to make taller Miis a little bigger. Old `.miic` / `.mii` files no longer work, because they don't contain a 3D model.

## What you can do

- **Switch places:** use the **🌳 Park**, **🏢 Office** and **🚀 Outer Space** buttons at the top.
- **Move the camera:** drag the background to turn it, and scroll (or pinch) to zoom.
- **Click a Mii** to make it jump and say hi.
- **Drag a Mii** to pick it up and carry it. Let go and it drops back down.
- **✏️ Edit** a Mii in the *Residents* list to change its skin, hair, top, pants and eye colours, or remove a beard.
- **🗑️** sends a Mii home (removes it).
- **How chatty?** sets how often Miis talk and hang out.

Your Miis, their friendships and the place you picked are saved in your browser, so they'll still be there next time.

## What the Miis do

- **Walk around** and visit spots:
  - Park (a little island): sit on the benches, watch the ducks, make a wish at the fountain, have a picnic, admire the cherry blossoms, look at the sea.
  - Office: sit and work at a desk, relax on the sofa, make coffee, get water, use the printer, browse the bookshelf, visit the vending machine.
  - Outer Space (a moon base): check the rocket, salute the flag, fix the rover, gaze at Earth, visit the space garden, admire the glowing crystals.
- **Find their own way around** trees, benches, desks, ponds and each other, and never walk on water. If you drop a Mii in the pond, it climbs out.
- **Talk now and then.** Some lines depend on the place they're in.
- **Meet up in pairs** and:
  - chat
  - tell jokes
  - give compliments
  - high-five
  - play rock-paper-scissors
  - have a dance party
  - argue about pizza and then make up
  - in space, hold moon-jump contests
- **Build friendships** over time, from *Strangers* to *Best Friends* 💖. You can watch this in the *Friendships* and *What's happening* panels.
- **In space**, Miis wear astronaut helmets and float in low gravity.

## About the demo friends

The demo friends (Mia, Leo, Ava, Sam…) are copies of Joe's 3D model with different colours. They share Joe's face and hairstyle. Add more of your own `.glb` Miis to get a crowd with different faces, and remove the demo friends with 🗑️.

## What's in each place

- **Park:** an island in the sea, with:
  - round trees, an apple tree, an orange tree and a cherry blossom
  - palm trees and a white picket fence
  - a duck pond with ducklings, lily pads and reeds
  - a three-tier fountain, swings, a picnic blanket, lamp posts and flower beds
  - butterflies, seagulls, clouds, a lighthouse and a sailboat
- **Office:**
  - desks with screens and swivel chairs, a bookshelf and a whiteboard
  - a sofa corner, a kitchen with a steaming coffee machine, a water cooler and a vending machine
  - curtained windows with a city view and a clock showing the real time
- **Outer Space:**
  - a glass dome with a garden inside, a rocket on a launch pad with blinking lights, and a launch tower
  - solar panels, a turning satellite dish, a rover and glowing crystals
  - a waving flag, Earth with moving clouds, and a UFO that zooms past now and then

## How the animation works

The `.glb` from Mii Creator has a skeleton (bones for the arms, legs, spine and head) but no built-in animations. The hub moves those bones itself every frame to make the Miis walk, wave, cheer, dance, type and sit (see `Rig.pose` in `js/miiModel.js`).

## Project layout

```
index.html            the page
css/style.css         how the page looks
js/vendor/            Three.js 3D library (r147, MIT licence)
js/miiModel.js        loads .glb Miis, recolours them, moves their bones
js/world3d.js         the 3D island park, office and moon base
js/nav.js             route-finding, so Miis walk around obstacles
js/dialogue.js        what Miis say and the activities they do together
js/hub3d.js           moves the Miis around, camera, clicking & dragging
js/storage.js         saves Miis in the browser
js/app.js             connects buttons and side panels to the hub
js/sampleGlb.js       Joe.glb stored as text so it loads without a web server
samples/Joe.glb       the sample Mii
tests/glb.test.js     checks that .glb files are read correctly
tests/nav.test.js     checks that routes go around obstacles and water
```

## Running the tests

If you have [Node.js](https://nodejs.org) installed:

```
node tests/glb.test.js
node tests/nav.test.js
```

## Ideas for adding your own stuff

- **New lines for Miis to say:** add them to `lines` in `js/world3d.js` or `SOLO_LINES` in `js/dialogue.js`.
- **New activity for two Miis:** add a function to `interactions` in `js/dialogue.js`, then add its name to `choices` in `buildInteraction`.
- **New place:** write a `buildSomething()` function in `js/world3d.js` (copy one of the others), and add it to `builders` and `list` at the bottom.
- **New object Miis should walk around:** add its shape to that place's `obstacles` list (circle, oval or rectangle — see the top of `js/nav.js`).
- **New pose:** add a case to the `switch (p.arms)` in `js/miiModel.js`.
