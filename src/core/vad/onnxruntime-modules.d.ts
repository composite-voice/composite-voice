/**
 * Ambient module declarations for the optional ONNX Runtime peer
 * dependencies used by {@link SileroVAD}.
 *
 * @remarks
 * `onnxruntime-web` and `onnxruntime-node` are **optional peer
 * dependencies** — they are not installed in this repository, so TypeScript
 * cannot resolve the literal dynamic-import specifiers that `importPeerDep`
 * requires (bundlers can only statically analyse literal specifiers). These
 * minimal ambient declarations satisfy the compiler; the real runtime shape
 * is described by the structural `OrtLike` interface in `SileroVAD.ts`,
 * which `importPeerDep`'s generic cast applies.
 *
 * The exports are deliberately typed as `unknown` so nothing accidentally
 * relies on these stubs for type safety. If the packages are later installed
 * (e.g. as devDependencies for integration tests), these declarations are
 * simply redundant.
 */

declare module 'onnxruntime-web' {
  const Tensor: unknown;
  const InferenceSession: unknown;
  export { Tensor, InferenceSession };
}

declare module 'onnxruntime-node' {
  const Tensor: unknown;
  const InferenceSession: unknown;
  export { Tensor, InferenceSession };
}
