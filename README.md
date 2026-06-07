# BavarianTranslator 🇩🇪⇄🇬🇧

A real-time, two-way **conversation translator** between a **German speaker (Bavarian dialect)** and an **English speaker** — built with Expo / React Native.

The screen is split in two halves:

- **Top half — Deutsch · Oma** (larger text, can be flipped upside-down for face-to-face).
- **Bottom half — English.**

Each person taps their mic, speaks, and the conversation appears **in both languages at once**. The translation can be **spoken aloud automatically** — and German can be slowed down to **half speed** so an elderly listener can follow.

## What makes it good for Bavarian

- **Understanding Bavarian:** speech is sent to a **pluggable translation engine** (Google **Gemini** by default), prompted to expect and correctly interpret **Bavarian dialect** (Boarisch) — `Servus`, `fei`, `gell`, `a bissl`, `ned/nix`, `Bua`, `Brotzeit`, `dahoam`, `passt scho`, `-erl` diminutives, and so on. Each line is tagged **`Bairisch`** when dialect was detected. This is the part that off-the-shelf tools usually fail at, and it works well here. You can switch engines (Gemini · Groq · Mistral) and models from **Settings → Translation engine** — see below.
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

Every model listed was tested to **work for free on the user's own key** — no credit card, no prepaid balance. Each shows a **quality score** (estimate for Bavarian, 0–100, comparable across providers) and a rough **quota** tag. **Tags:** `FREE` = free within daily limits, no card; `FREE TIER` = free allowance on a paid platform.

| Engine | Tier | How it works | Get a key |
| --- | --- | --- | --- |
| **Google Gemini** *(default)* | FREE | Single multimodal model hears the audio + translates. `2.5 Flash` (**82**, ~20/day, default) or `2.5 Flash-Lite` (**72**, faster but more erratic). Both hear the audio directly, so they genuinely differ. Presumed **best Bavarian**, but its real-dialect score is *pending* (quota was exhausted during the real-audio retest). | https://aistudio.google.com/apikey |
| **Groq** (Whisper + Llama) | FREE | Whisper transcribes, then a model translates. All models share the **same** Whisper step, so they only differ in cleanup: `Llama 3.3 70B` (**70**) > `Llama 4 Scout` (**67**) > `Qwen3 32B` (**65**). **Whisper proved robust on real Bavarian** (incl. spontaneous dialect) — plus a huge free quota, making this the best practical everyday engine. | https://console.groq.com/keys |
| **Mistral** (Voxtral) | FREE TIER | Voxtral transcribes, then a model translates. Shared Voxtral step: `Mistral Large` (**60**) > `Mistral Small` (**56**). Excellent on clear German, but Voxtral still **slips on spontaneous dialect** (misheard "Bairisch" as "a little German"), so it sits below Groq. European; free experiment tier. | https://console.mistral.ai/api-keys |

*Scores (0–100, Bavarian-weighted, comparable across providers) were **updated 2026-06-07 from real-audio testing** — real German/Bavarian YouTube clips (standard "Easy German", a grandma reading a fairy tale, and spontaneous Bavarian dialect), not the earlier synthetic `say` voice. That synthetic voice had unfairly punished the two-step engines; on real audio **Groq/Whisper proved robust even on spontaneous dialect** (so Groq jumped from ~57 to 70), while **Mistral/Voxtral is great on clear German but still slips on dialect** (a "Bairisch" → "a little German" mishearing), keeping it below Groq. **Gemini's scores are unchanged and still UNCONFIRMED on real dialect** — its free quota was exhausted during the retest, so a real three-way head-to-head is pending. Within Groq/Mistral the models share one transcribe step, so the per-model spread is small.*

*Removed: **OpenAI** (paid-only) and **OpenRouter** (every model — even its `:free` ones — needs a ≥$0.50 prepaid balance for audio, so none work on a $0 key). **Gemini 2.5 Pro** is omitted too — it's paid-only on the free tier.* Each engine has a **Custom model id** field for any other model its key can reach.

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

- **Internet required** for translation (the engine is a cloud call). Errors and timeouts now show an on-screen toast (red = needs attention, yellow = soft "didn't catch that").
- **Automatic failover on rate limits.** If a model hits its quota (or times out), the app instantly retries with the next best model — other models in the same engine first (Gemini's two have *separate* daily quotas), then another engine — and shows a brief "⚡ switched to …" note. The exhausted model is **greyed out in Settings with a countdown**, then retried automatically; because selection is always "your preferred engine if available, else the best one that is," it **switches back on its own** when the limit clears. The cooldown length is taken from the API's own signal: a `Retry-After` header is honored exactly, a per-minute throttle (e.g. Mistral free = 4 req/min) waits ~90s, and only a true per-day quota (e.g. Gemini free ~20/day) waits the full hour. You can also **tap a greyed model/engine to retry it immediately**.
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
  ├ gemini.ts groq.ts mistral.ts
  └ index.ts                #   registry + translateAudio() facade
src/services/tts.ts         # expo-speech (slow German) + optional ElevenLabs
src/components/Pane.tsx      # one language half (transcript + mic)
src/components/SettingsSheet.tsx
```
