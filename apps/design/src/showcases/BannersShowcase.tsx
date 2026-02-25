import { Banner, Heading, Text, Alert, Code } from "@lukeocodes/composite-voice-ui";

export default function BannersShowcase() {
  return (
    <div className="space-y-12">
      <section>
        <Heading level={2}>Variants</Heading>
        <div className="space-y-3">
          <Banner variant="info">
            A new version of the SDK is available with improved streaming performance.
          </Banner>
          <Banner variant="success">
            Your API key has been verified and is ready to use.
          </Banner>
          <Banner variant="warning">
            Your free tier usage is approaching the monthly limit.
          </Banner>
          <Banner variant="danger">
            Service disruption detected. Some real-time features may be unavailable.
          </Banner>
          <Banner variant="neutral">
            Scheduled maintenance is planned for this weekend.
          </Banner>
        </div>
      </section>

      <section>
        <Heading level={2}>Dismissible</Heading>
        <div className="space-y-3">
          <Banner variant="info" dismissible={true}>
            You can dismiss this informational banner by clicking the close button.
          </Banner>
          <Banner variant="neutral" dismissible={true}>
            This neutral banner can also be dismissed when no longer needed.
          </Banner>
        </div>
      </section>

      <section>
        <Heading level={2}>With Action</Heading>
        <div className="space-y-3">
          <Banner
            variant="info"
            action={{ label: "Learn more", onClick: () => {} }}
          >
            Composite Voice now supports Groq and AssemblyAI providers.
          </Banner>
          <Banner
            variant="warning"
            action={{ label: "Upgrade now", onClick: () => {} }}
          >
            Your current plan does not include priority support.
          </Banner>
        </div>
      </section>

      <section>
        <Heading level={2}>Combined</Heading>
        <div className="space-y-3">
          <Banner
            variant="info"
            dismissible={true}
            action={{ label: "View changelog", onClick: () => {} }}
          >
            Version 2.0 introduces breaking changes. Review the migration guide before upgrading.
          </Banner>
        </div>
      </section>

      <section>
        <Heading level={2}>Custom Icon</Heading>
        <Text>
          The <Code>icon</Code> prop can override the default variant icon. Pass any React node to replace the
          built-in icon for a given variant.
        </Text>
      </section>

      <section>
        <Heading level={2}>Sticky Behavior</Heading>
        <Text>
          The <Code>sticky</Code> prop makes the banner stick to the viewport top with <Code>position: sticky</Code>.
          This is useful for persistent announcements or system status messages that
          should remain visible as the user scrolls. The sticky behavior is not demonstrated here to
          avoid interfering with the design system page layout.
        </Text>
      </section>

      <section>
        <Alert variant="info" title="ARIA Roles">
          <Text>
            Banners use appropriate ARIA roles based on their variant. The danger and warning variants
            use <Code>role="alert"</Code> for assertive announcements that immediately convey urgent information to
            assistive technologies. The info, success, and neutral variants use <Code>role="status"</Code> for polite
            announcements that do not interrupt the user. Dismissible banners announce their removal to
            screen readers when closed.
          </Text>
        </Alert>
      </section>
    </div>
  );
}
