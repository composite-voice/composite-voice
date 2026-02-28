/**
 * Standalone V2 (Flux) STT test using @deepgram/sdk V5.
 *
 * Matches the pattern from deepgram-js-sdk/examples/26-transcription-live-websocket-v2.ts
 *
 * Run with: node --env-file=examples/10-proxy-server/.env scratch/test-v2.mjs
 */
import { DeepgramClient } from "@deepgram/sdk";

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error("Missing DEEPGRAM_API_KEY");
  process.exit(1);
}

console.log("=== Deepgram SDK V5 — V2 (Flux) standalone test ===\n");

const deepgram = new DeepgramClient({ apiKey });

// ── 1. Create connection (not yet connected) ─────────────────────
console.log("[1] Calling listen.v2.connect()...");
const socket = await deepgram.listen.v2.connect({
  model: "flux-general-en",
});
console.log("[1] Got V2Socket. readyState:", socket.readyState);

// ── 2. Register handlers BEFORE connecting ───────────────────────
console.log("\n[2] Registering on() handlers...");

let pingInterval = null;

socket.on("open", () => {
  console.log("\n[EVENT] open — WebSocket connected!");
  // Start keepalive pings
  pingInterval = setInterval(() => {
    try {
      socket.ping();
    } catch (err) {
      console.error("[Keepalive] Ping failed:", err.message);
      clearInterval(pingInterval);
    }
  }, 5000);
});

socket.on("message", (msg) => {
  if (msg.type === "Connected") {
    console.log("[EVENT] Connected! request_id:", msg.request_id);
  } else if (msg.type === "TurnInfo") {
    const { event, transcript, end_of_turn_confidence } = msg;
    console.log(`[TurnInfo] ${event}: "${transcript}" (eot_conf: ${end_of_turn_confidence})`);
  } else if (msg.type === "FatalError") {
    console.error("[EVENT] FatalError:", msg.error, msg.description);
  } else {
    console.log(`[EVENT] message type=${msg.type}`);
  }
});

socket.on("error", (err) => {
  console.error("[EVENT] error:", err.message || err);
});

socket.on("close", () => {
  console.log("[EVENT] close");
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
});

// ── 3. Connect to the websocket ──────────────────────────────────
console.log("\n[3] Calling socket.connect()...");
socket.connect();
console.log("[3] socket.connect() returned. readyState:", socket.readyState);

// ── 4. Wait for open ─────────────────────────────────────────────
console.log("\n[4] Calling socket.waitForOpen() (timeout 15s)...");
try {
  await Promise.race([
    socket.waitForOpen(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
  ]);
  console.log("[4] waitForOpen() resolved! readyState:", socket.readyState);
} catch (err) {
  console.error("[4] waitForOpen() FAILED:", err.message);
  console.log("    readyState:", socket.readyState);
  process.exit(1);
}

// ── 5. Stream audio ──────────────────────────────────────────────
console.log("\n[5] Streaming BBC World Service for 15 seconds...\n");
const response = await fetch("http://stream.live.vc.bbcmedia.co.uk/bbc_world_service");
const reader = response.body.getReader();

const startTime = Date.now();
const DURATION = 15_000;

async function pump() {
  while (Date.now() - startTime < DURATION) {
    const { value, done } = await reader.read();
    if (done) break;
    try {
      socket.sendMedia(value);
    } catch (err) {
      console.error("[ERROR] sendMedia:", err.message);
      break;
    }
  }
}

await pump();

console.log("\n[6] Done streaming. Closing...");
await new Promise((r) => setTimeout(r, 2000));

try {
  socket.sendCloseStream({ type: "CloseStream" });
} catch (e) {
  console.log("[6] sendCloseStream error:", e.message);
}
socket.close();
console.log("[7] Socket closed. Done.");
process.exit(0);
