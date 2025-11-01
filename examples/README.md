# CompositeVoice Examples

This directory contains example applications demonstrating how to use the CompositeVoice SDK.

Each example is a separate **Nx application** within the monorepo workspace, configured to use the SDK as a workspace dependency.

## Available Examples

### 1. Basic Browser Example (`basic-browser/`)

A Vite-based browser application demonstrating CompositeVoice with:

- **Native browser STT** (Web Speech Recognition API)
- **OpenAI GPT** for natural language processing
- **Native browser TTS** (Speech Synthesis API)
- Modern UI with state visualization

**Running:**
```bash
# From workspace root
pnpm example:basic-browser:dev

# Or using nx directly
nx run example-basic-browser:dev
```

**Building:**
```bash
pnpm example:basic-browser:build
```

See [basic-browser/README.md](./basic-browser/README.md) for more details.

## Workspace Structure

All examples are part of the **Nx monorepo** and automatically depend on the root SDK package (`@lukeocodes/composite-voice`).

### How It Works

When you run an example:

1. **Nx checks dependencies**: Determines if the SDK needs to be rebuilt
2. **Builds SDK if needed**: Ensures the latest SDK changes are available
3. **Runs the example**: Starts the example application with the built SDK

This ensures examples **always use the latest local SDK changes** without manual rebuilding.

### Workspace Dependencies

Examples use the `workspace:*` protocol in their `package.json`:

```json
{
  "dependencies": {
    "@lukeocodes/composite-voice": "workspace:*"
  }
}
```

This tells pnpm to link to the local SDK package in the workspace.

## Adding New Examples

To add a new example application, follow the guide in [Nx Monorepo Setup](../docs/Nx%20Monorepo%20Setup.md#adding-new-examples).

### Quick Steps:

1. Create directory: `mkdir -p examples/my-example`
2. Add `package.json` with workspace dependency
3. Add `project.json` with Nx configuration
4. Add scripts to root `package.json`
5. Run `pnpm install`

## Common Tasks

### Running All Example Tests
```bash
nx run-many --target=test --projects=tag:type:example
```

### Building All Examples
```bash
nx run-many --target=build --projects=tag:type:example
```

### Viewing Dependency Graph
```bash
nx graph
```

This shows how examples depend on the SDK and each other.

## Requirements

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Modern browser with Web Audio API support
- Nx (installed as dev dependency)

## Benefits of Nx Structure

1. **Automatic dependency management**: SDK is built before examples
2. **Fast rebuilds**: Nx caches build outputs
3. **Affected commands**: Only rebuild what changed
4. **Single install**: `pnpm install` at root installs everything
5. **Consistent tooling**: Same commands across all examples

## Troubleshooting

### "Cannot find module '@lukeocodes/composite-voice'"

The SDK hasn't been built yet:

```bash
# From workspace root
pnpm build
```

Or just run the example - Nx will build the SDK automatically:

```bash
pnpm example:basic-browser:dev
```

### "Module not found" errors in examples

Install workspace dependencies:

```bash
# From workspace root
pnpm install
```

### Browser console errors

- Check that your browser supports the required APIs
- For Chrome, you may need to enable experimental features
- HTTPS is required for microphone access in production
- Make sure you've granted microphone permissions

### Nx cache issues

Clear the Nx cache:

```bash
nx reset
```

## Resources

- [Nx Monorepo Setup Documentation](../docs/Nx%20Monorepo%20Setup.md)
- [CompositeVoice Main README](../README.md)
- [Nx Documentation](https://nx.dev)
