import {
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  FormField,
  Label,
  Heading,
  Text,
  SearchIcon,
  MailIcon,
  EyeIcon,
} from "composite-voice-ui";

const frameworkOptions = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "svelte", label: "Svelte" },
];

const roleOptions = [
  { value: "developer", label: "Developer" },
  { value: "designer", label: "Designer" },
  { value: "manager", label: "Manager" },
];

export default function FormsShowcase() {
  return (
    <div className="space-y-12">
      {/* Text Inputs */}
      <section className="space-y-4">
        <Heading level={2}>Text Inputs</Heading>
        <Text color="muted">Basic text inputs in default and filled variants across all sizes.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Default variant</Text>
            <Input variant="default" inputSize="sm" placeholder="Small input" />
            <Input variant="default" inputSize="md" placeholder="Medium input" />
            <Input variant="default" inputSize="lg" placeholder="Large input" />
          </div>

          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Filled variant</Text>
            <Input variant="filled" inputSize="sm" placeholder="Small filled input" />
            <Input variant="filled" inputSize="md" placeholder="Medium filled input" />
            <Input variant="filled" inputSize="lg" placeholder="Large filled input" />
          </div>
        </div>
      </section>

      {/* Input with Addons */}
      <section className="space-y-4">
        <Heading level={2}>Input with Addons</Heading>
        <Text color="muted">Inputs can include left and right addon elements such as icons.</Text>

        <div className="max-w-md space-y-4">
          <Input placeholder="Search..." leftAddon={<SearchIcon size="sm" />} />
          <Input placeholder="Email address" rightAddon={<MailIcon size="sm" />} />
          <Input
            placeholder="Search with icons on both sides"
            leftAddon={<SearchIcon size="sm" />}
            rightAddon={<EyeIcon size="sm" />}
          />
        </div>
      </section>

      {/* Input States */}
      <section className="space-y-4">
        <Heading level={2}>Input States</Heading>
        <Text color="muted">Inputs support disabled, error, and readonly states.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Disabled</Text>
            <Input disabled placeholder="Disabled input" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Error</Text>
            <Input error placeholder="Input with error" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Read only</Text>
            <Input readOnly defaultValue="Read-only value" />
          </div>
        </div>
      </section>

      {/* Textarea */}
      <section className="space-y-4">
        <Heading level={2}>Textarea</Heading>
        <Text color="muted">Multi-line text areas in different variants, sizes, and resize modes.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Default variant, different sizes</Text>
            <Textarea variant="default" textareaSize="sm" placeholder="Small textarea" />
            <Textarea variant="default" textareaSize="md" placeholder="Medium textarea" />
            <Textarea variant="default" textareaSize="lg" placeholder="Large textarea" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Filled variant</Text>
            <Textarea variant="filled" textareaSize="md" placeholder="Filled textarea" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Resize vertical</Text>
            <Textarea resize="vertical" placeholder="Resize vertically only" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">No resize</Text>
            <Textarea resize="none" placeholder="Cannot be resized" />
          </div>
        </div>
      </section>

      {/* Select */}
      <section className="space-y-4">
        <Heading level={2}>Select</Heading>
        <Text color="muted">Select dropdowns with placeholder, error, and disabled states.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">With placeholder</Text>
            <Select options={frameworkOptions} placeholder="Choose a framework" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Error state</Text>
            <Select options={frameworkOptions} error placeholder="Select a framework" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Disabled</Text>
            <Select options={frameworkOptions} disabled placeholder="Disabled select" />
          </div>
        </div>
      </section>

      {/* Checkboxes */}
      <section className="space-y-4">
        <Heading level={2}>Checkboxes</Heading>
        <Text color="muted">Checkboxes with labels, descriptions, sizes, and various states.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">With label</Text>
            <Checkbox label="Accept terms and conditions" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">With label and description</Text>
            <Checkbox
              label="Email notifications"
              description="Receive email updates about your account activity."
            />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Different sizes</Text>
            <Checkbox size="sm" label="Small checkbox" />
            <Checkbox size="md" label="Medium checkbox" />
            <Checkbox size="lg" label="Large checkbox" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Disabled</Text>
            <Checkbox disabled label="Disabled unchecked" />
            <Checkbox disabled defaultChecked label="Disabled checked" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Error state</Text>
            <Checkbox error label="You must agree to continue" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Checked by default</Text>
            <Checkbox defaultChecked label="Checked by default" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Indeterminate</Text>
            <Checkbox indeterminate label="Select all items" />
          </div>
        </div>
      </section>

      {/* Radio Buttons */}
      <section className="space-y-4">
        <Heading level={2}>Radio Buttons</Heading>
        <Text color="muted">Radio buttons in groups with labels, descriptions, sizes, and disabled state.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Basic radio group</Text>
            <Radio name="framework" value="react" label="React" defaultChecked />
            <Radio name="framework" value="vue" label="Vue" />
            <Radio name="framework" value="svelte" label="Svelte" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">With descriptions</Text>
            <Radio name="plan" value="free" label="Free" description="Basic features for personal use." />
            <Radio name="plan" value="pro" label="Pro" description="Advanced features for professionals." />
            <Radio name="plan" value="enterprise" label="Enterprise" description="Custom solutions for large teams." />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Different sizes</Text>
            <Radio name="size-demo" value="sm" size="sm" label="Small radio" />
            <Radio name="size-demo" value="md" size="md" label="Medium radio" />
            <Radio name="size-demo" value="lg" size="lg" label="Large radio" />
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Disabled</Text>
            <Radio name="disabled-demo" value="a" disabled label="Disabled option A" />
            <Radio name="disabled-demo" value="b" disabled defaultChecked label="Disabled option B (selected)" />
          </div>
        </div>
      </section>

      {/* Form Fields */}
      <section className="space-y-4">
        <Heading level={2}>Form Fields</Heading>
        <Text color="muted">FormField wraps inputs with labels, hints, and error messages.</Text>

        <div className="max-w-md space-y-6">
          <FormField label="Username" htmlFor="username" hint="Choose a unique username.">
            <Input id="username" placeholder="Enter username" aria-describedby="username-description" />
          </FormField>

          <FormField label="Email" htmlFor="email-err" error="Please enter a valid email address.">
            <Input id="email-err" error placeholder="Enter email" aria-describedby="email-err-description" />
          </FormField>

          <div className="pt-4 border-t border-neutral-200">
            <Text as="span" size="sm" weight="semibold" className="mb-4 block">Complete mini-form</Text>
            <div className="space-y-4">
              <FormField label="Full Name" htmlFor="full-name" hint="As it appears on your ID." required>
                <Input id="full-name" placeholder="Jane Doe" aria-describedby="full-name-description" />
              </FormField>
              <FormField label="Email Address" htmlFor="email-mini">
                <Input id="email-mini" type="email" placeholder="jane@example.com" rightAddon={<MailIcon size="sm" />} />
              </FormField>
              <FormField label="Bio" htmlFor="bio" hint="Tell us a little about yourself.">
                <Textarea id="bio" placeholder="Write something..." resize="vertical" aria-describedby="bio-description" />
              </FormField>
              <FormField label="Role" htmlFor="role">
                <Select id="role" options={roleOptions} placeholder="Select your role" />
              </FormField>
              <Checkbox label="I agree to the terms of service" />
            </div>
          </div>
        </div>
      </section>

      {/* Labels */}
      <section className="space-y-4">
        <Heading level={2}>Labels</Heading>
        <Text color="muted">Standalone label components with sizes, required indicators, and disabled state.</Text>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Different sizes</Text>
            <div className="flex flex-col gap-1">
              <Label size="sm">Small label</Label>
              <Label size="md">Medium label</Label>
              <Label size="lg">Large label</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">With required indicator</Text>
            <Label required>Required field</Label>
          </div>
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">Disabled</Text>
            <Label disabled>Disabled label</Label>
          </div>
        </div>
      </section>
    </div>
  );
}
