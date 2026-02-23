# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x (latest) | Yes |

Older versions do not receive security updates. Please update to the latest release.

---

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in CompositeVoice, report it privately by creating a [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new). This keeps details private until a fix is ready and published.

Please include:

- A clear description of the vulnerability
- Steps to reproduce or a proof-of-concept
- The potential impact (data exposure, key theft, code execution, etc.)
- Any mitigations or workarounds you're aware of

You will receive an acknowledgement promptly. We aim to triage all reports and release a fix within **30 days**.

---

## API key security

CompositeVoice is a browser SDK. API keys embedded directly in a browser bundle are visible to anyone who opens DevTools. **Never ship real API keys to the browser in production.**

Your options:

1. **Server-side proxy** — use the built-in proxy middleware to inject keys server-side. The browser bundle contains zero secrets. See [Example 04](./examples/04-proxy-server/) and the [proxy documentation](./README.md#server-side-proxy).

2. **Origin restrictions** — restrict your keys to specific origins in the provider dashboards, so even if someone extracts a key it only works from your domain:
   - Anthropic: [console.anthropic.com](https://console.anthropic.com/)
   - Deepgram: [console.deepgram.com](https://console.deepgram.com/)
   - OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

For local development (where keys aren't exposed to the internet), embedding them in a `.env` file is acceptable — just make sure `.env` is in your `.gitignore`.

---

## Proxy security

When running `createExpressProxy` or another proxy adapter in production:

- Load API keys from environment variables only — never hard-code them
- Restrict allowed origins using the `cors.origins` option if your front end and proxy are on separate origins
- Run the proxy behind HTTPS in production
- Monitor usage on your provider dashboards; set spending limits and rate limits where available
- Scope API keys to the minimum required permissions

---

## Dependencies

This project uses automated dependency scanning via [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot). Security-relevant updates are applied promptly as they become available.

If you notice an outdated or vulnerable dependency that Dependabot has not flagged, please report it via the vulnerability process above.
