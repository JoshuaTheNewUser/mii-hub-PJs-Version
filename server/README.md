# Mii Hub Paintball server

This is the little program that lets people play **Paintball online** with each other.
Everyone's Mii Hub connects to it. It keeps a list of rooms, passes everyone's
movement and shots on to the other players, and is the referee: it keeps track of HP
and scores and decides who wins.

It only needs to run on **one** computer (for example your `desktopjmserver`). It's
tiny: it uses almost no processor or memory, and about 20–40 KB/s of internet per player.

---

## 1. Install Node.js (once)

Download the **LTS** version from <https://nodejs.org> and install it (just click
Next until it's done). To check it worked, open a terminal (on Windows: press the
Windows key, type `cmd`, press Enter) and type:

```
node --version
```

It should print something like `v22.11.0` (any version 18 or newer is fine).

## 2. Get the server files

The server is the `server` folder in the Mii Hub repository. Either:

- **With Git:** `git clone https://github.com/sneekyedd/mii-hub.git`, then the files are in `mii-hub/server`, or
- **Without Git:** on GitHub, click **Code → Download ZIP**, unzip it, and use the `server` folder inside.

Put it anywhere, e.g. `C:\MiiHubServer`.

## 3. Start it

- **Windows:** double-click **`start-server.bat`**. The first time it installs what it needs (a few seconds).
- **Mac / Linux:** in a terminal, `cd` into the folder and run `./start-server.sh`.

You should see:

```
Mii Hub Paintball server listening on port 8787 (max 8 players a room)
```

Leave that window open while people are playing.

**Check it works:** on that computer, open <http://localhost:8787> in a web browser.
It should say *"Mii Hub Paintball server is running."*

> If Windows shows a **"Windows Defender Firewall has blocked some features"** box,
> tick **Private networks** (and **Public networks** only if you're on a public network)
> and click **Allow access**. That lets other computers connect.

## 4. Connect from Mii Hub

In Mii Hub: **🎯 Paintball → 🌐 Online**, type the server's address, and click **Connect**.

Which address depends on where your friends are:

### Same house (same Wi‑Fi / network)

Use the server computer's name or its local IP address, with the port:

- `desktopjmserver:8787`
- or its IP, e.g. `192.168.1.50:8787` (find it on the server: run `ipconfig` in `cmd` and look for **IPv4 Address**)

### Friends somewhere else (over the internet)

Their computers have to be able to reach yours. Pick **one** of these:

**A) Tailscale (easiest and safest).** Free. Install [Tailscale](https://tailscale.com)
on the server and on each friend's computer, and sign everyone into the same
Tailscale network (you invite them). Then everyone connects to
`desktopjmserver:8787` (or the server's `100.x.y.z` Tailscale address). Nothing
is opened to the rest of the internet.

**B) Port forwarding on your router.** In your router's settings, forward **TCP port 8787** to
the server computer's local IP (e.g. 192.168.1.50). Give the server a fixed local IP in
the router too, so it doesn't change. Friends connect to your **public IP**: search
"what is my IP" on the server, then use e.g. `203.0.113.7:8787`. Your public IP can change
now and then; a free "dynamic DNS" name (e.g. from your router or duckdns.org) fixes that.

**C) A tunnel service** like [playit.gg](https://playit.gg) or a Cloudflare Tunnel gives you a public
address without touching the router. A Cloudflare Tunnel gives an `https://…` address:
type it as `wss://…` (Mii Hub does this for you if you paste the `https://` one).

## Settings

Set these before starting (e.g. on Windows: `set PORT=9000` then `node paintball-server.js`):

| Setting | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` | which port the server listens on |
| `MAX_PLAYERS` | `8` | most players in one room (2–16) |

## Keeping it running

- The window has to stay open. If the server computer restarts, start it again.
- **Windows, start automatically:** press Windows+R, type `shell:startup`, Enter, and put a
  shortcut to `start-server.bat` in that folder.
- **Linux, always on:** use a systemd service or `pm2` (`npm i -g pm2`, then `pm2 start paintball-server.js --name paintball` and `pm2 save`).

## Updating

When Mii Hub gets an update that changes online play, the server may need updating too
(Mii Hub will say *"different versions"* when you connect). Get the new `server` folder the same
way as before (`git pull`, or download the ZIP again) and restart it.

## How the game uses it (for the curious)

- Players send their position ~30 times a second; the server passes it on.
- When you hit someone, *your* game decides the hit (what you saw is what you get) and tells
  the server. The server checks it's believable (real damage numbers, not faster than the gun
  can fire, knife hits only up close), takes the HP off, and tells everyone.
- Respawn mode: 2 s after being splattered you come back; first to **20** eliminations wins,
  or whoever has the most after **10 minutes**.
- The messages are described at the top of `paintball-server.js`. `npm test` runs the server's tests.
