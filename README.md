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

## Testing

The tests run [Renovate](https://github.com/renovatebot/renovate) as a subprocess and verify the
configuration's behaviour. Renovate emits detailed debug logs during test runs.

By default (`npm test`), these logs are captured and printed only when a test fails, keeping the
output clean for passing tests. This is achieved by forwarding all Renovate output to
`console.log`/`console.error` and configuring [vitest](https://vitest.dev) with
`silent: "passed-only"`.

To print the Renovate debug logs for all test cases (useful when debugging), run:

```sh
npm run test:verbose
```
