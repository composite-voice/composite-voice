import {
  Heading,
  Text,
  Code,
  CodeBlock,
  CodeTabs,
  Blockquote,
  Kbd,
  Mark,
  Prose,
  BrandName,
} from "composite-voice-ui";

const tsExample = `import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from "composite-voice";

const voice = new CompositeVoice({
  providers: [
    new DeepgramSTT({ proxyUrl: "/api/proxy/deepgram" }),
    new AnthropicLLM({ proxyUrl: "/api/proxy/anthropic", model: "claude-sonnet-4-20250514" }),
    new DeepgramTTS({ proxyUrl: "/api/proxy/deepgram" }),
  ],
});

voice.on("transcription.speechFinal", ({ text }) => {
  console.log("User said:", text);
});

await voice.initialize();
await voice.startListening();`;

const jsExample = `const { CompositeVoice, OpenAILLM, NativeTTS } = require("composite-voice");

const voice = new CompositeVoice({
  providers: [
    new OpenAILLM({ proxyUrl: "/api/proxy/openai", model: "gpt-4o" }),
    new NativeTTS(),
  ],
});

voice.on("transcription.speechFinal", ({ text }) => {
  console.log("User said:", text);
});

await voice.initialize();
await voice.startListening();`;

const bashExample = `pnpm add composite-voice`;

const cssExample = `@theme {
  --color-primary-500: oklch(0.637 0.237 25.331);
  --color-surface: light-dark(#ffffff, #09090b);
  --color-surface-sunken: light-dark(#fafafa, #18181b);
}`;

