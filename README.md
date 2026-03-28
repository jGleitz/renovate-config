# Renovate Configuration for Joshua Gleitze’s Open Source Projects

[I](https://github.com/jGleitz) use the configuration in this repository to get consistent behaviour
by [Renovate](https://github.com/renovatebot/renovate) in my
repositories.

## Files

`default.json5`: The configuration to use by default in all repositories.

## Commands

| Command                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `pnpm run check`        | Run all checks (lint, validate, compile, test)  |
| `pnpm test`             | Run the tests                                   |
| `pnpm run test:verbose` | Run the tests, printing all Renovate debug logs |
| `pnpm run lint`         | Check code formatting                           |
| `pnpm run format`       | Fix code formatting                             |
| `pnpm run validate`     | Validate the Renovate configuration files       |
| `pnpm run compile`      | Compile TypeScript                              |
