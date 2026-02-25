import { Alert, Heading, Text, Prose, Code } from "@lukeocodes/composite-voice-ui";

export default function AlertsShowcase() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <Heading level={2}>Variants</Heading>
        <Alert variant="info">
          A new software update is available for your device.
        </Alert>
        <Alert variant="success">
          Your changes have been saved successfully.
        </Alert>
        <Alert variant="warning">
          Your session will expire in 5 minutes. Please save your work.
        </Alert>
        <Alert variant="danger">
          Unable to connect to the server. Please check your network connection.
        </Alert>
      </section>

      <section className="space-y-4">
        <Heading level={2}>With Titles</Heading>
        <Alert variant="info" title="Information">
          This feature is currently in beta and may change in future releases.
        </Alert>
        <Alert variant="success" title="Payment Received">
          Your transaction has been processed and a receipt has been sent to your email.
        </Alert>
        <Alert variant="warning" title="Storage Almost Full">
          You have used 90% of your available storage. Consider upgrading your plan.
        </Alert>
        <Alert variant="danger" title="Account Suspended">
          Your account has been suspended due to suspicious activity. Contact support immediately.
        </Alert>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Dismissible</Heading>
        <Alert variant="info" dismissible={true}>
          You can dismiss this informational message by clicking the close button.
        </Alert>
        <Alert variant="warning" dismissible={true}>
          This warning can be dismissed once you have acknowledged it.
        </Alert>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Without Icons</Heading>
        <Alert variant="info" hideIcon={true}>
          This alert is displayed without an icon for a cleaner, minimal appearance.
        </Alert>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Rich Content</Heading>
        <Alert variant="info" title="Before You Begin">
          <Prose size="sm">
            <ul>
              <li>Ensure your API key is configured in the environment variables.</li>
              <li>Review the <a href="#">getting started guide</a> for setup instructions.</li>
              <li>Check the changelog for breaking changes before upgrading.</li>
            </ul>
          </Prose>
        </Alert>
      </section>

      <section className="space-y-4">
        <Alert variant="info" title="ARIA Roles">
          <Text>
            Alerts use semantic ARIA roles to communicate urgency to screen readers.
            The danger and warning variants use <Code>role="alert"</Code> which triggers assertive
            announcements, interrupting the current speech. The info and success
            variants use <Code>role="status"</Code> which provides polite announcements, waiting
            until the screen reader finishes its current output before reading the
            alert content.
          </Text>
        </Alert>
      </section>
    </div>
  );
}
