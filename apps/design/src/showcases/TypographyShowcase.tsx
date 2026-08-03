import { Heading, Text } from "composite-voice-ui";

export default function TypographyShowcase() {
  return (
    <div className="space-y-12">
      {/* 1. Heading Scale */}
      <section className="space-y-4">
        <Heading level={2}>Heading Scale</Heading>
        <Text color="muted">
          All six heading levels rendered at their default sizes. The semantic
          level determines the HTML element (h1–h6), while the size prop can
          override the visual scale independently.
        </Text>
        <div className="space-y-3">
          <Heading level={1}>Heading Level 1</Heading>
          <Heading level={2}>Heading Level 2</Heading>
          <Heading level={3}>Heading Level 3</Heading>
          <Heading level={4}>Heading Level 4</Heading>
          <Heading level={5}>Heading Level 5</Heading>
          <Heading level={6}>Heading Level 6</Heading>
        </div>
        <Text color="muted">
          Visual size can differ from semantic level. Below is an h2 element
          rendered at xl size:
        </Text>
        <Heading level={2} size="xl">
          h2 with size=&quot;xl&quot;
        </Heading>
      </section>

      {/* 2. Text Sizes */}
      <section className="space-y-4">
        <Heading level={2}>Text Sizes</Heading>
        <Text color="muted">
          The Text component supports six size values that map to the type scale.
        </Text>
        <div className="space-y-2">
          <Text size="xs">
            xs — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="sm">
            sm — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="base">
            base — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="lg">
            lg — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="xl">
            xl — The quick brown fox jumps over the lazy dog.
          </Text>
          <Text size="2xl">
            2xl — The quick brown fox jumps over the lazy dog.
          </Text>
        </div>
      </section>

      {/* 3. Font Weights */}
      <section className="space-y-4">
        <Heading level={2}>Font Weights</Heading>
        <Text color="muted">
          Four weight values control the visual heaviness of text.
        </Text>
        <div className="space-y-2">
          <Text weight="normal">normal — Regular body text weight.</Text>
          <Text weight="medium">medium — Slightly heavier for emphasis.</Text>
          <Text weight="semibold">
            semibold — Used for labels and sub-headings.
          </Text>
          <Text weight="bold">bold — Strong emphasis and key values.</Text>
        </div>
      </section>

      {/* 4. Text Colors */}
      <section className="space-y-4">
        <Heading level={2}>Text Colors</Heading>
        <Text color="muted">
          Semantic color tokens keep text consistent across themes.
        </Text>
        <div className="space-y-2">
          <Text color="default">default — Primary content color.</Text>
          <Text color="muted">muted — De-emphasized or secondary text.</Text>
          <Text color="primary">primary — Brand primary color.</Text>
          <Text color="secondary">secondary — Brand secondary color.</Text>
          <Text color="accent">accent — Accent highlights.</Text>
          <Text color="success">success — Positive outcomes.</Text>
          <Text color="warning">warning — Caution or attention needed.</Text>
          <Text color="danger">danger — Errors or destructive actions.</Text>
          <Text color="info">info — Informational context.</Text>
          <Text color="inherit">inherit — Inherits from parent element.</Text>
        </div>
      </section>

      {/* 5. Semantic Text Elements */}
      <section className="space-y-4">
        <Heading level={2}>Semantic Text Elements</Heading>
        <Text color="muted">
          The &quot;as&quot; prop changes the underlying HTML element while
          preserving Text styling. Each element carries semantic meaning for
          accessibility and SEO.
        </Text>
        <div className="space-y-3">
          <div>
            <Text as="p">
              &lt;p&gt; — Standard paragraph element for blocks of text.
            </Text>
          </div>
          <div>
            <Text as="strong">
              &lt;strong&gt; — Strong importance, typically rendered bold.
            </Text>
          </div>
          <div>
            <Text as="em">
              &lt;em&gt; — Emphasis, typically rendered italic.
            </Text>
          </div>
          <div>
            <Text as="small">
              &lt;small&gt; — Fine print and side comments.
            </Text>
          </div>
          <div>
            <Text as="mark">
              &lt;mark&gt; — Highlighted or marked text for reference.
            </Text>
          </div>
          <div>
            <Text as="del">
              &lt;del&gt; — Deleted text, indicating a removal.
            </Text>
          </div>
          <div>
            <Text as="ins">
              &lt;ins&gt; — Inserted text, indicating an addition.
            </Text>
          </div>
          <div>
            <Text as="code">
              &lt;code&gt; — Inline code fragment or identifier.
            </Text>
          </div>
          <div>
            <Text as="kbd">&lt;kbd&gt; — Keyboard input such as Ctrl+C.</Text>
          </div>
          <div>
            <Text as="abbr">
              &lt;abbr&gt; — Abbreviation or acronym (e.g., HTML, CSS).
            </Text>
          </div>
          <div>
            <Text as="cite">
              &lt;cite&gt; — Citation or reference to a creative work.
            </Text>
          </div>
          <div>
            <Text as="q">
              &lt;q&gt; — Short inline quotation, auto-wrapped in quotes.
            </Text>
          </div>
          <div>
            <Text as="time">
              &lt;time&gt; — Machine-readable date or time value.
            </Text>
          </div>
          <div>
            <Text as="samp">
              &lt;samp&gt; — Sample output from a program or system.
            </Text>
          </div>
          <div>
            <Text as="var">
              &lt;var&gt; — Mathematical or programming variable.
            </Text>
          </div>
        </div>
      </section>

      {/* 6. Alignment */}
      <section className="space-y-4">
        <Heading level={2}>Alignment</Heading>
        <Text color="muted">
          The align prop controls horizontal text alignment within its
          container.
        </Text>
        <div className="space-y-4">
          <div>
            <Text size="sm" weight="semibold" color="muted">
              left (default)
            </Text>
            <Text align="left">
              Typography is the art and technique of arranging type to make
              written language legible, readable, and appealing when displayed.
              The arrangement of type involves selecting typefaces, point sizes,
              line lengths, line-spacing, and letter-spacing.
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              center
            </Text>
            <Text align="center">
              Typography is the art and technique of arranging type to make
              written language legible, readable, and appealing when displayed.
              The arrangement of type involves selecting typefaces, point sizes,
              line lengths, line-spacing, and letter-spacing.
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              right
            </Text>
            <Text align="right">
              Typography is the art and technique of arranging type to make
              written language legible, readable, and appealing when displayed.
              The arrangement of type involves selecting typefaces, point sizes,
              line lengths, line-spacing, and letter-spacing.
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              justify
            </Text>
            <Text align="justify">
              Typography is the art and technique of arranging type to make
              written language legible, readable, and appealing when displayed.
              The arrangement of type involves selecting typefaces, point sizes,
              line lengths, line-spacing, and letter-spacing.
            </Text>
          </div>
        </div>
      </section>

      {/* 7. Truncation */}
      <section className="space-y-4">
        <Heading level={2}>Truncation</Heading>
        <Text color="muted">
          Truncation prevents long text from overflowing its container. Use
          truncate for a single line or lineClamp for a specific number of
          visible lines.
        </Text>
        <div className="space-y-4">
          <div>
            <Text size="sm" weight="semibold" color="muted">
              truncate (single line)
            </Text>
            <Text truncate>
              This is a very long sentence that should be truncated to a single
              line with an ellipsis at the end. It keeps going and going to
              demonstrate how the truncation works when the text overflows its
              container boundary.
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              lineClamp=&#123;2&#125;
            </Text>
            <Text lineClamp={2}>
              This paragraph is clamped to two lines. Any content beyond the
              second line will be hidden and replaced with an ellipsis. This is
              useful for card descriptions, preview text, and anywhere you need
              to limit vertical space while still showing meaningful content to
              the reader.
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              lineClamp=&#123;3&#125;
            </Text>
            <Text lineClamp={3}>
              This paragraph is clamped to three lines. You get a bit more
              content visible compared to two-line clamping, which makes it
              suitable for longer descriptions or article excerpts. Any content
              beyond the third line will be hidden and replaced with an
              ellipsis. This gives a good balance between showing enough context
              and saving vertical space in your layout.
            </Text>
          </div>
        </div>
      </section>

      {/* 8. Font Families */}
      <section className="space-y-4">
        <Heading level={2}>Font Families</Heading>
        <Text color="muted">
          Three font families are available via Tailwind utility classes. The
          sans and heading fonts use Inter, while mono uses JetBrains Mono.
        </Text>
        <div className="space-y-3">
          <div>
            <Text size="sm" weight="semibold" color="muted">
              font-sans
            </Text>
            <Text className="font-sans">
              The quick brown fox jumps over the lazy dog. 0123456789
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              font-heading
            </Text>
            <Text className="font-heading">
              The quick brown fox jumps over the lazy dog. 0123456789
            </Text>
          </div>
          <div>
            <Text size="sm" weight="semibold" color="muted">
              font-mono
            </Text>
            <Text className="font-mono">
              The quick brown fox jumps over the lazy dog. 0123456789
            </Text>
          </div>
        </div>
      </section>

      {/* 9. Heading Customization */}
      <section className="space-y-4">
        <Heading level={2}>Heading Customization</Heading>
        <Text color="muted">
          Headings support tracking (letter-spacing) and color customization for
          fine-tuned visual control.
        </Text>

        <div className="space-y-4">
          <div>
            <Text size="sm" weight="semibold" color="muted">
              Tracking variants
            </Text>
            <div className="space-y-2">
              <Heading level={3} tracking="tighter">
                tighter — Condensed letter-spacing
              </Heading>
              <Heading level={3} tracking="tight">
                tight — Slightly condensed letter-spacing
              </Heading>
              <Heading level={3} tracking="normal">
                normal — Default letter-spacing
              </Heading>
              <Heading level={3} tracking="wide">
                wide — Expanded letter-spacing
              </Heading>
            </div>
          </div>

          <div>
            <Text size="sm" weight="semibold" color="muted">
              Color variants
            </Text>
            <div className="space-y-2">
              <Heading level={3} color="default">
                default — Primary heading color
              </Heading>
              <Heading level={3} color="muted">
                muted — De-emphasized heading
              </Heading>
              <Heading level={3} color="primary">
                primary — Brand primary heading
              </Heading>
              <Heading level={3} color="secondary">
                secondary — Brand secondary heading
              </Heading>
              <Heading level={3} color="accent">
                accent — Accent heading color
              </Heading>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
