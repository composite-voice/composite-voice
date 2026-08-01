/**
 * Ambient module declarations for the optional Azure Communication Services
 * peer dependencies used by {@link TeamsCall}.
 *
 * @remarks
 * `@azure/communication-calling` and `@azure/communication-common` are
 * **optional peer dependencies** — they are not installed in this repository,
 * so TypeScript cannot resolve the literal dynamic-import specifiers that
 * `importPeerDep` requires (bundlers can only statically analyse literal
 * specifiers). These minimal ambient declarations satisfy the compiler; the
 * real runtime shape is described by the local structural interfaces in
 * `TeamsCall.ts`, which `importPeerDep`'s generic cast applies.
 *
 * The exports are deliberately typed as `unknown` so nothing accidentally
 * relies on these stubs for type safety. If the packages are later installed
 * (e.g. as devDependencies for integration tests), these declarations are
 * simply redundant.
 */

declare module '@azure/communication-calling' {
  const CallClient: unknown;
  const LocalAudioStream: unknown;
  export { CallClient, LocalAudioStream };
}

declare module '@azure/communication-common' {
  const AzureCommunicationTokenCredential: unknown;
  export { AzureCommunicationTokenCredential };
}
