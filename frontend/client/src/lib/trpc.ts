// Temporary compatibility shim for migration leftovers.
// The active frontend now runs as a Vite client app; the previous tRPC server
// files are not present in this tree. Keeping this as `any` lets legacy,
// currently unused modules typecheck until the API adapter is restored.
export const trpc: any = {};

export type RouterInputs = any;
export type RouterOutputs = any;
