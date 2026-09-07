require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const https   = require("https");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Active generation tracker ────────────────────────────────────────────────
const activeSessions = new Map(); // sessionId → { abort: fn }

function cancelSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    try { session.abort(); } catch (_) {}
    activeSessions.delete(sessionId);
    console.log(`[${sessionId}] Cancelled generation`);
  }
}

// ─── Restaurant Menu Data & Context ──────────────────────────────────────────
const MENU = {
  drinks: [
    { name: "Espresso", price: 3.00, desc: "Rich single shot", vegan: true },
    { name: "Cappuccino", price: 4.50, desc: "Espresso with steamed milk foam", vegan: false },
    { name: "Latte", price: 5.00, desc: "Smooth espresso with choice of dairy or oat milk", vegan: true },
    { name: "Cold Brew", price: 5.50, desc: "Steeped for 18 hours, smooth & bold", vegan: true },
    { name: "Matcha Latte", price: 5.50, desc: "Ceremonial grade green tea with oat milk", vegan: true },
    { name: "Fresh Orange Juice", price: 4.00, desc: "Freshly squeezed Valencia oranges", vegan: true },
    { name: "Sparkling Water", price: 2.00, desc: "Chilled sparkling mineral water", vegan: true }
  ],
  breakfast: [
    { name: "Avocado Toast", price: 9.00, desc: "Artisanal sourdough, cherry tomatoes, bagel seasoning", vegan: true },
    { name: "Scrambled Eggs on Toast", price: 8.00, desc: "Fluffy eggs on choice of white or sourdough", vegan: false },
    { name: "Açaí Bowl", price: 11.00, desc: "Granola, banana, seasonal berries, organic honey", vegan: true },
    { name: "Classic Pancakes", price: 10.00, desc: "Stack of 3 fluffy pancakes, maple syrup & butter", vegan: false }
  ],
  lunch: [
    { name: "Grilled Chicken Sandwich", price: 13.00, desc: "Brioche bun, lettuce, ripe tomato, garlic aioli", vegan: false },
    { name: "Mushroom & Brie Panini", price: 12.00, desc: "Toasted sourdough with caramelized onions", vegan: false, vegetarian: true },
    { name: "Caesar Salad", price: 11.00, desc: "Crisp romaine, herbed croutons, shaved parmesan", vegan: false, vegetarian: true },
    { name: "Loaded Sweet Potato Fries", price: 8.00, desc: "Crispy sweet potato fries with vegan spicy mayo", vegan: true }
  ],
  desserts: [
    { name: "Chocolate Lava Cake", price: 8.00, desc: "Warm chocolate cake with molten fudge center", vegan: false },
    { name: "Cheesecake", price: 7.00, desc: "Classic New York style or fresh blueberry drizzle", vegan: false },
    { name: "Vegan Brownie", price: 6.00, desc: "Fudgy dark chocolate brownie with walnuts", vegan: true }
  ]
};

const ALL_ITEMS = [
  ...MENU.drinks,
  ...MENU.breakfast,
  ...MENU.lunch,
  ...MENU.desserts
];

