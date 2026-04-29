# Renovate Configuration for Joshua Gleitze’s Open Source Projects

[I](https://github.com/jGleitz) use the configuration in this repository to get consistent behaviour
by [Renovate](https://github.com/renovatebot/renovate) in my
repositories.

## Files

`default.json5`: The configuration to use by default in all repositories.

## Commands

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `pnpm check`        | Run all checks (lint, validate, compile, test)  |
| `pnpm test`         | Run the tests                                   |
| `pnpm test:verbose` | Run the tests, printing all Renovate debug logs |
| `pnpm lint`         | Check code formatting                           |
| `pnpm format`       | Fix code formatting                             |
| `pnpm validate`     | Validate the Renovate configuration files       |
| `pnpm compile`      | Compile TypeScript                              |
