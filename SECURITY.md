# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x (latest) | Yes |

Only the latest release receives security updates. If you're on an older version, please update before reporting.

---

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues.** Public disclosure before a fix is available puts all users at risk.

Instead, please create a [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new). This opens a private channel visible only to the maintainer, allowing us to coordinate a fix before any public disclosure.

### What to include in your report

The more detail you can provide, the faster we can respond:

- A clear description of the vulnerability and what it allows an attacker to do
- Steps to reproduce, or a minimal proof-of-concept
- The potential impact — key theft, data exposure, code execution, denial of service, etc.
- The affected version(s)
- Any mitigations or workarounds you've identified

### What to expect

You'll receive an acknowledgement promptly after submitting. We aim to:

- **Triage** all reports within **7 days** of receipt
- **Release a fix** within **30 days** of confirmed impact

We will credit you in the release notes unless you prefer to remain anonymous. We will not disclose your identity without your consent.

---

## API key security

CompositeVoice is a browser SDK. Any API key embedded directly in a browser bundle is visible to anyone who opens DevTools. **Never ship real API keys to the browser in production.**

### Recommended: server-side proxy

The built-in proxy middleware keeps credentials on the server. The browser bundle contains zero secrets:

```typescript
// server.ts
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createExpressProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server);
```

```typescript
// browser — no API keys anywhere in this code
const stt = new DeepgramSTT({ proxyUrl: '/proxy/deepgram', options: { ... } });
const llm = new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: '...' });
```

See [Example 04](./examples/04-proxy-server/) for a complete, runnable production setup.

### Alternative: origin restrictions

If shipping keys to the browser is unavoidable in your situation, restrict each key to specific origins in the provider dashboard:

- **Anthropic:** [console.anthropic.com](https://console.anthropic.com/)
- **Deepgram:** [console.deepgram.com](https://console.deepgram.com/)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

This limits the blast radius of an exposed key to requests from your domain. It's not a substitute for the proxy pattern — it's a fallback.

### Local development

For local development (where keys aren't exposed to the internet), placing them in a `.env` file is fine — provided `.env` is in `.gitignore`, which it is by default in this project. All examples include a `sample.env` template.

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
# Edit the .env file and add your keys
```

---

## Proxy security checklist

When running the proxy in production, verify all of these:

- [ ] API keys are loaded from environment variables — never hard-coded in source files
- [ ] The server runs behind HTTPS — keys are injected as HTTP headers which are plaintext over plain HTTP
- [ ] Spending limits are set on all provider dashboards (Anthropic, Deepgram)
- [ ] API keys are scoped to the minimum required permissions
- [ ] API usage is monitored and alerts are configured for unexpected spikes
- [ ] If the proxy and front end are on different origins, `cors.origins` is configured appropriately
- [ ] Rate limiting is applied at the proxy or reverse proxy level to prevent abuse

---

## Dependencies

This project uses automated dependency scanning via [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot). Security-relevant dependency updates are applied promptly.

If you notice an outdated or vulnerable dependency that Dependabot hasn't flagged, please report it using the private advisory process above.