const MENU_CONTEXT = `
You are TastyBot, a friendly and enthusiastic AI waiter at "The Pixel Café" — a modern tech-themed café.
You help customers browse the menu, take orders, calculate totals, answer questions, and confirm orders.

=== THE PIXEL CAFÉ MENU ===
☕ DRINKS:
- Espresso ($3.00)
- Cappuccino ($4.50)
- Latte ($5.00, choice of regular or oat milk)
- Cold Brew ($5.50)
- Matcha Latte ($5.50)
- Fresh Orange Juice ($4.00)
- Sparkling Water ($2.00)

🥐 BREAKFAST (served all day):
- Avocado Toast ($9.00) [VEGAN]
- Scrambled Eggs on Toast ($8.00)
- Açaí Bowl ($11.00) [VEGAN without honey]
- Classic Pancakes ($10.00)

🥪 LUNCH:
- Grilled Chicken Sandwich ($13.00)
- Mushroom & Brie Panini ($12.00) [VEGETARIAN]
- Caesar Salad ($11.00, add chicken +$4) [VEGETARIAN]
- Loaded Sweet Potato Fries ($8.00) [VEGAN]

🍰 DESSERTS:
- Chocolate Lava Cake ($8.00)
- Cheesecake ($7.00, classic or blueberry)
- Vegan Brownie ($6.00) [VEGAN]

=== RULES ===
- Keep answers SHORT and conversational (1-3 sentences) because this is a spoken voice conversation.
- If asked about menu, list categories first or highlight 2-3 popular items.
- When the customer asks to order items, acknowledge the order, state the items, and provide the total price.
- If order is finalized, conclude with: "Your order is confirmed! It'll be ready shortly."
- Never invent items not on our menu.
`;

// ─── Smart Free Café AI Brain (Zero-cost Fallback Engine) ─────────────────────
function smartCafeResponse(userMessage, history) {
  const text = (userMessage || "").toLowerCase().trim();
  const matchedItems = [];

  // Detect items mentioned in user's speech with precise matching
  const itemKeywords = {
    "Espresso": ["espresso"],
    "Cappuccino": ["cappuccino"],
    "Latte": ["latte"],
    "Cold Brew": ["cold brew", "coldbrew"],
    "Matcha Latte": ["matcha"],
    "Fresh Orange Juice": ["orange juice", "fresh orange"],
    "Sparkling Water": ["sparkling water", "mineral water"],
    "Avocado Toast": ["avocado toast", "avocado"],
    "Scrambled Eggs on Toast": ["scrambled eggs", "scrambled egg", "eggs on toast"],
    "Açaí Bowl": ["açaí", "acai bowl", "acai"],
    "Classic Pancakes": ["pancake", "pancakes"],
    "Grilled Chicken Sandwich": ["chicken sandwich", "grilled chicken"],
    "Mushroom & Brie Panini": ["mushroom panini", "brie panini", "panini"],
    "Caesar Salad": ["caesar salad", "caesar"],
    "Loaded Sweet Potato Fries": ["sweet potato fries", "sweet potato", "fries"],
    "Chocolate Lava Cake": ["lava cake", "chocolate lava"],
    "Cheesecake": ["cheesecake"],
    "Vegan Brownie": ["brownie", "vegan brownie"]
  };

  for (const item of ALL_ITEMS) {
    const kws = itemKeywords[item.name] || [item.name.toLowerCase()];
    if (kws.some(k => text.includes(k))) {
      matchedItems.push(item);
    }
  }

  // Check intent
  const isGreeting = /^(hi|hello|hey|greetings|morning|afternoon|started up|start)/i.test(text);
  const isMenuQuery = /(menu|what do you have|what's on the menu|options|food|list)/i.test(text);
  const isVeganQuery = /(vegan|plant[- ]based|dairy[- ]free|vegetarian)/i.test(text);
  const isDrinkQuery = /(drink|coffee|beverage|tea|juice|latte|brew)/i.test(text);
  const isDessertQuery = /(dessert|sweet|cake|brownie)/i.test(text);
  const isBreakfastQuery = /(breakfast|morning|pancake|toast|egg)/i.test(text);
  const isOrder = /(order|want|get|have|like a|bring me|give me|i'll take|can i have|add)/i.test(text);
  const isConfirm = /(confirm|finish|that's all|that is all|ready|bill|check|done)/i.test(text);
  const isPopular = /(popular|best|recommend|favorite|special)/i.test(text);

  let reply = "";
  let orderData = null;

  if (isGreeting) {
    reply = "Welcome to The Pixel Café! I'm TastyBot, your voice waiter. Would you like to hear today's drinks, breakfast, lunch, or desserts?";
  } else if (isOrder && matchedItems.length > 0) {
    const itemNames = matchedItems.map(i => i.name).join(" and ");
    const total = matchedItems.reduce((acc, i) => acc + i.price, 0);
    orderData = { items: matchedItems, total };
    reply = `Great choice! I've added the ${itemNames} to your order. That comes to $${total.toFixed(2)}. Would you like anything else, or should I confirm this order?`;
  } else if (matchedItems.length > 0 && (isOrder || /(how much|price|cost)/i.test(text))) {
    const item = matchedItems[0];
    reply = `Our ${item.name} is $${item.price.toFixed(2)}. ${item.desc}. Would you like me to order one for you?`;
  } else if (isConfirm) {
    reply = "Your order is confirmed! It'll be ready for you shortly. Thank you for dining with The Pixel Café!";
  } else if (isVeganQuery) {
    reply = "We have wonderful vegan dishes! Try our Avocado Toast for $9, the Açaí Bowl for $11, Loaded Sweet Potato Fries for $8, or our decadent Vegan Brownie for $6. Any of those tempt you?";
  } else if (isPopular) {
    reply = "Our crowd favorites are the handcrafted Cold Brew ($5.50), the Avocado Toast on fresh sourdough ($9.00), and the warm Chocolate Lava Cake ($8.00)!";
  } else if (isDrinkQuery && !isOrder) {
    reply = "For drinks, we serve Espresso ($3), Cappuccino ($4.50), Vanilla Latte ($5), Cold Brew ($5.50), Matcha Latte ($5.50), and fresh Orange Juice ($4). What can I get started for you?";
  } else if (isDessertQuery && !isOrder) {
    reply = "For dessert, we offer warm Chocolate Lava Cake ($8), New York Cheesecake ($7), and our rich Vegan Brownie ($6). Which one sounds good?";
  } else if (isBreakfastQuery && !isOrder) {
    reply = "Breakfast is served all day! We have Avocado Toast ($9), Scrambled Eggs on Toast ($8), Açaí Bowls ($11), and Classic Pancakes ($10).";
  } else if (isMenuQuery) {
    reply = "We have Drinks, Breakfast all day, Lunch sandwiches and salads, and sweet Desserts. What category would you like to explore?";
  } else {
    // Helpful conversational fallback
    reply = "I'm here to help you order! You can ask about our drinks, sandwiches, vegan options, or simply tell me what you'd like to enjoy.";
  }

  return { reply, orderData };
}

// ─── POST /cancel ─────────────────────────────────────────────────────────────
app.post("/cancel", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) cancelSession(sessionId);
  res.json({ ok: true });
});

// ─── POST /transcribe (Fallback STT endpoint) ─────────────────────────────────
app.post("/transcribe", (req, res) => {
  // Web Speech API does real-time STT directly on client for free!
  // This endpoint prevents 404 if called by older clients
  res.json({ text: "" });
});

// ─── GET /api/config ──────────────────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
  res.json({
    mode: hasGemini ? "gemini" : "smart-free",
    geminiKeySet: hasGemini,
    menu: MENU
  });
});

