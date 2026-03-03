/**
 * String templates used by CLI commands.
 * Extracted here so they can be unit-tested without filesystem or subprocess setup.
 */

/**
 * Printed after strand update/generate completes.
 * Gives agents a clear signal that this regeneration supersedes any prior
 * .strand content loaded earlier in the conversation context.
 */
export function SUPERSESSION_MESSAGE(isoTimestamp: string): string {
  return `.strand regenerated (${isoTimestamp}) — supersedes any prior .strand in context.`;
}

/**
 * The section appended to CLAUDE.md by `strand init`.
 * Includes the trust directive with mid-session carve-out.
 */
export const CLAUDE_MD_SECTION = `
---

## Codebase Map

Before exploring files to answer questions about structure, architecture,
dependencies, or change impact — read the .strand encoding first. Only
open individual files when you need implementation details the encoding
doesn't provide.

Treat .strand data as ground truth for structural facts (blast radius,
complexity, import counts, test coverage). If you have run \`strand update\`
during this session and read the new file, that version supersedes the
session-start version. Prefer the most recently read .strand in all decisions.

@.strand
`;
