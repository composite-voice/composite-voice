/**
 * FormField — wraps a form control with label, hint text, and error message.
 *
 * Composes Label and Text. Automatically wires aria-describedby between
 * the hint/error text and the form control, ensuring screen readers
 * announce the description when the control receives focus.
 *
 * Usage:
 *   <FormField label="Email" htmlFor="email" hint="We'll never share it" error={errors.email}>
 *     <Input id="email" error={!!errors.email} aria-describedby="email-description" />
 *   </FormField>
 */

import { Label } from "./Label";
import { Text } from "./Text";

interface FormFieldProps {
  /** Label text */
  label: string;
  /** ID of the associated form control */
  htmlFor: string;
  /** Mark as required */
  required?: boolean;
  /** Error message (replaces hint when present) */
  error?: string;
  /** Help/hint text shown below the control */
  hint?: string;
  /** Form control child */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  className = "",
  children,
}: FormFieldProps) {
  const descriptionId = `${htmlFor}-description`;
  const hasDescription = !!(error || hint);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hasDescription && (
        <Text
          as="p"
          id={descriptionId}
          size="sm"
          color={error ? "danger" : "muted"}
          role={error ? "alert" : undefined}
          aria-live={error ? "polite" : undefined}
        >
          {error || hint}
        </Text>
      )}
    </div>
  );
}
