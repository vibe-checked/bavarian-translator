# BavarianTranslator 🇩🇪⇄🇬🇧

A real-time, two-way **conversation translator** between a **German speaker (Bavarian dialect)** and an **English speaker** — built with Expo / React Native.

The screen is split in two halves:

- **Top half — Deutsch · Oma** (larger text, can be flipped upside-down for face-to-face).
- **Bottom half — English.**

Each person taps their mic, speaks, and the conversation appears **in both languages at once**. The translation can be **spoken aloud automatically** — and German can be slowed down to **half speed** so an elderly listener can follow.

## What makes it good for Bavarian

- **Understanding Bavarian:** speech is sent to a **pluggable translation engine** (Google **Gemini** by default), prompted to expect and correctly interpret **Bavarian dialect** (Boarisch) — `Servus`, `fei`, `gell`, `a bissl`, `ned/nix`, `Bua`, `Brotzeit`, `dahoam`, `passt scho`, `-erl` diminutives, and so on. Each line is tagged **`Bairisch`** when dialect was detected. This is the part that off-the-shelf tools usually fail at, and it works well here. You can switch engines (Gemini → Groq → OpenAI) and models from **Settings → Translation engine** — see below.
- **Speaking German:** the built-in voice is clear Standard German with adjustable speed (great for Oma). True spoken-Bavarian output isn't something standard text-to-speech can do — but **Austrian (de-AT) voices sound noticeably closer to Bavarian**, so the voice picker surfaces them first. For an authentic Bavarian *voice*, you can optionally plug in **ElevenLabs** with a cloned Bavarian voice (see below).

## Prerequisites

- macOS with **Xcode** installed (for the iPhone dev build).
- **Node 18+** (you have v22).
- A **free Gemini API key** → https://aistudio.google.com/apikey (no credit card).

## Setup

```bash
cd ~/Desktop/BavarianTranslator
npm install          # already done during scaffolding
```

Add an API key one of two ways:

