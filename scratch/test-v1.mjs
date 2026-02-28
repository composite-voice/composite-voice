/**
 * Standalone V1 (Nova) STT test using @deepgram/sdk V5.
 *
 * Matches the pattern from deepgram-js-sdk/examples/07-transcription-live-websocket.ts
 *
 * Run with: node --env-file=examples/10-proxy-server/.env scratch/test-v1.mjs
 */
import { DeepgramClient } from "@deepgram/sdk";

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error("Missing DEEPGRAM_API_KEY");
  process.exit(1);
}

console.log("=== Deepgram SDK V5 — V1 (Nova) standalone test ===");
console.log("API key prefix:", apiKey.substring(0, 8) + "...\n");

const deepgram = new DeepgramClient({ apiKey });

// ── 1. Create connection (not yet connected) ─────────────────────
console.log("[1] Calling listen.v1.connect()...");
const socket = await deepgram.listen.v1.connect({
  model: "nova-3",
  language: "en",
  punctuate: "true",
  interim_results: "true",
});
console.log("[1] Got V1Socket. readyState:", socket.readyState);

// ── 2. Register handlers BEFORE connecting ───────────────────────
console.log("\n[2] Registering on() handlers...");
socket.on("open", () => {
  console.log("\n[EVENT] open — WebSocket connected!");
});

socket.on("message", (msg) => {
  if (msg.type === "Results") {
    const transcript = msg.channel?.alternatives?.[0]?.transcript;
    if (transcript) {
      const tag = msg.is_final ? (msg.speech_final ? "SPEECH_FINAL" : "FINAL") : "INTERIM";
      console.log(`[${tag}] ${transcript}`);
    }
  } else if (msg.type === "Metadata") {
    console.log(`[EVENT] Metadata received`);
  } else {
    console.log(`[EVENT] message type=${msg.type}`);
  }
});

socket.on("error", (err) => {
  console.error("[EVENT] error:", err.message || err);
});

socket.on("close", () => {
  console.log("[EVENT] close");
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
console.log("\n[5] Streaming BBC World Service for 10 seconds...\n");
const response = await fetch("http://stream.live.vc.bbcmedia.co.uk/bbc_world_service");
const reader = response.body.getReader();

const startTime = Date.now();
const DURATION = 10_000;

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

console.log("\n[6] Done. Cleaning up...");
socket.sendFinalize({ type: "Finalize" });
await new Promise((r) => setTimeout(r, 2000));
socket.close();
console.log("[7] Done.");
process.exit(0);
