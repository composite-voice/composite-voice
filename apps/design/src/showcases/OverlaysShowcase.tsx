import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Text,
  Heading,
  Input,
  FormField,
  Alert,
  Prose,
} from "composite-voice-ui";

export default function OverlaysShowcase() {
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [smallOpen, setSmallOpen] = useState(false);
  const [largeOpen, setLargeOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [scrollableOpen, setScrollableOpen] = useState(false);
  const [noOverlayClickOpen, setNoOverlayClickOpen] = useState(false);

  return (
    <div className="space-y-12">
      {/* Default Modal */}
      <section>
        <Heading level={2}>Default Modal</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setDefaultOpen(true)}>Open Modal</Button>
        </div>
        <Modal open={defaultOpen} onClose={() => setDefaultOpen(false)} size="md">
          <ModalHeader title="Modal Title" showClose onClose={() => setDefaultOpen(false)} />
          <ModalBody>
            <Text>
              This is a default medium-sized modal. It demonstrates the basic structure with a
              header, body, and footer. You can close it using the close button in the header, the
              Cancel button below, or by clicking the overlay.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setDefaultOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDefaultOpen(false)}>Confirm</Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* Small Modal */}
      <section>
        <Heading level={2}>Small Modal</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setSmallOpen(true)}>Open Confirmation Dialog</Button>
        </div>
        <Modal open={smallOpen} onClose={() => setSmallOpen(false)} size="sm">
          <ModalHeader title="Confirm Action" showClose onClose={() => setSmallOpen(false)} />
          <ModalBody>
            <Text>Are you sure you want to proceed?</Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setSmallOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setSmallOpen(false)}>
              Delete
            </Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* Large Modal */}
      <section>
        <Heading level={2}>Large Modal</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setLargeOpen(true)}>Open Large Modal</Button>
        </div>
        <Modal open={largeOpen} onClose={() => setLargeOpen(false)} size="lg">
          <ModalHeader title="Large Modal" showClose onClose={() => setLargeOpen(false)} />
          <ModalBody>
            <Text>
              This is a large modal that provides more horizontal space for content. Large modals
              are ideal for displaying detailed information, complex forms, or data-heavy layouts
              that benefit from additional width.
            </Text>
            <Text>
              The modal system supports three size variants: small, medium, and large. Each size
              is designed for a specific use case, from compact confirmation dialogs to expansive
              content panels.
            </Text>
            <Text>
              All modals share the same accessibility features regardless of size, including focus
              trapping, keyboard navigation, and proper ARIA attributes. The overlay and close
              behaviors remain consistent across all variants.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setLargeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setLargeOpen(false)}>Confirm</Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* Modal with Form */}
      <section>
        <Heading level={2}>Modal with Form</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setFormOpen(true)}>Open Form Modal</Button>
        </div>
        <Modal open={formOpen} onClose={() => setFormOpen(false)} size="md">
          <ModalHeader title="Create Account" showClose onClose={() => setFormOpen(false)} />
          <ModalBody>
            <FormField label="Name">
              <Input placeholder="Enter your name" />
            </FormField>
            <FormField label="Email">
              <Input type="email" placeholder="Enter your email" />
            </FormField>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setFormOpen(false)}>Submit</Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* Scrollable Modal */}
      <section>
        <Heading level={2}>Scrollable Modal</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setScrollableOpen(true)}>Open Scrollable Modal</Button>
        </div>
        <Modal open={scrollableOpen} onClose={() => setScrollableOpen(false)} size="md">
          <ModalHeader
            title="Scrollable Content"
            showClose
            onClose={() => setScrollableOpen(false)}
          />
          <ModalBody>
            <Text>
              This modal contains a large amount of content to demonstrate the scrolling behavior.
              When the content exceeds the available viewport height, the modal body becomes
              scrollable while the header and footer remain fixed in place.
            </Text>
            <Text>
              Scroll locking is applied to the document body when the modal is open, preventing
              background content from scrolling while the user interacts with the modal. This
              ensures a focused experience within the dialog.
            </Text>
            <Text>
              The scrollable area is confined to the modal body, so the header with the title and
              close button, as well as the footer with action buttons, are always visible and
              accessible to the user.
            </Text>
            <Text>
              This pattern is commonly used for terms of service dialogs, long-form content
              previews, or any situation where the modal content may exceed the visible area. The
              scroll indicator helps users understand there is more content below.
            </Text>
            <Text>
              Keyboard navigation within a scrollable modal works as expected. Users can scroll
              the content using arrow keys when the body is focused, and Tab key navigation
              continues to cycle through focusable elements within the modal.
            </Text>
            <Text>
              It is important to test scrollable modals across different viewport sizes. On
              smaller screens, even modals with minimal content may need to scroll, so the
              scrolling behavior should always be robust and well-tested.
            </Text>
            <Text>
              The modal respects the maximum height constraint, which is typically a percentage of
              the viewport height. This ensures the modal never extends beyond the visible screen
              area, maintaining the overlay effect and keeping the close affordances accessible.
            </Text>
            <Text>
              Additional content continues here to ensure there is enough material to trigger the
              scroll behavior in most viewport configurations. Real-world modals with dynamic
              content should always account for the possibility of overflow.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setScrollableOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setScrollableOpen(false)}>Confirm</Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* Without Overlay Click */}
      <section>
        <Heading level={2}>Without Overlay Click</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setNoOverlayClickOpen(true)}>
            Open Persistent Modal
          </Button>
        </div>
        <Modal
          open={noOverlayClickOpen}
          onClose={() => setNoOverlayClickOpen(false)}
          size="md"
          closeOnOverlayClick={false}
        >
          <ModalHeader
            title="Persistent Modal"
            showClose
            onClose={() => setNoOverlayClickOpen(false)}
          />
          <ModalBody>
            <Text>
              This modal cannot be closed by clicking the overlay. It can only be dismissed using
              the close button in the header, the Cancel button below, or by pressing the Escape
              key. This pattern is useful for critical actions that require explicit user
              confirmation.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setNoOverlayClickOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setNoOverlayClickOpen(false)}>Confirm</Button>
          </ModalFooter>
        </Modal>
      </section>

      {/* Accessibility Notes */}
      <section>
        <Alert variant="info" title="Accessibility Notes">
          <Prose size="sm">
            <p>
              The Modal component implements comprehensive accessibility features following WAI-ARIA
              dialog patterns. A focus trap ensures that pressing Tab cycles focus only through
              interactive elements within the modal, preventing focus from escaping to background
              content. When the modal closes, focus is restored to the element that triggered it,
              maintaining the user's place in the document.
            </p>
            <p>
              Pressing the Escape key closes the modal by default, providing a consistent keyboard
              dismissal mechanism. The modal sets <code>aria-modal="true"</code> on the dialog element, which
              signals to assistive technologies that content behind the modal is inert. Body scroll
              lock prevents the background page from scrolling while the modal is open.
            </p>
            <p>
              The modal title is linked to the dialog via <code>aria-labelledby</code>, ensuring screen readers
              announce the modal's purpose when it opens. All interactive elements within the modal,
              including the close button, form fields, and action buttons, are fully keyboard
              accessible.
            </p>
          </Prose>
        </Alert>
      </section>
    </div>
  );
}