// ─── POST /api/set-key (Allows user to optionally plug in a free Gemini key) ───
app.post("/api/set-key", (req, res) => {
  const { apiKey } = req.body;
  if (apiKey && typeof apiKey === "string") {
    process.env.GEMINI_API_KEY = apiKey.trim();
    console.log("✅ Updated GEMINI_API_KEY from UI");
    res.json({ ok: true, mode: "gemini" });
  } else {
    delete process.env.GEMINI_API_KEY;
    res.json({ ok: true, mode: "smart-free" });
  }
});

// ─── POST /chat ─ Supports both Gemini 1.5/2.0 Flash and Smart Free Brain ─────
app.post("/chat", async (req, res) => {
  const { messages, sessionId } = req.body;

  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  cancelSession(sessionId);

  // Setup SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let aborted = false;
  const sessionRecord = {
    abort: () => { aborted = true; }
  };
  activeSessions.set(sessionId, sessionRecord);

  const sendEvent = (data) => {
    if (!res.writableEnded && !aborted) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const lastUserMsg = messages?.length ? messages[messages.length - 1].content : "";
  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;

  // 1. If Gemini API key is available, try Gemini streaming
  if (apiKey && apiKey.length > 5) {
    try {
      const contents = (messages || []).map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      const requestBody = JSON.stringify({
        system_instruction: { parts: [{ text: MENU_CONTEXT }] },
        contents,
        generationConfig: { maxOutputTokens: 250, temperature: 0.7 },
      });

      const options = {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      };

      await new Promise((resolve, reject) => {
        const httpreq = https.request(options, (httpresp) => {
          if (httpresp.statusCode >= 400) {
            return reject(new Error(`Gemini API returned status ${httpresp.statusCode}`));
          }

          let fullText = "";
          let buffer = "";

          httpresp.on("data", (chunk) => {
            if (aborted) { httpresp.destroy(); return; }

            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (delta) {
                  fullText += delta;
                  sendEvent({ type: "text", delta });
                }
              } catch (_) {}
            }
          });

          httpresp.on("end", () => {
            if (!aborted) {
              // Check if order items were mentioned to update UI order card
              const { orderData } = smartCafeResponse(lastUserMsg + " " + fullText, messages);
              if (orderData) sendEvent({ type: "order", ...orderData });
              sendEvent({ type: "done", fullText });
            }
            if (!res.writableEnded) res.end();
            activeSessions.delete(sessionId);
            resolve();
          });

          httpresp.on("error", reject);
        });

        sessionRecord.abort = () => {
          aborted = true;
          try { httpreq.destroy(); } catch (_) {}
          if (!res.writableEnded) res.end();
          activeSessions.delete(sessionId);
          resolve();
        };

        httpreq.on("error", reject);
        httpreq.write(requestBody);
        httpreq.end();
      });

      return; // Successfully handled by Gemini
    } catch (err) {
      console.warn(`[Gemini warning: ${err.message}] Falling back to Smart Free Café Brain.`);
      // Fall through to Smart Free Café Brain below
    }
  }

  // 2. Smart Free Café Brain (Always works, zero latency, no API key needed!)
  const { reply, orderData } = smartCafeResponse(lastUserMsg, messages);
  if (orderData) {
    sendEvent({ type: "order", ...orderData });
  }

  // Stream words smoothly to simulate real-time AI generation
  const words = reply.split(" ");
  let wordIndex = 0;

  const streamInterval = setInterval(() => {
    if (aborted || res.writableEnded) {
      clearInterval(streamInterval);
      activeSessions.delete(sessionId);
      return;
    }

    if (wordIndex < words.length) {
      const delta = (wordIndex === 0 ? "" : " ") + words[wordIndex];
      sendEvent({ type: "text", delta });
      wordIndex++;
    } else {
      clearInterval(streamInterval);
      sendEvent({ type: "done", fullText: reply });
      if (!res.writableEnded) res.end();
      activeSessions.delete(sessionId);
    }
  }, 40);

  sessionRecord.abort = () => {
    aborted = true;
    clearInterval(streamInterval);
    if (!res.writableEnded) res.end();
    activeSessions.delete(sessionId);
  };
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mode: process.env.GEMINI_API_KEY ? "gemini" : "smart-free",
    activeSessions: activeSessions.size
  });
});

app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🎙️  TastyBot — 100% FREE AI Voice Waiter`);
  console.log(`   Server running: http://localhost:${PORT}`);
  console.log(`   Engine: ${process.env.GEMINI_API_KEY ? "Google Gemini Flash (Free Tier)" : "Smart Free Café Brain (No API Key Required)"}`);
  console.log(`   Voice Input (STT): Web Speech API (Free & Real-time)`);
  console.log(`   Voice Output (TTS): Web Speech Synthesis (Natural voices & Instant Barge-In)`);
  console.log(`=============================================================\n`);
});
