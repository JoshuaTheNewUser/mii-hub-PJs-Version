// Used by the build (GitHub Actions): writes js/paintball/pb-config.js with the
// online Paintball server's address from the PAINTBALL_SERVER secret, so the
// address is built into the app without ever being written in the repository.
// Without the secret it does nothing (players can type an address in the game).
const fs = require("fs");
const path = require("path");
const server = (process.env.PAINTBALL_SERVER || "").trim();
if (!server) {
  console.log("No PAINTBALL_SERVER secret: online Paintball will ask players for a server address.");
  process.exit(0);
}
const file = path.join(__dirname, "..", "js", "paintball", "pb-config.js");
fs.writeFileSync(file, "// Made by the build from a secret. Not in the repository.\nwindow.PB_CONFIG = " + JSON.stringify({ server }) + ";\n");
console.log("Built in the online Paintball server address.");
