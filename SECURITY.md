# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x (latest) | Yes |

Only the latest release receives security updates. Please update to the latest version before reporting.

---

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues.** Public disclosure before a fix is available puts all users at risk.

Instead, please create a [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new). This opens a private channel visible only to maintainers and allows us to coordinate a fix before any public disclosure.

### What to include

- A clear description of the vulnerability
- Steps to reproduce or a minimal proof-of-concept
- The potential impact (key theft, data exposure, code execution, etc.)
- Any mitigations or workarounds you're aware of

### What to expect

You will receive an acknowledgement promptly. We aim to triage all reports within **7 days** and release a fix within **30 days** of confirmed impact. We will credit reporters in the release notes unless you prefer to remain anonymous.

---

## API key security

CompositeVoice is a browser SDK. Any API key embedded directly in a browser bundle is visible to anyone who opens DevTools. **Never ship real API keys to the browser in production.**

### Recommended: server-side proxy

The built-in proxy middleware injects credentials server-side so the browser bundle contains zero secrets:

```typescript
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createExpressProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server);
```

Providers use `proxyUrl` instead of `apiKey`:

```typescript
const stt = new DeepgramSTT({ proxyUrl: '/proxy/deepgram', options: { ... } });
const llm = new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: '...' });
```

See [Example 04](./examples/04-proxy-server/) for a complete production setup.

### Alternative: origin restrictions

If deploying keys to the browser is unavoidable, restrict each key to specific origins in the provider dashboards:

- **Anthropic:** [console.anthropic.com](https://console.anthropic.com/)
- **Deepgram:** [console.deepgram.com](https://console.deepgram.com/)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

This limits the blast radius of an exposed key to requests originating from your domain.

### Development

For local development (where keys aren't exposed to the internet), placing them in a `.env` file is acceptable — provided `.env` is listed in `.gitignore`, which it is in this project by default.

---

## Proxy security checklist

When running the proxy middleware in production:

- Load API keys from environment variables only — never hard-code them in source files
- Restrict allowed origins using the `cors.origins` option if the proxy and front end are on separate origins
- Deploy the proxy behind HTTPS — never plain HTTP in production
- Set spending limits and rate limits on your provider dashboards
- Scope API keys to the minimum required permissions
- Monitor API usage on provider dashboards and set up alerts for unexpected spikes

---

## Dependencies

This project uses automated dependency scanning via [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot). Security-relevant updates are applied promptly.

If you notice an outdated or vulnerable dependency that Dependabot has not flagged, please report it through the private advisory process above.
