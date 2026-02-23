# Security Policy

## Supported versions

Only the latest release receives security updates. If you're running an older version, please upgrade before reporting.

| Version        | Supported |
| -------------- | --------- |
| 0.1.x (latest) | Yes       |
| Earlier        | No        |

---

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.** A public report before a fix is available tells every potential attacker exactly what to exploit — and puts every person using this SDK at risk.

Instead, please open a [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new). This creates a private, encrypted channel visible only to the maintainer. It allows a fix to be developed, tested, and released before any public disclosure.

### What to include

The more detail you can provide, the faster the response. A useful report includes:

- A clear description of the vulnerability and what it allows an attacker to do
- Step-by-step reproduction instructions, or a minimal proof of concept
- The potential impact — credential theft, data exfiltration, denial of service, arbitrary code execution, financial abuse via API key misuse, etc.
- The affected version or versions
- Any mitigations or workarounds you've already identified or applied

You don't need a complete picture to report. If something looks wrong and you're not sure of the full impact, report what you have. An incomplete report is better than no report.

### Response timeline

- **48 hours** — acknowledgement of receipt
- **7 days** — triage completed, initial severity assessment
- **30 days** — fix released for confirmed vulnerabilities

You will be credited by name in the release notes unless you prefer to remain anonymous. Your identity and report details will not be shared without your explicit consent.

---

## API key security in browser SDKs

This is the most important security topic for CompositeVoice. Please read this section if you're deploying anything beyond a local demo.

### The problem: browser bundles are public

CompositeVoice runs in the browser. Any string embedded in a browser bundle — including API keys — is trivially visible to anyone who opens the browser DevTools Network tab or Sources panel. There is no client-side JavaScript technique that prevents this. Obfuscation, minification, and environment variables baked into the bundle at build time are all equally readable with five seconds of effort.

**Never ship real API keys to the browser in production.**

A leaked API key can result in unexpected charges, rate-limit exhaustion, or data exfiltration from third-party provider accounts. Most providers have no retroactive billing protection.

### Recommended approach: server-side proxy

The SDK includes built-in proxy middleware that keeps all credentials on your server. Your browser bundle contains zero secrets — it communicates with your proxy, which adds authentication before forwarding requests to the provider APIs.

**Server side** — credentials live here, loaded from environment variables, never from source files:

```typescript
// server.ts
import express from 'express';
import { createServer } from 'http';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
const server = createServer(app);

const proxy = createExpressProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server);

server.listen(3000);
```

**Browser side** — no API keys anywhere in this file:

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const stt = new DeepgramSTT({ proxyUrl: '/proxy/deepgram', options: { model: 'nova-3' } });
const llm = new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: 'claude-haiku-4-5-20251001' });
const tts = new DeepgramTTS({
  proxyUrl: '/proxy/deepgram',
  options: { model: 'aura-2-thalia-en' },
});

const agent = new CompositeVoice({ stt, llm, tts });
```

The browser communicates only with your server. Your server communicates with the provider APIs. Your API keys never leave your infrastructure.

See [examples/04-proxy-server](./examples/04-proxy-server/) for a complete, runnable implementation with detailed notes.

### Alternative: origin restrictions

If a server-side proxy isn't feasible, most providers let you restrict API keys to requests from specific origins. This limits an exposed key to traffic that appears to come from your domain.

Enable this in each provider's dashboard:

- **Anthropic:** [console.anthropic.com](https://console.anthropic.com/)
- **Deepgram:** [console.deepgram.com](https://console.deepgram.com/)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

Origin restrictions reduce the blast radius of an exposed key. They are a meaningful mitigation. However, they are not equivalent to keeping the key off the client — an attacker who can run code on your domain (e.g., via XSS), or who spoofs the `Origin` header, can still use the key. Treat this as a fallback defence, not a substitute for the proxy pattern.

**If you're using origin restrictions, also set spending limits.** Most providers offer configurable billing caps. A capped key that leaks has bounded financial exposure; an uncapped one does not.

### Local development

For local development, placing API keys in a `.env` file is fine. They're not accessible from the internet, and the `.gitignore` in this repository excludes `.env` files.

Copy the sample template from whichever example you're running:

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
# open .env and fill in your keys
```

Before committing, double-check that `.env` appears in `.gitignore`. Never commit a `.env` file to version control — even in a private repository, because private repositories can become public and git history is permanent.

---

## Production proxy security checklist

Before deploying the proxy server to production, verify all of the following:

- [ ] **Environment variables only** — API keys are loaded from environment variables, never hard-coded in source files or committed configuration files
- [ ] **HTTPS enforced** — the proxy runs behind HTTPS; credentials injected as HTTP headers are transmitted in plaintext over unencrypted connections
- [ ] **Spending limits set** — billing caps are configured on all provider dashboards (Anthropic, Deepgram, OpenAI); this bounds the financial impact if the proxy is abused
- [ ] **Minimum permissions** — API keys are scoped to the permissions actually required; don't use an admin key where a read-only key works
- [ ] **Usage monitoring** — API usage dashboards have alerts configured for unexpected spikes in requests or cost
- [ ] **CORS configured** — the proxy restricts which origins are permitted to make requests to it; `Access-Control-Allow-Origin: *` is not appropriate in production
- [ ] **Rate limiting applied** — the proxy or its reverse proxy applies per-client rate limiting to prevent abuse by a single user or bot
- [ ] **Access restricted** — the proxy is not directly accessible from the public internet except through your application; firewall rules or network policy enforce this
- [ ] **Logs audited** — access logs are retained and reviewed; unexpected access patterns are investigated

---

## Dependencies

This project uses [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot) for automated dependency vulnerability scanning. Security-relevant dependency updates are applied promptly after testing.

If you identify an outdated or vulnerable dependency that Dependabot has not flagged, please report it using the private Security Advisory process described above — don't open a public issue.
