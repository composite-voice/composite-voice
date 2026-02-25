import {
  Tooltip,
  Button,
  IconButton,
  Badge,
  Heading,
  Text,
  Code,
  Kbd,
  Alert,
  SettingsIcon,
  InfoIcon,
} from "@lukeocodes/composite-voice-ui";

export default function TooltipsShowcase() {
  return (
    <div className="space-y-12">
      <Text>Hover or focus the elements below to see tooltips.</Text>

      {/* Positions */}
      <section>
        <Heading level={2}>Positions</Heading>
        <div className="flex flex-wrap items-center gap-8">
          <Tooltip content="Tooltip on top" position="top">
            <Button>Top</Button>
          </Tooltip>
          <Tooltip content="Tooltip on right" position="right">
            <Button>Right</Button>
          </Tooltip>
          <Tooltip content="Tooltip on bottom" position="bottom">
            <Button>Bottom</Button>
          </Tooltip>
          <Tooltip content="Tooltip on left" position="left">
            <Button>Left</Button>
          </Tooltip>
        </div>
      </section>

      {/* On Different Elements */}
      <section>
        <Heading level={2}>On Different Elements</Heading>
        <div className="flex flex-wrap items-center gap-8">
          <Tooltip content="This is a button tooltip">
            <Button>Button</Button>
          </Tooltip>
          <Tooltip content="Settings">
            <IconButton icon={<SettingsIcon />} label="Settings" />
          </Tooltip>
          <Tooltip content="This badge has extra info">
            <Badge>Badge</Badge>
          </Tooltip>
          <Tooltip content="Tooltips work on plain text too">
            <span
              tabIndex={0}
              style={{ textDecoration: "underline", cursor: "default" }}
            >
              Underlined text
            </span>
          </Tooltip>
        </div>
      </section>

      {/* Custom Delay */}
      <section>
        <Heading level={2}>Custom Delay</Heading>
        <div className="flex flex-wrap items-center gap-8">
          <Tooltip content="Appeared instantly!" delay={0}>
            <Button>Instant</Button>
          </Tooltip>
          <Tooltip content="Appeared after 500ms" delay={500}>
            <Button>Slow</Button>
          </Tooltip>
        </div>
      </section>

      {/* Rich Content */}
      <section>
        <Heading level={2}>Rich Content</Heading>
        <div className="flex flex-wrap items-center gap-8">
          <Tooltip content="Press Ctrl+S to save">
            <Button>
              <InfoIcon /> Save shortcut
            </Button>
          </Tooltip>
        </div>
      </section>

      {/* Accessibility Notes */}
      <section>
        <Alert variant="info" title="Accessibility Notes">
          <Text>
            Tooltips are shown on hover <strong>and</strong> focus, ensuring
            keyboard users can access the information. Each tooltip uses{" "}
            <Code>role="tooltip"</Code> paired with{" "}
            <Code>aria-describedby</Code> on the trigger element so screen
            readers announce the tooltip content. Pressing <Kbd>Escape</Kbd>{" "}
            dismisses any visible tooltip. Animations respect the user's{" "}
            <Code>prefers-reduced-motion</Code> setting, disabling transitions
            when reduced motion is preferred.
          </Text>
        </Alert>
      </section>
    </div>
  );
}
