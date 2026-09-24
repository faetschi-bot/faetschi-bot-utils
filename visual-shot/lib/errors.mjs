export class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}
