# Example Generation Agent Instructions

## Purpose
Each example is a self-contained React + Vite app demonstrating a specific SDK feature or provider.

## Structure
Every example follows this structure:
- `src/App.tsx` — Main example component (unique per example)
- `src/main.tsx` — Copy from `_shared/main.tsx`
- `index.html` — Copy from `_shared/index.html`, replace %TITLE%
- `vite.config.ts` — Import `createExampleConfig` from `_shared/`
- `package.json` — Based on `_shared/package.template.json`
- `sample.env` — Required API keys
- `README.md` — What the example demonstrates

## Rules
1. Use the design system: import from `composite-voice-ui`
2. Import `composite-voice-ui/theme.css` in the entry point
3. Use `ExampleShell` from `_shared/ExampleShell.tsx` for consistent layout
4. Use `VoiceAgent` from `_shared/VoiceAgent.tsx` for the standard voice UI
5. Only create a backend when demonstrating the proxy server
6. Port = base port from vite config (set in createExampleConfig)
7. All API keys come from the root .env via Vite proxy — never expose keys
