# Renovate Configuration for Joshua Gleitze’s Open Source Projects

[I](https://github.com/jGleitz) use the configuration in this repository to get consistent behaviour
by [Renovate](https://github.com/renovatebot/renovate) in my
repositories.

## Files

`default.json5`: The configuration to use by default in all repositories.

## Gradle Version Catalogs

In Gradle projects, the scope of a dependency cannot be determined automatically from a dependency catalog.
This configuration supports different version catalog files to sort dependencies into production, test, and build dependencies.
The file name influences the semantic commit type and scope:

- Dependencies declared in `gradle/libs.versions.toml` are treated as production dependencies and use
  `fix(deps):`.
- Dependencies declared in `gradle/testLibs.versions.toml` are treated as test dependencies and use
  `chore(test deps):`.
- Dependencies declared in `gradle/buildLibs.versions.toml` are treated as build dependencies and use
  `chore(build deps):`.
- Dependencies declared directly in `settings.gradle.kts`, such as Gradle settings plugins, are also
  treated as build dependencies and use `chore(build deps):`.

The classification applies regardless of whether the available update is a patch, minor, or major update.

### npm Packages

Use the reserved `npm` group to declare npm packages in the same catalogs:

```toml
[versions]
proxy-agent = "8.0.1"

[libraries]
puppeteer-browsers = "npm:@puppeteer/browsers:3.2.5"
prettier = { module = "npm:prettier", version = "3.4.2" }
proxy-agent = { group = "npm", name = "proxy-agent", version.ref = "proxy-agent" }
```

Renovate looks these packages up in the npm registry with npm versioning, dropping the `npm:` prefix
for package lookups and update titles. Both scoped and unscoped package names are supported.
The prefix remains in the catalog, and the catalog's production, test or build commit scope still
applies. Other Maven dependencies are unaffected. A Gradle build consuming these entries must remove
the reserved group before passing the package name and version to its npm dependency API; they are
not Maven artefacts.

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
