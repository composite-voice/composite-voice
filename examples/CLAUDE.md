# Examples

Each example is a self-contained React app using the composite-voice SDK and UI design system.

## Creating a new example
1. Copy structure from an existing example
2. Use `createExampleConfig()` from `_shared/vite.config.factory.ts`
3. Use `ExampleShell` and `VoiceAgent` from `_shared/` for consistent UI
4. Add to the examples README

## Running an example
```bash
cd examples/XX-example-name
pnpm dev
```

## Required: Build the SDK first
```bash
pnpm run build  # from root
```
