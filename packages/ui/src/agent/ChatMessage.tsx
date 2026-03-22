/**
 * ChatMessage — individual message bubble in the agent panel.
 *
 * User messages are right-aligned with a primary-600 background.
 * Assistant messages are left-aligned with a neutral-800 background.
 *
 * Supports rendering of:
 * - Plain text with paragraph breaks
 * - Fenced code blocks (triple backticks) with a dark background,
 *   monospace font, and a copy button
 * - Source links as small pill badges below the message
 * - A CTA link as a prominent button below sources
 */

import { useState, useCallback, useMemo } from "react";
import { CopyIcon, CheckIcon, ExternalLinkIcon } from "../icons";
import type { ChatMessage as ChatMessageType, SourceLink } from "./types";

interface ChatMessageProps {
  /** The message to render */
  message: ChatMessageType;
}

/** Split message content into text and code segments. */
interface Segment {
  type: "text" | "code";
  content: string;
  language?: string;
}

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", content: text });
    }
    segments.push({
      type: "code",
      content: match[2].trim(),
      language: match[1] || undefined,
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after the last code block
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) segments.push({ type: "text", content: text });
  }

  return segments;
}

function CodeBlock({ content, language }: { content: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <div className="relative my-2 rounded-lg overflow-hidden bg-surface-raised border border-neutral-200">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-sunken/60 border-b border-neutral-200">
        <span className="text-xs text-foreground-muted font-mono">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <CheckIcon size="xs" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <CopyIcon size="xs" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className="font-mono text-foreground">{content}</code>
      </pre>
    </div>
  );
}

function TextBlock({ content }: { content: string }) {
  // Split into paragraphs and render inline formatting
  const paragraphs = content.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="whitespace-pre-wrap leading-relaxed">
          {renderInlineFormatting(paragraph)}
        </p>
      ))}
    </>
  );
}

/** Minimal inline markdown: **bold**, *italic*, `inline code`, [link](url) */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // Bold
      tokens.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      // Italic
      tokens.push(<em key={key++} className="italic">{match[4]}</em>);
    } else if (match[5]) {
      // Inline code
      tokens.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-surface-sunken text-primary-600 font-mono text-[0.875em]"
        >
          {match[6]}
        </code>,
      );
    } else if (match[7]) {
      // Link
      tokens.push(
        <a
          key={key++}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 underline underline-offset-2 hover:text-primary-500 transition-colors"
        >
          {match[8]}
        </a>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

function SourcePills({ sources }: { sources: SourceLink[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {sources.map((source, i) => (
        <a
          key={i}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-200/60 text-foreground-muted hover:bg-surface-raised hover:text-foreground transition-colors border border-neutral-300"
        >
          <ExternalLinkIcon size="xs" />
          {source.title}
        </a>
      ))}
    </div>
  );
}

function CtaButton({ cta }: { cta: SourceLink }) {
  return (
    <a
      href={cta.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-primary-600 text-on-filled text-sm font-medium hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {cta.title}
      <ExternalLinkIcon size="sm" />
    </a>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const segments = useMemo(() => parseContent(message.content), [message.content]);

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
      role="listitem"
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-primary-600 text-on-filled rounded-br-md"
            : "bg-surface-sunken text-foreground rounded-bl-md"
        }`}
      >
        {/* Message content */}
        <div className="space-y-2">
          {segments.map((segment, i) =>
            segment.type === "code" ? (
              <CodeBlock
                key={i}
                content={segment.content}
                language={segment.language}
              />
            ) : (
              <TextBlock key={i} content={segment.content} />
            ),
          )}
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <SourcePills sources={message.sources} />
        )}

        {/* CTA */}
        {message.cta && <CtaButton cta={message.cta} />}
      </div>
    </div>
  );
}
