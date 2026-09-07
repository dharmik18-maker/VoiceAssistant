# TastyBot — AI Voice Waiter with Barge-In 🎙️🍽️

A browser-based voice assistant for "The Pixel Café" that supports **true barge-in** interruption — speak while the AI is talking and it stops **immediately**, cancels generation, and listens to you.

## Live Demo

[![Demo Video](https://img.shields.io/badge/Demo-Watch%20Video-red)](YOUR_VIDEO_LINK_HERE)

## Features

- 🎙️ **Browser mic input** — no plugins, just Web APIs
- 🧠 **Voice Activity Detection** — Silero VAD (WASM) runs in-browser
- ✍️ **Speech-to-Text** — OpenAI Whisper
- 🤖 **LLM Brain** — GPT-4o (streaming)
- 🔊 **Text-to-Speech** — OpenAI TTS (streaming audio chunks)
- ⚡ **True barge-in** — speak mid-sentence → AI stops instantly, server generation cancelled via AbortController
- 🍽️ **Domain** — Restaurant order taker for "The Pixel Café"

## Barge-In Architecture

```
Browser: VAD detects speech while AI is talking
  → Stop audio playback immediately (AudioBufferSourceNode.stop())
  → Drain audio queue
  → AbortController.abort() on the /chat SSE fetch
  → POST /cancel → server AbortController cancels OpenAI LLM + TTS streams
  → Listen for new input
```

No orphaned upstream requests. Tokens stop generating the moment you speak.

## Setup

### Prerequisites
- Node.js 18+
- OpenAI API key

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/voice-assistant.git
cd voice-assistant
npm install
```

### Configuration

```bash
# Copy env template
cp .env.example .env
# Edit .env and add your OpenAI API key
OPENAI_API_KEY=sk-...
```

### Run

```bash
npm start
# Open http://localhost:3000
```

## How to Use

1. Open `http://localhost:3000` in Chrome or Edge
2. Click **Start Conversation**
3. Grant microphone permission
4. Talk to TastyBot — ask about the menu, place an order
5. **Interrupt it mid-sentence** — TastyBot stops immediately!

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS |
| VAD | Silero VAD (`@ricky0123/vad-web`) |
| Backend | Node.js + Express |
| STT | OpenAI Whisper API |
| LLM | GPT-4o (streaming) |
| TTS | OpenAI TTS (`tts-1`) |
| Audio | Web Audio API |

## Project Structure

```
voice-assistant/
├── server.js          # Express backend (STT, LLM, TTS, cancel)
├── package.json
├── .env               # Your API key (not committed)
└── public/
    └── index.html     # Full frontend (VAD, barge-in, UI)
```
