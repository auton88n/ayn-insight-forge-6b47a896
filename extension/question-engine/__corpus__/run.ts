/**
 * __corpus__/run.ts
 * Loads fixtures and prints what the engine produces per fixture, for eyeballing
 * during development. Phase 1: prints the (empty) output shape. Later phases fill
 * detection so this shows real reconstructed questions.
 */

import type { Fixture } from "./capture";

export function runFixture(fixture: Fixture): void {
  // Phase 2+: rebuild a DOM from the fixture and call scanForm, then print.
  // Phase 1: structural placeholder so the harness compiles and is wired.
  void fixture;
}
