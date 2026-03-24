/**
 * ChatInput — input bar at the bottom of the agent panel.
 *
 * Features:
 * - Auto-growing textarea (1-4 lines)
 * - Send button (arrow/send icon)
 * - Mic toggle button (pulses green when listening)
 * - Speaker toggle button (shows muted state)
 * - Enter to send, Shift+Enter for newline
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { SendIcon, MicIcon, MicOffIcon, Volume2Icon, VolumeXIcon } from "../icons";

interface ChatInputProps {
  /** Called when the user sends a text message */
  onSend: (text: string) => void;
  /** Toggle microphone on/off */
  onToggleMic: () => void;
  /** Toggle speaker on/off */
  onToggleSpeaker: () => void;
  /** Whether the mic is currently active/listening */
  isListening: boolean;
  /** Whether the mic is muted */
  isMuted: boolean;
  /** Whether the speaker output is muted */
  isSpeakerMuted: boolean;
  /** Disable all input (e.g. during connecting) */
  disabled: boolean;
}

export function ChatInput({
  onSend,
  onToggleMic,
  onToggleSpeaker,
  isListening,
  isMuted,
  isSpeakerMuted,
  disabled,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Clamp between 1 line (~36px) and 4 lines (~112px)
    const maxHeight = 112;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className="shrink-0 border-t border-neutral-200 bg-surface-raised p-3">
      <div className="flex items-end gap-2">
        {/* Mic toggle */}
        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          className={`shrink-0 p-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
            isListening && !isMuted
              ? "bg-success-500/20 text-success-500 animate-pulse hover:bg-success-500/30"
              : "text-foreground-muted hover:text-foreground hover:bg-surface-sunken"
          } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
          aria-label={isMuted || !isListening ? "Turn on microphone" : "Turn off microphone"}
          title={isMuted || !isListening ? "Unmute mic" : "Mute mic"}
        >
          {isMuted || !isListening ? (
            <MicOffIcon size="md" />
          ) : (
            <MicIcon size="md" />
          )}
        </button>

        {/* Speaker toggle */}
        <button
          type="button"
          onClick={onToggleSpeaker}
          disabled={disabled}
          className={`shrink-0 p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
            isSpeakerMuted
              ? "text-foreground-muted hover:text-foreground-muted hover:bg-surface-sunken"
              : "text-foreground-muted hover:text-foreground hover:bg-surface-sunken"
          } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
          aria-label={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
          title={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
        >
          {isSpeakerMuted ? (
            <VolumeXIcon size="md" />
          ) : (
            <Volume2Icon size="md" />
          )}
        </button>

        {/* Textarea */}
        <div className="flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Type a message..."
            rows={1}
            className="w-full resize-none bg-surface-sunken text-foreground placeholder-foreground-muted rounded-xl px-3.5 py-2.5 text-sm leading-snug border border-neutral-200 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Message input"
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={`shrink-0 p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
            canSend
              ? "bg-primary-600 text-on-filled hover:bg-primary-700 active:bg-primary-800"
              : "text-foreground-muted cursor-not-allowed"
          }`}
          aria-label="Send message"
        >
          <SendIcon size="md" />
        </button>
      </div>
    </div>
  );
}
