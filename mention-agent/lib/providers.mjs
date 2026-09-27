// Provider registry.
//
// A "provider" is an entry that maps a model ecosystem to the environment
// variable the agent expects and to a sensible default model. The CLI uses this
// to fill in `provider.env`, `provider.secret`, and `model` defaults; the
// reusable workflow never hardcodes a provider name, it exports whatever
// `provider-env` names, so adding a provider is a data change here.
//
// Extending to several provider credentials in one run is intentionally not
// done yet: the reusable workflow accepts one `provider-env`/`provider-key`
// pair. The registry is shaped so that a future `providers: [...]` list can be
// layered on without changing the CLI's public flags.

export const PROVIDERS = {
  opencode: {
    env: 'OPENCODE_API_KEY',
    secret: 'OPENCODE_API_KEY',
    model: 'opencode-go/deepseek-v4.1-flash',
  },
  openai: {
    env: 'OPENAI_API_KEY',
    secret: 'OPENAI_API_KEY',
    model: 'openai/gpt-5.6-sol',
  },
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    secret: 'ANTHROPIC_API_KEY',
    model: 'anthropic/claude-sonnet-4-5',
  },
};

export const DEFAULT_PROVIDER = 'opencode';

export function getProvider(name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  return Object.prototype.hasOwnProperty.call(PROVIDERS, name) ? PROVIDERS[name] : null;
}

export function providerNames() {
  return Object.keys(PROVIDERS);
}
