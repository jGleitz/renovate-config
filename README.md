# Renovate Configuration for Joshua Gleitze’s Open Source Projects

[I](https://github.com/jGleitz) use the configuration in this repository to get consistent behaviour
by [Renovate](https://github.com/renovatebot/renovate) in my
repositories.

## Files

`default.json5`: The configuration to use by default in all repositories.

## Gradle Version Catalogs

For Gradle projects, this configuration uses the version catalog file that contains a dependency to
choose the semantic commit type and scope for Renovate PRs. This lets dependency updates communicate
whether they affect production code, tests, or the build itself:

- Dependencies declared in `gradle/libs.versions.toml` are treated as production dependencies and use
  `fix(deps):`.
- Dependencies declared in `gradle/testLibs.versions.toml` are treated as test dependencies and use
  `chore(test deps):`.
- Dependencies declared in `gradle/buildLibs.versions.toml` are treated as build dependencies and use
  `chore(build deps):`.
- Dependencies declared directly in `settings.gradle.kts`, such as Gradle settings plugins, are also
  treated as build dependencies and use `chore(build deps):`.

The classification is based on Renovate’s `matchFileNames` package rules, so it applies regardless of
whether the available update is a patch, minor, or major update.

## Commands
