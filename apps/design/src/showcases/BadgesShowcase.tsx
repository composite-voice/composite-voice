import { Badge, Heading, Text } from "@lukeocodes/composite-voice-ui";

const noop = () => {};

export default function BadgesShowcase() {
  return (
    <div className="space-y-12">
      {/* Variants */}
      <section>
        <Heading level={2}>Variants</Heading>
        <Text>All available badge variants for different semantic purposes.</Text>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Badge variant="default">Default</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>

      {/* Sizes */}
      <section>
        <Heading level={2}>Sizes</Heading>
        <Text>Badges are available in small, medium, and large sizes.</Text>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Badge variant="primary" size="sm">Small</Badge>
          <Badge variant="primary" size="md">Medium</Badge>
          <Badge variant="primary" size="lg">Large</Badge>
        </div>
      </section>

      {/* With Status Dot */}
      <section>
        <Heading level={2}>With Status Dot</Heading>
        <Text>Badges can include a status dot indicator to convey state at a glance.</Text>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Badge variant="success" dot={true}>Active</Badge>
          <Badge variant="danger" dot={true}>Offline</Badge>
          <Badge variant="warning" dot={true}>Away</Badge>
          <Badge variant="default" dot={true}>Idle</Badge>
        </div>
      </section>

      {/* Removable */}
      <section>
        <Heading level={2}>Removable</Heading>
        <Text>Removable badges include a dismiss button, useful for tags and filters.</Text>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Badge variant="primary" removable={true} onRemove={noop}>Primary</Badge>
          <Badge variant="success" removable={true} onRemove={noop}>Success</Badge>
          <Badge variant="danger" removable={true} onRemove={noop}>Danger</Badge>
          <Badge variant="info" removable={true} onRemove={noop}>Info</Badge>
        </div>
      </section>

      {/* Usage Examples */}
      <section>
        <Heading level={2}>Usage Examples</Heading>
        <Text>Badges used in real-world contexts such as feature labels, version indicators, and release stages.</Text>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Text as="span" className="flex items-center gap-2">
            <Text as="span" weight="medium">Voice Pipeline</Text>
            <Badge variant="primary" size="sm">New</Badge>
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Badge variant="outline">v1.2.0</Badge>
          <Badge variant="info">Beta</Badge>
          <Badge variant="success">Stable</Badge>
          <Badge variant="danger">Deprecated</Badge>
        </div>
      </section>
    </div>
  );
}
