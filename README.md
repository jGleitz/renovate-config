# Renovate Configuration for Joshua Gleitze’s Open Source Projects

[I](https://github.com/jGleitz) use the configuration in this repository to get consistent behaviour
by [Renovate](https://github.com/renovatebot/renovate) in my
repositories.

## Files

`default.json5`: The configuration to use by default in all repositories.

## Commands

| Command                | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `npm run check`        | Run all checks (lint, validate, compile, test)  |
| `npm test`             | Run the tests                                   |
| `npm run test:verbose` | Run the tests, printing all Renovate debug logs |
| `npm run lint`         | Check code formatting                           |
| `npm run format`       | Fix code formatting                             |
| `npm run validate`     | Validate the Renovate configuration files       |
| `npm run compile`      | Compile TypeScript                              |
