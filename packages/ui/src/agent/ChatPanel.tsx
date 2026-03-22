/**
 * ChatPanel — main orchestrator for the voice agent UI.
 *
 * Combines AgentPanelHeader, message list, streaming text,
 * ThinkingIndicator, InterimTranscript, and ChatInput into a
 * single cohesive panel body. Handles auto-scrolling to the
 * bottom of the message list when new content arrives.
 */

import { useEffect, useRef } from "react";
import { AgentPanelHeader } from "./AgentPanelHeader";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { InterimTranscript } from "./InterimTranscript";
import type { VoiceAgentState, VoiceAgentActions } from "./types";

interface ChatPanelProps {
  /** Voice agent state */
  state: VoiceAgentState;
  /** Voice agent actions */
  actions: VoiceAgentActions;
  /** Close the panel */
  onClose: () => void;
}

export function ChatPanel({ state, actions, onClose }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages, streaming text, or status change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.streamingText, state.status, state.interimTranscript]);

  const isThinking = state.status === "thinking" && !state.streamingText;
  const isStreaming = state.streamingText.length > 0;

  return (
    <>
      {/* Header */}
      <AgentPanelHeader
        status={state.status}
        onClose={onClose}
        onClear={actions.clearHistory}
      />

      {/* Message area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 scroll-smooth"
        role="list"
        aria-label="Conversation messages"
      >
        {/* Empty state */}
        {state.messages.length === 0 && !isThinking && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-primary-500"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm text-foreground-muted mb-1">
              No messages yet
            </p>
            <p className="text-xs text-foreground-muted">
              Start talking or type a message below
            </p>
          </div>
        )}

        {/* Messages */}
        {state.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Streaming text (assistant response in progress) */}
        {isStreaming && (
          <div className="flex justify-start mb-3" role="listitem">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-surface-sunken text-foreground">
              <p className="whitespace-pre-wrap leading-relaxed">
                {state.streamingText}
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary-500 animate-pulse align-text-bottom rounded-sm" aria-hidden="true" />
              </p>
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {isThinking && <ThinkingIndicator />}

        {/* Interim transcript */}
        <InterimTranscript text={state.interimTranscript} />

        {/* Error banner */}
        {state.error && (
          <div className="mx-2 mb-3 px-3 py-2 rounded-lg bg-danger-100 border border-danger-300 text-danger-700 text-xs">
            {state.error}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* Input bar */}
      <ChatInput
        onSend={actions.sendTextMessage}
        onToggleMic={actions.toggleMic}
        onToggleSpeaker={actions.toggleSpeaker}
        isListening={state.isListening}
        isMuted={state.isMuted}
        isSpeakerMuted={state.isSpeakerMuted}
        disabled={state.status === "connecting"}
      />
    </>
  );
}
