// Ambient declarations to support Node-style types in a browser project
// without depending on @types/node.

declare namespace NodeJS {
  type Timeout = ReturnType<typeof setTimeout>;
  type Timer = ReturnType<typeof setTimeout>;
  type Immediate = ReturnType<typeof setTimeout>;
}

declare var global: typeof globalThis;
