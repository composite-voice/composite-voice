/**
 * Ambient module declarations for the optional Discord voice peer
 * dependencies used by {@link DiscordVoice}.
 *
 * @remarks
 * `@discordjs/voice` and `prism-media` are **optional peer dependencies** —
 * they are not installed in this repository, so TypeScript cannot resolve the
 * literal dynamic-import specifiers that `importPeerDep` requires (bundlers
 * can only statically analyse literal specifiers). These minimal ambient
 * declarations satisfy the compiler; the real runtime shape is described by
 * the local structural interfaces in `DiscordVoice.ts`, which `importPeerDep`'s
 * generic cast applies.
 *
 * The exports are deliberately typed as `unknown` so nothing accidentally
 * relies on these stubs for type safety. If the packages are later installed
 * (e.g. as devDependencies for integration tests), these declarations are
 * simply redundant.
 */

declare module '@discordjs/voice' {
  const createAudioPlayer: unknown;
  const createAudioResource: unknown;
  const StreamType: unknown;
  const EndBehaviorType: unknown;
  const AudioPlayerStatus: unknown;
  export { createAudioPlayer, createAudioResource, StreamType, EndBehaviorType, AudioPlayerStatus };
}

declare module 'prism-media' {
  const opus: unknown;
  export { opus };
}
