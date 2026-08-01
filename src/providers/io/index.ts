/**
 * @packageDocumentation
 * Platform input/output providers for the CompositeVoice SDK.
 *
 * @remarks
 * This module exports providers that connect the 5-role pipeline to
 * call and chat platforms. Duplex providers cover both the `'input'`
 * and `'output'` roles (one object per call/conversation); receive-only
 * platforms cover `'input'` alone and pair with {@link NullOutput} or
 * another output provider.
 *
 * - {@link TwilioMediaStream} — Phone calls via Twilio Media Streams (duplex, server)
 * - {@link VonageAudioSocket} — Phone calls via the Vonage Voice API WebSocket (duplex, server)
 * - {@link DiscordVoice} — Voice-channel conversations via @discordjs/voice (duplex, server)
 * - {@link ZoomRtmsInput} — Meeting audio via Zoom Realtime Media Streams (input-only, server)
 * - {@link GoogleMeetInput} — Conference audio via the Google Meet Media API (input-only, browser)
 * - {@link TeamsCall} — Microsoft Teams meetings via Azure Communication Services interop (duplex, browser)
 *
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the interface contracts
 */

export * from './twilio/index';
export * from './vonage/index';
export * from './discord/index';
export * from './zoom/index';
export * from './meet/index';
export * from './teams/index';
