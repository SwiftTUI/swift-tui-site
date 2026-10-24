// Known-issue guard for the D1 adversarial corpus (swift-tui-org adversarial
// campaign two, STUI-1159). bun:test has no `withKnownIssue`, so a reproduced
// finding wraps ONLY its failing expectation in `d1KnownIssue`: the suite stays
// green, the observed failure is printed as a `D1_KNOWN_ASSERTION` line, and
// the guard fails loudly once the expectation unexpectedly passes so a fix is
// noticed and the wrapper removed. Fixture preconditions and passing checks
// stay ordinary `expect` calls. Set D1_UNMARKED=1 to run every guarded
// expectation unwrapped (the "unmarked" evidence run).

export interface D1KnownIssueRecord {
  id: string;
  note: string;
  observed: string;
}

export const d1KnownIssues: D1KnownIssueRecord[] = [];

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");
}

export function d1KnownIssue(
  id: string,
  note: string,
  expectation: () => void,
): void {
  if (process.env.D1_UNMARKED === "1") {
    expectation();
    return;
  }
  try {
    expectation();
  } catch (error) {
    const observed = describe(error);
    d1KnownIssues.push({ id, note, observed });
    console.log(`D1_KNOWN_ASSERTION ${id}: ${note}; observed: ${observed}`);
    return;
  }
  throw new Error(
    `${id}: the guarded expectation passed, so the known issue no longer reproduces (${note}). Remove the d1KnownIssue wrapper.`,
  );
}
