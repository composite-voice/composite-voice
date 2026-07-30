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
 * - {@link DiscordVoice} — Voice-channel conversations via @discordjs/voice (duplex, server)
 *
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the interface contracts
 */

export * from './discord/index';
