import {
  Button,
  ButtonGroup,
  IconButton,
  Heading,
  Text,
  SearchIcon,
  MailIcon,
  PlusIcon,
  SettingsIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from "@lukeocodes/composite-voice-ui";

export default function ButtonsShowcase() {
  return (
    <div className="space-y-12">
      {/* Variants */}
      <section>
        <Heading level={2}>Variants</Heading>
        <Text>Buttons come in 6 variants to communicate different levels of emphasis and intent.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="link">Link</Button>
        </div>
      </section>

      {/* Sizes */}
      <section>
        <Heading level={2}>Sizes</Heading>
        <Text>Five size options from extra-small to extra-large for different contexts.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="primary" size="xs">Extra Small</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="md">Medium</Button>
          <Button variant="primary" size="lg">Large</Button>
          <Button variant="primary" size="xl">Extra Large</Button>
        </div>
      </section>

      {/* With Icons */}
      <section>
        <Heading level={2}>With Icons</Heading>
        <Text>Buttons can include icons on the left, right, or both sides for added visual context.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="primary" leftIcon={<SearchIcon size="sm" />}>Search</Button>
          <Button variant="primary" rightIcon={<ArrowRightIcon size="sm" />}>Continue</Button>
          <Button variant="primary" leftIcon={<MailIcon size="sm" />} rightIcon={<ChevronDownIcon size="sm" />}>Send Email</Button>
        </div>
      </section>

      {/* Icon Buttons */}
      <section>
        <Heading level={2}>Icon Buttons</Heading>
        <Text>Icon-only buttons for compact actions. Each requires an aria-label for accessibility.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <IconButton variant="primary" icon={<SettingsIcon size="sm" />} aria-label="Settings" />
          <IconButton variant="secondary" icon={<PlusIcon size="sm" />} aria-label="Add new item" />
          <IconButton variant="outline" icon={<SearchIcon size="sm" />} aria-label="Search" />
          <IconButton variant="ghost" icon={<SettingsIcon size="md" />} aria-label="Settings" size="lg" />
          <IconButton variant="danger" icon={<PlusIcon size="xs" />} aria-label="Add new item" size="xs" />
        </div>
      </section>

      {/* Loading State */}
      <section>
        <Heading level={2}>Loading State</Heading>
        <Text>Buttons can display a loading indicator to signal an in-progress action.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="primary" loading={true}>Primary</Button>
          <Button variant="secondary" loading={true}>Secondary</Button>
          <Button variant="danger" loading={true}>Danger</Button>
          <Button variant="outline" loading={true}>Outline</Button>
        </div>
      </section>

      {/* Disabled State */}
      <section>
        <Heading level={2}>Disabled State</Heading>
        <Text>Disabled buttons indicate that an action is currently unavailable.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button variant="primary" disabled={true}>Primary</Button>
          <Button variant="secondary" disabled={true}>Secondary</Button>
          <Button variant="danger" disabled={true}>Danger</Button>
          <Button variant="outline" disabled={true}>Outline</Button>
        </div>
      </section>

      {/* Full Width */}
      <section>
        <Heading level={2}>Full Width</Heading>
        <Text>Buttons can stretch to fill the full width of their container.</Text>
        <div className="mt-4">
          <Button variant="primary" fullWidth={true}>Full Width Button</Button>
        </div>
      </section>

      {/* Button Groups */}
      <section>
        <Heading level={2}>Button Groups</Heading>
        <Text>ButtonGroup arranges buttons horizontally or vertically, with optional joined styling.</Text>
        <div className="space-y-6 mt-4">
          <div>
            <Text>Horizontal group:</Text>
            <div className="mt-2">
              <ButtonGroup>
                <Button variant="outline">Left</Button>
                <Button variant="outline">Center</Button>
                <Button variant="outline">Right</Button>
              </ButtonGroup>
            </div>
          </div>
          <div>
            <Text>Vertical group:</Text>
            <div className="mt-2">
              <ButtonGroup orientation="vertical">
                <Button variant="outline">Top</Button>
                <Button variant="outline">Middle</Button>
                <Button variant="outline">Bottom</Button>
              </ButtonGroup>
            </div>
          </div>
          <div>
            <Text>Joined buttons (spacing="none"):</Text>
            <div className="mt-2">
              <ButtonGroup spacing="none">
                <Button variant="outline">Left</Button>
                <Button variant="outline">Center</Button>
                <Button variant="outline">Right</Button>
              </ButtonGroup>
            </div>
          </div>
        </div>
      </section>

      {/* As Link */}
      <section>
        <Heading level={2}>As Link</Heading>
        <Text>Buttons can render as anchor elements for navigation while retaining button styling.</Text>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button as="a" href="#" variant="primary">Primary Link</Button>
          <Button as="a" href="#" variant="secondary">Secondary Link</Button>
          <Button as="a" href="#" variant="outline">Outline Link</Button>
        </div>
      </section>
    </div>
  );
}
