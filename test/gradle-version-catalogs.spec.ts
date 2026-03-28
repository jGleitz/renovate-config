import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"

describe("Gradle version catalogs", () => {
  renovateTest(
    "assigns correct semantic commit types to dependencies from different catalogs",
    async ({ renovate }) => {
      await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

      const branches = await renovate
        .withDatasourceOverride("maven", {
          "com.fasterxml.jackson.core:jackson-databind": ["2.17.0", "2.18.0"],
          "com.fasterxml.jackson.module:jackson-module-kotlin": ["2.17.0", "2.18.0"],
          "org.slf4j:slf4j-api": ["2.0.12", "2.0.16"],
          "org.junit.jupiter:junit-jupiter": ["5.10.2", "5.11.0"],
          "org.mockito:mockito-core": ["5.11.0", "5.15.0"],
          "io.gitlab.arturbosch.detekt:detekt-formatting": ["1.23.5", "1.23.7"],
          "org.jetbrains.kotlin.jvm:org.jetbrains.kotlin.jvm.gradle.plugin": ["1.9.23", "2.1.0"],
          "io.gitlab.arturbosch.detekt:io.gitlab.arturbosch.detekt.gradle.plugin": [
            "1.23.5",
            "1.23.7",
          ],
          "com.gradle.develocity:com.gradle.develocity.gradle.plugin": ["3.17", "3.19"],
        })
        .withGitRepo()
        .withSemanticCommits()
        .branches()

      // Production dependencies from gradle/libs.versions.toml should get fix(deps)
      const jacksonBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.fasterxml.jackson.core:jackson-databind"),
      )
      expect(jacksonBranch, "missing branch for jackson-databind").toBeDefined()
      expect(jacksonBranch!.prTitle).toMatch(/^fix\(deps\):/)

      // Test dependencies from gradle/testLibs.versions.toml should get chore(test deps)
      const junitBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.junit.jupiter:junit-jupiter"),
      )
      expect(junitBranch, "missing branch for junit-jupiter").toBeDefined()
      expect(junitBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      // Build dependencies from gradle/buildLibs.versions.toml should get chore(build deps)
      const kotlinBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.jetbrains.kotlin.jvm"),
      )
      expect(kotlinBranch, "missing branch for kotlin.jvm").toBeDefined()
      expect(kotlinBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      // Dependencies in settings.gradle.kts should get chore(build deps)
      const develocityBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.gradle.develocity"),
      )
      expect(develocityBranch, "missing branch for develocity").toBeDefined()
      expect(develocityBranch!.prTitle).toMatch(/^chore\(build deps\):/)
    },
  )
})
