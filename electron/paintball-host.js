/*
 * electron/paintball-host.js
 * "Host a game" for online Paintball: runs the Paintball server
 * (server/paintball-server.js) inside the desktop app, so anyone can host
 * a lobby from their own computer.
 *
 * Friends on the same Wi-Fi join with this computer's local address.
 * For friends somewhere else, we ask the home router to let them in
 * (UPnP: most home routers allow this). If the router says no, the
 * person hosting can forward the port by hand, or use Tailscale.
 */
const os = require("os");
const dgram = require("dgram");
const http = require("http");
const https = require("https");

const PORT = 8787;
let server = null;   // the Paintball server module, loaded when first needed
let state = null;    // { port, lan, publicIp, upnp, mapping }

// This computer's addresses on the local network (Wi-Fi / Ethernet)
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal) continue;
      if (/^169\.254\./.test(a.address)) continue; // not really connected
      out.push(a.address);
    }
  }
  // home networks first (192.168.x.x, 10.x.x.x, 172.16-31.x.x), Tailscale (100.x) last
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : /^100\./.test(ip) ? 4 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

// Is this a private address (so friends on the internet can't reach it)?
function isPrivate(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.)/.test(ip || "");
}

// ---------------------------------------------------------------------
// UPnP: asking the router to open a port
// ---------------------------------------------------------------------
function discoverGateway(timeout) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const found = [];
    const done = () => { try { sock.close(); } catch (e) { /* ignore */ } resolve(found); };
    const timer = setTimeout(done, timeout || 2500);
    sock.on("error", () => { clearTimeout(timer); done(); });
    sock.on("message", (msg) => {
      const m = /^location:\s*(.+)$/im.exec(msg.toString());
      if (m && !found.includes(m[1].trim())) found.push(m[1].trim());
    });
    sock.bind(0, () => {
      for (const st of ["urn:schemas-upnp-org:device:InternetGatewayDevice:1", "urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANPPPConnection:1"]) {
        const q = Buffer.from("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + st + "\r\n\r\n");
        sock.send(q, 0, q.length, 1900, "239.255.255.250");
      }
    });
  });
}

function httpRequest(url, opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, Object.assign({ timeout: 3000 }, opts), (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: data, localAddress: req.socket && req.socket.localAddress }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// From the router's description, find the service that does port mappings
async function findService(location) {
  const res = await httpRequest(location, { method: "GET" });
  const xml = res.body;
  const services = xml.split(/<service>/i).slice(1);
  for (const sv of services) {
    const type = (/<serviceType>([^<]+)<\/serviceType>/i.exec(sv) || [])[1] || "";
    if (!/WAN(IP|PPP)Connection/.test(type)) continue;
    const ctrl = (/<controlURL>([^<]+)<\/controlURL>/i.exec(sv) || [])[1];
    if (!ctrl) continue;
    const base = (/<URLBase>([^<]+)<\/URLBase>/i.exec(xml) || [])[1] || location;
    return { type: type.trim(), control: new URL(ctrl.trim(), base).toString(), localAddress: res.localAddress };
  }
  return null;
}

async function soap(svc, action, args) {
  const inner = Object.entries(args || {}).map(([k, v]) => "<" + k + ">" + v + "</" + k + ">").join("");
  const body = '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    "<s:Body><u:" + action + ' xmlns:u="' + svc.type + '">' + inner + "</u:" + action + "></s:Body></s:Envelope>";
  const res = await httpRequest(svc.control, {
    method: "POST",
    headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: '"' + svc.type + "#" + action + '"', "Content-Length": Buffer.byteLength(body) },
  }, body);
  if (res.status !== 200) throw new Error(action + " failed (" + res.status + ")");
  return res.body;
}

async function openPort(port) {
  const locations = await discoverGateway(2500);
  if (!locations.length) return { ok: false, why: "No router answered (UPnP may be turned off)." };
  for (const loc of locations) {
    try {
      const svc = await findService(loc);
      if (!svc) continue;
      const args = (lease) => ({
        NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP", NewInternalPort: port,
        NewInternalClient: svc.localAddress, NewEnabled: 1, NewPortMappingDescription: "Mii Hub Paintball", NewLeaseDuration: lease,
      });
      try { await soap(svc, "AddPortMapping", args(0)); } catch (e) { await soap(svc, "AddPortMapping", args(7200)); }
      let ip = null;
      try {
        const r = await soap(svc, "GetExternalIPAddress");
        ip = ((/<NewExternalIPAddress>([^<]*)</i.exec(r) || [])[1] || "").trim() || null;
      } catch (e) { /* the public address is looked up another way below */ }
      return { ok: true, svc, ip };
    } catch (e) { /* try the next router */ }
  }
  return { ok: false, why: "The router didn't allow it." };
}

async function closePort(mapping, port) {
  if (!mapping) return;
  try { await soap(mapping.svc, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP" }); } catch (e) { /* ignore */ }
}

// Your address on the internet (as the rest of the internet sees it)
function lookupPublicIp() {
  return new Promise((resolve) => {
    const req = https.get("https://api.ipify.org", { timeout: 3000 }, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; });
      res.on("end", () => resolve(/^\d+\.\d+\.\d+\.\d+$/.test(d.trim()) ? d.trim() : null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

// ---------------------------------------------------------------------
// Start / stop hosting
// ---------------------------------------------------------------------
async function start() {
  if (state) return info();
  if (!server) server = require("../server/paintball-server.js");
  const port = await server.start(PORT);
  state = { port, lan: lanAddresses(), publicIp: null, upnp: "trying", mapping: null, why: "" };
  // the router bit can take a few seconds: do it in the background
  state.ready = (async () => {
    const r = await openPort(port).catch((e) => ({ ok: false, why: e.message }));
    if (!state) { if (r.ok) closePort(r, port); return; }
    state.upnp = r.ok ? "open" : "closed";
    state.why = r.ok ? "" : r.why;
    state.mapping = r.ok ? r : null;
    let ip = r.ok ? r.ip : null;
    if (!ip || isPrivate(ip)) {
      const looked = await lookupPublicIp();
      // the router's own "internet" address is private: you're behind another router (or your provider's)
      if (ip && isPrivate(ip)) { state.upnp = "double-nat"; state.why = "Your router is behind another router (or your internet provider's), so friends outside can't reach it directly."; }
      ip = looked || ip;
    }
    state.publicIp = ip;
  })();
  return info();
}

async function stop() {
  if (!state) return;
  const s = state;
  state = null;
  await closePort(s.mapping, s.port);
  if (server) await server.stop();
}

function info() {
  if (!state) return { hosting: false };
  return { hosting: true, port: state.port, lan: state.lan, publicIp: state.publicIp, upnp: state.upnp, why: state.why };
}

// waits for the router check to finish (or gives up after a few seconds)
async function details() {
  if (state && state.ready) await Promise.race([state.ready, new Promise((r) => setTimeout(r, 8000))]);
  return info();
}

module.exports = { start, stop, info, details, lanAddresses, isPrivate, PORT };