1. **Easiest:** run the app, tap ⚙︎ → *Translation engine* → pick an engine and paste its key. Saved on the device.
2. Or copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_GEMINI_API_KEY` to pre-seed the default Gemini key (requires a rebuild to pick up). Keys for the other engines are entered in-app.

## Translation engines (pluggable)

Switch in **Settings → Translation engine**. Each engine keeps its own key and model; the choice is remembered.

| Engine | Tier | How it works | Get a key |
| --- | --- | --- | --- |
| **Google Gemini** *(default)* | Free | Sends audio straight to `gemini-2.5-flash` (or 2.5 Flash-Lite / 2.0 Flash). Best Bavarian understanding via prompting. | https://aistudio.google.com/apikey |
| **Groq** (Whisper + Llama) | Free | Whisper (`whisper-large-v3-turbo`) transcribes, then your chosen Llama model translates with Bavarian cleanup. Very fast, generous quota. | https://console.groq.com/keys |
| **Mistral** (Voxtral) | Free tier | Voxtral (`voxtral-mini-latest`) transcribes, then a Mistral model translates with Bavarian cleanup. European provider, free experiment tier. | https://console.mistral.ai/api-keys |
| **OpenRouter** (many models) | Free tier / pay | One key, then pick **any audio-capable** model id (`google/gemini-2.5-flash`, `openai/gpt-4o-audio-preview`, free models…) from openrouter.ai/models. | https://openrouter.ai/keys |
| **OpenAI** (GPT-4o audio) | Paid (cheap) | Sends audio to `gpt-4o-mini-audio-preview` / `gpt-4o-audio-preview`. Strong dialect handling. | https://platform.openai.com/api-keys |

Each engine also has a **Custom model id** field, so if a model gets renamed you can type the new id without waiting for an update.

**Adding another engine** is a small, self-contained change: create `src/services/providers/<name>.ts` implementing the `TranslationProvider` interface (one `translate()` method returning `{ detected, bavarian, de, en }`), then add it to the `PROVIDERS` array in `src/services/providers/index.ts`. It appears in Settings automatically.

## Run it on your iPhone (development build)

Plug your iPhone in (or have a simulator), then:

```bash
npx expo run:ios --device     # pick your iPhone from the list
```

The first build takes a few minutes (it compiles a native dev client). After that, JS changes hot-reload instantly. To rebuild only when native config changes:

```bash
npx expo prebuild     # regenerates the native ios/ project from app.json
```

> Microphone permission is requested on first record. It's declared in `app.json` via the `expo-audio` plugin.

## Three modes — 👆 Tap · 🔁 Auto · 🔴 Live

Switch with the **Tap | Auto | Live** control in the center bar.

**👆 Tap (button per turn) — most reliable:**
1. **Oma speaks:** tap the red **🎤 Sprechen** button (top), she talks (Bavarian is fine), tap **■ Fertig**. Her words appear in German up top and the English translation appears below — and the English is spoken aloud for you.
2. **You speak:** tap the blue **🎤 Speak** button (bottom), talk, tap **■ Done**. Your English appears below and the German translation appears up top — and it's **spoken slowly in German** for Oma.

**🔁 Auto (always listening, turn-based, speaks aloud):**
- Just talk. The app listens continuously, detects a turn when someone speaks and then pauses (~1s of silence), figures out **who spoke by language**, and translates + **speaks it aloud** automatically. A live **level meter** and status (👂 Listening · 🌐 Translating · 🔊 Speaking) show what it's doing.
- It's **half-duplex on purpose**: while it's speaking a translation it stops listening, so it never hears and re-translates its own voice. Wait for the spoken translation to finish before the next person talks. Best for **back-and-forth conversation** where Oma needs to *hear* the German.

**🔴 Live (always listening, streams text as you speak):**
- Translations appear **while the person is still talking** — it cuts on short pauses (~0.5s) or every few seconds in a run-on, translates each chunk, and **streams the text** into both panes in order. Best for **following a longer story** without waiting for them to finish.
- **Text only — it does not speak aloud.** Speaking each chunk while the mic stays open would echo into the mic and translate its own voice. Tap any line to hear it, or use Auto when you want spoken output.

**Sensitivity (Auto + Live):** if it cuts people off or misses a quiet talker, lower **sensitivity** to *Sensitive* in Settings; if it triggers on room noise, raise it to *Strict*.

**All modes:**
- **Replay** any line by tapping its bubble (🔊).
- **🐢 Slow German** toggle (center bar) flips slow speech on/off instantly.
- **⚙︎ Settings:** translation engine + key, German slow-speed presets, voice pickers, **Face-to-face mode** (flips the German half so Oma reads it across the table), auto-speak, **Auto-mode sensitivity**, and ElevenLabs.

## Optional: authentic Bavarian voice via ElevenLabs

1. Create a voice at https://elevenlabs.io (you can **clone a Bavarian speaker** from a short sample — even a recording of Oma or a Bavarian friend).
2. In ⚙︎ Settings → *ElevenLabs voice*: turn on **Use ElevenLabs for German**, paste your API key and the **voice ID**.
3. German translations will then speak in that voice (slowed when *Slow German* is on). English stays on the free built-in voice.

## Notes & honest limitations

- **Internet required** for translation (the engine is a cloud call). Free tiers have generous limits; if you hit one you'll see a friendly “try again in a moment” notice.
- Two modes: **Tap** (button per turn — most reliable) and **Auto** (always-listening, hands-free). Auto is half-duplex (one person at a time) and relies on silence detection, so it shines in a quiet room and a calm back-and-forth.
- **Bavarian comprehension is strong; Bavarian voice *output* is approximate** unless you use the ElevenLabs option. This is a real limitation of available speech engines, not a bug.

## Project layout

```
App.tsx                     # split-screen UI + conversation flow
src/types.ts                # Utterance + Settings types, defaults
src/hooks/useRecorder.ts    # 16 kHz mono WAV recording + mic metering (expo-audio)
src/hooks/useAutoListener.ts # always-listening VAD loop (silence-segmented turns)
src/hooks/useSettings.ts    # persisted settings (AsyncStorage)
src/services/providers/     # pluggable translation engines
  ├ types.ts                #   TranslationProvider interface
  ├ prompt.ts               #   shared Bavarian-aware prompt + JSON parsing
  ├ gemini.ts groq.ts mistral.ts openrouter.ts openai.ts
  └ index.ts                #   registry + translateAudio() facade
src/services/tts.ts         # expo-speech (slow German) + optional ElevenLabs
src/components/Pane.tsx      # one language half (transcript + mic)
src/components/SettingsSheet.tsx
```
