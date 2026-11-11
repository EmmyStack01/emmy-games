// Error types used by the root build. Both carry human-readable messages that
// are printed as-is, so keep them clear and actionable.

/** A build step found one or more problems (portal, publish.json, output...). */
export class BuildError extends Error {
  constructor(step, problems) {
    const list = Array.isArray(problems) ? problems : [String(problems)];
    super(`${step}: ${list.join('; ')}`);
    this.name = 'BuildError';
    this.step = step;
    this.problems = list;
  }
}

/** The environment or configuration is invalid or inconsistent. */
export class BuildConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildConfigError';
  }
}
