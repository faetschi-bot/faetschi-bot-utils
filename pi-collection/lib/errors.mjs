// Shared error type so the CLI maps failures to exit codes and JSON output.
// code 2 = usage/argument error, code 1 = runtime/environment error.
export class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}
