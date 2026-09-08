# TastyBot — 100% Free AI Voice Waiter with True Barge-In 🎙️🍽️

A fast, browser-based voice assistant for **"The Pixel Café"** that supports **true barge-in interruption** — speak while the AI is talking and it stops **immediately**, cancels generation, and listens to you.

**100% FREE** — No paid OpenAI subscription, no Whisper costs, no credit card required!

---
Live wesite Link-(https://voice-assistant-teal-theta.vercel.app/)

## 🚀 Features

- 🎙️ **100% Free Browser Speech Recognition (STT)** — Built-in Web Speech API (Chrome & Edge) with instant transcription and zero API cost.
- 🗣️ **100% Free Natural Text-to-Speech (TTS)** — Browser Web Speech Synthesis with natural system voices.
- ⚡ **True Instant Barge-In** — Start talking mid-sentence and TastyBot stops immediately (`speechSynthesis.cancel()` in <5ms), cancels backend stream, and listens to you.
- 🧠 **Dual AI Brain**:
  - **Smart Free Café Brain**: Built-in intelligent restaurant ordering engine that understands the full menu, takes orders, handles vegan/dietary requests, calculates totals, and confirms orders — works **out of the box with zero setup**.
  - **Google Gemini Free Tier (Optional)**: Drop in a free `GEMINI_API_KEY` (from [Google AI Studio](https://aistudio.google.com/)) for unrestricted conversational intelligence.
- 🧾 **Live Order & Receipt Tracking** — Real-time visual receipt updates as items are ordered with itemized breakdown and totals.
- 📊 **Dynamic Audio Waveform & VAD** — Real-time reactive audio visualizer.
- 🎬 **Built-in Screen & Demo Recorder** — Capture demo videos directly from the browser with audio.

---

## 🏛️ Architecture & Barge-In

```text
User speaks
  │
  ├─► Web Speech API (Free STT in browser)
  │     └─► onspeechstart: If TastyBot is speaking -> IMMEDIATE BARGE-IN!
  │           ├─► window.speechSynthesis.cancel() (stops voice in <5ms)
  │           ├─► AbortController.abort() (cancels streaming SSE)
  │           └─► POST /cancel (aborts server generation)
  │
  └─► POST /chat (SSE Stream)
        └─► Smart Free Café Engine or Gemini 1.5 Flash (Free Tier)
              ├─► Streams text tokens
              ├─► Emits live itemized order updates
              └─► Browser speaks aloud via Web Speech Synthesis
```

---

## 📦 Quick Start (Works in 30 Seconds)

### 1. Install dependencies
```bash
git clone https://github.com/dharmik18-maker/voice-assistant.git
cd voice-assistant
npm install
```

### 2. Start the server (No API key needed!)
```bash
npm start
```
Server runs at **`http://localhost:3000`**

### 3. (Optional) Use Free Google Gemini Flash
If you want unrestricted conversation, get a free API key at [Google AI Studio](https://aistudio.google.com/) (no credit card required) and add it to `.env`:
```env
GEMINI_API_KEY=AIzaSy...
PORT=3000
```

---

## 🍽️ The Pixel Café Menu

- **Drinks**: Espresso ($3.00), Cappuccino ($4.50), Latte ($5.00), Cold Brew ($5.50), Matcha Latte ($5.50), Fresh Orange Juice ($4.00), Sparkling Water ($2.00)
- **Breakfast**: Avocado Toast ($9.00) [VEGAN], Scrambled Eggs on Toast ($8.00), Açaí Bowl ($11.00), Classic Pancakes ($10.00)
- **Lunch**: Grilled Chicken Sandwich ($13.00), Mushroom & Brie Panini ($12.00), Caesar Salad ($11.00), Loaded Sweet Potato Fries ($8.00) [VEGAN]
- **Desserts**: Chocolate Lava Cake ($8.00), Cheesecake ($7.00), Vegan Brownie ($6.00) [VEGAN]

---

## 🛠️ Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| **STT (Speech-to-Text)** | Web Speech API (`SpeechRecognition`) | **FREE ($0.00)** |
| **TTS (Text-to-Speech)** | Web Speech API (`speechSynthesis`) | **FREE ($0.00)** |
| **Barge-In Engine** | Web Speech Events + AbortController | **FREE ($0.00)** |
| **AI Brain** | Smart Café Engine / Gemini 1.5 Flash | **FREE ($0.00)** |
| **Frontend** | Vanilla HTML5 / Modern CSS / ES6 | **FREE ($0.00)** |
| **Backend** | Node.js + Express (SSE Streaming) | **FREE ($0.00)** |
