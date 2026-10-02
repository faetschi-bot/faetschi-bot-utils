// CLI failures that should print a message and set an exit code, not a stack.
export class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}
