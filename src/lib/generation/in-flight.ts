// Section 11.1: "the trigger button must be disabled — not just visually,
// but functionally — ignore duplicate clicks." There's no review UI yet
// (out of scope this stage) to hold that disabled state, so this is the
// server-side backstop: a second request for the same proposal+section
// while one is still running is rejected outright rather than queued or
// re-run. Process-local (a single Next.js server instance) — the primary
// defense is still the client disabling its own button once that UI exists.
const inFlight = new Set<string>();

function keyFor(proposalId: string, section: string): string {
  return `${proposalId}:${section}`;
}

export function tryAcquire(proposalId: string, section: string): boolean {
  const key = keyFor(proposalId, section);
  if (inFlight.has(key)) {
    return false;
  }
  inFlight.add(key);
  return true;
}

export function release(proposalId: string, section: string): void {
  inFlight.delete(keyFor(proposalId, section));
}