export default function CodeProseShowcase() {
  return (
    <div className="space-y-12">
      {/* 1. Inline Code */}
      <section className="space-y-4">
        <Heading level={2}>Inline Code</Heading>
        <Text color="muted">
          The <Code>Code</Code> component renders inline code snippets within
          prose text. It uses a monospaced font with a subtle background to
          distinguish code from surrounding text.
        </Text>
        <div className="space-y-3">
          <Text>
            Install the package with <Code>pnpm add composite-voice</Code> and
            import <Code>CompositeVoice</Code> from the main entry point.
          </Text>
          <Text>
            Call <Code>voice.initialize()</Code> then{" "}
            <Code>voice.startListening()</Code> to begin a session, and{" "}
            <Code>voice.dispose()</Code> to end it. Events are typed via{" "}
            <Code>CompositeVoiceEvent</Code>.
          </Text>
        </div>
      </section>

      {/* 2. Code Block */}
      <section className="space-y-4">
        <Heading level={2}>Code Block</Heading>
        <Text color="muted">
          Full code blocks with syntax highlighting powered by
          prism-react-renderer. Colors adapt to light and dark mode via CSS
          variable tokens.
        </Text>

        <Heading level={3}>Basic</Heading>
        <CodeBlock code={tsExample} language="tsx" />

        <Heading level={3}>With title</Heading>
        <CodeBlock
          code={tsExample}
          language="tsx"
          title="src/app.ts"
        />

        <Heading level={3}>With line numbers</Heading>
        <CodeBlock
          code={tsExample}
          language="tsx"
          showLineNumbers
          title="src/app.ts"
        />

        <Heading level={3}>CSS example</Heading>
        <CodeBlock code={cssExample} language="css" title="theme.css" />

        <Heading level={3}>Bash / Shell</Heading>
        <CodeBlock code={bashExample} language="bash" title="Terminal" />
      </section>

      {/* 3. Code Tabs */}
      <section className="space-y-4">
        <Heading level={2}>Code Tabs</Heading>
        <Text color="muted">
          Tabbed code blocks for showing the same concept in multiple languages.
          Uses WAI-ARIA tablist pattern with arrow key navigation.
        </Text>

        <CodeTabs
          tabs={[
            { label: "TypeScript", code: tsExample, language: "tsx" },
            { label: "JavaScript", code: jsExample, language: "javascript" },
            { label: "Terminal", code: bashExample, language: "bash" },
          ]}
        />

        <Heading level={3}>With line numbers</Heading>
        <CodeTabs
          tabs={[
            { label: "TypeScript", code: tsExample, language: "tsx" },
            { label: "CSS", code: cssExample, language: "css" },
          ]}
          showLineNumbers
        />
      </section>

      {/* 4. Blockquote */}
      <section className="space-y-4">
        <Heading level={2}>Blockquote</Heading>
        <Text color="muted">
          Styled block quotations with optional citation and Schema.org markup.
          Three visual variants available.
        </Text>

        <Heading level={3}>Default</Heading>
        <Blockquote>
          The best way to predict the future is to invent it.
        </Blockquote>

        <Heading level={3}>With citation</Heading>
        <Blockquote cite="Alan Kay">
          The best way to predict the future is to invent it.
        </Blockquote>

        <Heading level={3}>With citation URL</Heading>
        <Blockquote
          cite="Alan Kay"
          citeUrl="https://en.wikipedia.org/wiki/Alan_Kay"
        >
          The best way to predict the future is to invent it.
        </Blockquote>

        <Heading level={3}>Variants</Heading>
        <div className="space-y-4">
          <Blockquote variant="default" cite="Default variant">
            This uses the primary color scheme for the left border and
            background tint.
          </Blockquote>
          <Blockquote variant="accent" cite="Accent variant">
            This uses the accent color scheme, great for highlighting important
            quotations.
          </Blockquote>
          <Blockquote variant="subtle" cite="Subtle variant">
            This uses neutral tones for a more understated appearance within
            documentation.
          </Blockquote>
        </div>
      </section>

      {/* 5. Kbd */}
      <section className="space-y-4">
        <Heading level={2}>Keyboard Shortcuts</Heading>
        <Text color="muted">
          The <Code>Kbd</Code> component renders keyboard key indicators that
          mimic physical key appearance.
        </Text>

        <div className="space-y-3">
          <Text>
            Press <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> to copy text.
          </Text>
          <Text>
            Use <Kbd>Cmd</Kbd> + <Kbd>Shift</Kbd> + <Kbd>P</Kbd> to open the
            command palette.
          </Text>
          <Text>
            Navigate with <Kbd>Tab</Kbd> and <Kbd>Shift</Kbd> +{" "}
            <Kbd>Tab</Kbd> for reverse direction.
          </Text>
          <Text>
            Press <Kbd>Esc</Kbd> to close a modal or <Kbd>Enter</Kbd> to
            confirm.
          </Text>
        </div>
      </section>

      {/* 6. Mark */}
      <section className="space-y-4">
        <Heading level={2}>Highlighted Text</Heading>
        <Text color="muted">
          The <Code>Mark</Code> component draws attention to specific text with
          a colored highlight background.
        </Text>

        <div className="space-y-3">
          <Text>
            The <Mark><BrandName /> SDK</Mark> provides a unified API for
            voice-driven applications.
          </Text>
          <Text>
            Status:{" "}
            <Mark variant="success">Connected</Mark> |{" "}
            <Mark variant="warning">Reconnecting</Mark> |{" "}
            <Mark variant="info">3 events queued</Mark>
          </Text>
        </div>

        <Heading level={3}>Variants</Heading>
        <div className="flex flex-wrap gap-3">
          <Mark variant="default">Default</Mark>
          <Mark variant="success">Success</Mark>
          <Mark variant="warning">Warning</Mark>
          <Mark variant="info">Info</Mark>
        </div>
      </section>

      {/* 7. Prose */}
      <section className="space-y-4">
        <Heading level={2}>Prose</Heading>
        <Text color="muted">
          The Prose component applies consistent typography styles to arbitrary
          HTML content. Wrap markdown-rendered or CMS content in Prose and all
          child elements receive appropriate spacing, sizing, and color.
        </Text>

        <Heading level={3}>Default size</Heading>
        <div className="border border-neutral-200 rounded-card p-6">
          <Prose>
            <h2>Getting Started</h2>
            <p>
              <BrandName /> is a <strong>modular voice SDK</strong> that
              connects speech-to-text, language models, and text-to-speech into a
              seamless pipeline. It supports both <em>browser-native</em> and
              cloud-based providers.
            </p>
            <h3>Installation</h3>
            <p>
              Install with your preferred package manager. You can use{" "}
              <code>npm</code>, <code>pnpm</code>, or <code>yarn</code>.
            </p>
            <ul>
              <li>Provider-agnostic architecture</li>
              <li>Event-driven with typed events</li>
              <li>Conversation history with configurable turn limits</li>
              <li>WebSocket reconnection with exponential backoff</li>
            </ul>
            <h3>Features</h3>
            <ol>
              <li>Real-time speech-to-text transcription</li>
              <li>Streaming LLM responses</li>
              <li>Natural text-to-speech output</li>
            </ol>
            <blockquote>
              The best voice experiences feel like natural conversation, not
              command-and-control interfaces.
            </blockquote>
            <p>
              Visit the{" "}
              <a href="https://github.com/composite-voice/composite-voice">
                GitHub repository
              </a>{" "}
              for full documentation.
            </p>
            <hr />
            <p>
              <strong>Note:</strong> This SDK requires a modern browser with
              support for the <code>MediaRecorder</code> API.
            </p>
          </Prose>
        </div>

        <Heading level={3}>Small size</Heading>
        <div className="border border-neutral-200 rounded-card p-6">
          <Prose size="sm">
            <h3>Quick Reference</h3>
            <p>
              The <code>CompositeVoice</code> class is the main entry point.
              Call <code>voice.initialize()</code> then{" "}
              <code>voice.startListening()</code> to begin a session, and{" "}
              <code>voice.dispose()</code> to end it.
            </p>
            <ul>
              <li>
                <strong>STT:</strong> DeepgramSTT, AssemblyAISTT, ElevenLabsSTT, NativeSTT
              </li>
              <li>
                <strong>LLM:</strong> AnthropicLLM, OpenAILLM, GroqLLM, GeminiLLM, MistralLLM, WebLLMLLM
              </li>
              <li>
                <strong>TTS:</strong> DeepgramTTS, OpenAITTS, ElevenLabsTTS, CartesiaTTS, NativeTTS
              </li>
            </ul>
          </Prose>
        </div>

        <Heading level={3}>Large size</Heading>
        <div className="border border-neutral-200 rounded-card p-6">
          <Prose size="lg">
            <h2>Why <BrandName />?</h2>
            <p>
              Building voice interfaces shouldn't require gluing together
              incompatible APIs. <BrandName /> provides a{" "}
              <strong>unified abstraction</strong> that lets you swap providers
              without changing application code.
            </p>
            <p>
              Whether you need <em>real-time transcription</em>,{" "}
              <em>streaming LLM responses</em>, or{" "}
              <em>natural-sounding speech</em>, the SDK handles the complexity
              so you can focus on building great experiences.
            </p>
          </Prose>
        </div>

        <Heading level={3}>With tables</Heading>
        <div className="border border-neutral-200 rounded-card p-6">
          <Prose>
            <h3>Provider Comparison</h3>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Type</th>
                  <th>Latency</th>
                  <th>Quality</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>DeepgramSTT</td>
                  <td>Cloud (WebSocket)</td>
                  <td>~200ms</td>
                  <td>Excellent</td>
                </tr>
                <tr>
                  <td>NativeSTT</td>
                  <td>Browser</td>
                  <td>~400ms</td>
                  <td>Good</td>
                </tr>
                <tr>
                  <td>AnthropicLLM</td>
                  <td>Cloud (SSE)</td>
                  <td>~300ms TTFT</td>
                  <td>Excellent</td>
                </tr>
              </tbody>
            </table>
          </Prose>
        </div>
      </section>

      {/* 8. Combining Components */}
      <section className="space-y-4">
        <Heading level={2}>Combining Components</Heading>
        <Text color="muted">
          These components work naturally together within prose or standalone
          contexts.
        </Text>

        <div className="border border-neutral-200 rounded-card p-6 space-y-4">
          <Text>
            To start a voice session, call <Code>voice.initialize()</Code> then <Code>voice.startListening()</Code> in your
            component. Press <Kbd>Ctrl</Kbd> + <Kbd>M</Kbd> to toggle the
            microphone.
          </Text>

          <CodeBlock
            code={`voice.on("transcription.speechFinal", ({ text }) => {
  console.log("User said:", text);
});`}
            language="typescript"
          />

          <Blockquote variant="subtle">
            Tip: Use the <Code>conservative</Code> turn-taking strategy for
            noisy environments.
          </Blockquote>

          <Text>
            The <Mark variant="success">eager pipeline</Mark> feature sends
            partial transcripts to the LLM for <Mark variant="info">speculative
            generation</Mark>, reducing perceived latency by up to 40%.
          </Text>
        </div>
      </section>
    </div>
  );
}
