/**
 * Prose — typographic wrapper for rich text content.
 *
 * Applies consistent typography styles to arbitrary HTML content
 * such as markdown-rendered text, CMS content, or documentation.
 * Uses Tailwind utility classes on child selectors for headings,
 * paragraphs, lists, links, and more.
 *
 * Accessibility:
 * - Semantic HTML structure preserved
 * - Sufficient line height and spacing for readability
 * - Link styles with visible underline
 * - Respects user font-size preferences (rem-based)
 */

interface ProseProps {
  /** Rich text content */
  children: React.ReactNode;
  /** Size variant controlling base font size and spacing */
  size?: "sm" | "base" | "lg";
  /** Additional class names */
  className?: string;
}

const sizeStyles = {
  sm: "text-sm leading-relaxed",
  base: "text-base leading-relaxed",
  lg: "text-lg leading-relaxed",
};

export function Prose({
  children,
  size = "base",
  className = "",
}: ProseProps) {
  return (
    <div
      className={`
        ${sizeStyles[size]}
        text-neutral-700

        [&>*+*]:mt-4
        [&>*:first-child]:mt-0
        [&>*:last-child]:mb-0

        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-neutral-900 [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:leading-tight
        [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:leading-tight
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-neutral-800 [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:leading-snug
        [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-neutral-800 [&_h4]:mt-4 [&_h4]:mb-2

        [&_p]:my-4

        [&_a]:text-primary-600 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary-700 [&_a]:transition-colors

        [&_strong]:font-semibold [&_strong]:text-neutral-900
        [&_em]:italic

        [&_ul]:my-4 [&_ul]:pl-6 [&_ul]:list-disc
        [&_ol]:my-4 [&_ol]:pl-6 [&_ol]:list-decimal
        [&_li]:my-1 [&_li]:pl-1

        [&_blockquote]:border-l-4 [&_blockquote]:border-primary-300 [&_blockquote]:bg-primary-50/50 [&_blockquote]:pl-4 [&_blockquote]:py-3 [&_blockquote]:my-4 [&_blockquote]:rounded-r-md [&_blockquote]:italic [&_blockquote]:text-neutral-600

        [&_pre]:my-4 [&_pre]:rounded-card [&_pre]:overflow-x-auto
        [&_code]:bg-surface-sunken [&_code]:text-danger-600 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.875em] [&_code]:font-mono [&_code]:border [&_code]:border-neutral-200
        [&_pre_code]:bg-transparent [&_pre_code]:text-inherit [&_pre_code]:px-0 [&_pre_code]:py-0 [&_pre_code]:rounded-none [&_pre_code]:border-0

        [&_hr]:my-8 [&_hr]:border-neutral-200

        [&_img]:rounded-card [&_img]:my-4

        [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse
        [&_th]:text-left [&_th]:font-semibold [&_th]:text-neutral-900 [&_th]:border-b [&_th]:border-neutral-200 [&_th]:py-2 [&_th]:px-3
        [&_td]:border-b [&_td]:border-neutral-100 [&_td]:py-2 [&_td]:px-3

        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}
