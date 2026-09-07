require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { OpenAI } = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Multer for audio upload (in-memory)
const upload = multer({ storage: multer.memoryStorage() });

// ─── Active generation tracker ────────────────────────────────────────────────
// Each session can have one active generation; we store the abort controller.
const activeSessions = new Map(); // sessionId → { llmController, ttsController }

function cancelSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    try { session.llmController?.abort(); } catch (_) {}
    try { session.ttsController?.abort(); } catch (_) {}
    activeSessions.delete(sessionId);
    console.log(`[${sessionId}] Cancelled active generation`);
  }
}

// ─── Restaurant Menu Context ───────────────────────────────────────────────────
const MENU_CONTEXT = `
You are TastyBot, an enthusiastic AI waiter at "The Pixel Café" — a cozy tech-themed café.
You help customers browse the menu, take orders, answer questions, and confirm orders.

=== THE PIXEL CAFÉ MENU ===

☕ DRINKS
- Espresso — $3.00
- Cappuccino — $4.50
- Latte (regular or oat milk) — $5.00
- Cold Brew — $5.50
- Matcha Latte — $5.50
- Fresh Orange Juice — $4.00
- Sparkling Water — $2.00

🥐 BREAKFAST (served all day)
- Avocado Toast (sourdough, cherry tomatoes, everything bagel seasoning) — $9.00
  [VEGAN]
- Scrambled Eggs on Toast (choice of white or sourdough) — $8.00
- Açaí Bowl (granola, banana, berries, honey) — $11.00
  [VEGAN option: skip honey]
- Classic Pancakes (maple syrup, butter) — $10.00

🥪 LUNCH
- Grilled Chicken Sandwich (brioche, lettuce, tomato, aioli) — $13.00
- Mushroom & Brie Panini (sourdough, caramelized onions) — $12.00
  [VEGETARIAN]
- Caesar Salad (romaine, croutons, parmesan) — $11.00
  [Add chicken: +$4]
- Loaded Sweet Potato Fries — $8.00
  [VEGAN]

🍰 DESSERTS
- Chocolate Lava Cake — $8.00
- Cheesecake (classic or blueberry) — $7.00
- Vegan Brownie — $6.00
  [VEGAN]

=== RULES ===
- Be friendly and concise — this is a voice conversation, so keep answers SHORT (1-3 sentences max unless listing the full menu).
- When the user asks for the menu, list CATEGORIES first and offer to detail any section.
- When an order is placed, confirm it clearly and give a total.
- If asked about allergens, ingredients, or vegan/vegetarian options, answer accurately from the menu.
- End confirmed orders with "Your order is confirmed! It'll be ready shortly."
- Never make up items not on the menu.
`;

// ─── POST /transcribe ─ Whisper STT ──────────────────────────────────────────
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file received" });
  }

  try {
    // Whisper expects a File-like object; use a temp file approach
    const tmpPath = path.join(__dirname, `tmp_${Date.now()}.webm`);
    fs.writeFileSync(tmpPath, req.file.buffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: "whisper-1",
      language: "en",
    });

    fs.unlinkSync(tmpPath);
    console.log(`[STT] "${transcription.text}"`);
    res.json({ text: transcription.text });
  } catch (err) {
    console.error("[STT Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cancel ─ Barge-in: cancel active generation ───────────────────────
app.post("/cancel", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) cancelSession(sessionId);
  res.json({ ok: true });
});

// ─── POST /chat ─ GPT-4o streaming → TTS streaming via SSE ──────────────────
// Response format: SSE stream
//   data: {"type":"text","delta":"..."}\n\n      — LLM token
//   data: {"type":"audio","chunk":"<base64>"}\n\n — TTS audio chunk
//   data: {"type":"done"}\n\n                    — finished
//   data: {"type":"error","message":"..."}\n\n   — error
app.post("/chat", async (req, res) => {
  const { messages, sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  // Cancel any previous generation for this session (barge-in)
  cancelSession(sessionId);

  // Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const llmController = new AbortController();
  const session = { llmController, ttsController: null };
  activeSessions.set(sessionId, session);

  try {
    // ── Step 1: Stream LLM tokens ──────────────────────────────────────────
    const systemMessage = { role: "system", content: MENU_CONTEXT };
    const fullMessages = [systemMessage, ...messages];

    const llmStream = await openai.chat.completions.create(
      {
        model: "gpt-4o",
        messages: fullMessages,
        stream: true,
        max_tokens: 300,
        temperature: 0.7,
      },
      { signal: llmController.signal }
    );

    let fullText = "";

    for await (const chunk of llmStream) {
      if (llmController.signal.aborted) break;

      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullText += delta;
        sendEvent({ type: "text", delta });
      }
    }

    if (llmController.signal.aborted || !fullText.trim()) {
      sendEvent({ type: "done" });
      res.end();
      activeSessions.delete(sessionId);
      return;
    }

    console.log(`[LLM] Response: "${fullText.substring(0, 80)}..."`);

    // ── Step 2: Stream TTS audio ───────────────────────────────────────────
    const ttsController = new AbortController();
    session.ttsController = ttsController;

    const ttsResponse = await openai.audio.speech.create(
      {
        model: "tts-1",
        voice: "alloy",
        input: fullText,
        response_format: "mp3",
      },
      { signal: ttsController.signal }
    );

    if (ttsController.signal.aborted) {
      sendEvent({ type: "done" });
      res.end();
      activeSessions.delete(sessionId);
      return;
    }

    // Stream audio chunks as base64
    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const CHUNK_SIZE = 8192; // 8KB chunks

    for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
      if (ttsController.signal.aborted || res.writableEnded) break;
      const chunk = audioBuffer.slice(i, i + CHUNK_SIZE);
      sendEvent({ type: "audio", chunk: chunk.toString("base64") });
    }

    sendEvent({ type: "done" });
    res.end();
    activeSessions.delete(sessionId);
  } catch (err) {
    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      console.log(`[${sessionId}] Stream aborted (barge-in)`);
      if (!res.writableEnded) {
        sendEvent({ type: "done" });
        res.end();
      }
    } else {
      console.error("[Chat Error]", err.message);
      if (!res.writableEnded) {
        sendEvent({ type: "error", message: err.message });
        res.end();
      }
    }
    activeSessions.delete(sessionId);
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", activeSessions: activeSessions.size });
});

app.listen(PORT, () => {
  console.log(`\n🎙️  TastyBot Voice Assistant`);
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   OpenAI key: ${process.env.OPENAI_API_KEY ? "✅ set" : "❌ MISSING — set OPENAI_API_KEY in .env"}\n`);
});
