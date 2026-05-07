import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"

describe("Gradle version catalogs", () => {
  renovateTest(
    "assigns correct semantic commit types to dependencies from different catalogs",
    async ({ renovate }) => {
      await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

      const branches = await renovate
        .withDataSourceOverride("maven", {
          // Production deps (libs.versions.toml) - patch update
          "com.fasterxml.jackson.core:jackson-databind": ["2.17.0", "2.17.2"],
          // Production deps (libs.versions.toml) - minor update
          "org.slf4j:slf4j-api": ["2.0.12", "2.1.0"],
          // Production deps (libs.versions.toml) - major update
          "org.apache.commons:commons-lang3": ["3.14.0", "4.0.0"],
          // Test deps (testLibs.versions.toml) - patch update
          "org.junit.jupiter:junit-jupiter": ["5.10.2", "5.10.4"],
          // Test deps (testLibs.versions.toml) - minor update
          "org.mockito:mockito-core": ["5.11.0", "5.12.0"],
          // Test deps (testLibs.versions.toml) - major update
          "org.assertj:assertj-core": ["3.25.3", "4.0.0"],
          // Build deps (buildLibs.versions.toml) - patch update
          "io.gitlab.arturbosch.detekt:detekt-formatting": ["1.23.5", "1.23.7"],
          "io.gitlab.arturbosch.detekt:io.gitlab.arturbosch.detekt.gradle.plugin": [
            "1.23.5",
            "1.23.7",
          ],
          // Build deps (buildLibs.versions.toml) - minor update
          "org.jetbrains.kotlin.jvm:org.jetbrains.kotlin.jvm.gradle.plugin": ["1.9.23", "1.10.0"],
          // Build deps (settings.gradle.kts) - major update
          "com.gradle.develocity:com.gradle.develocity.gradle.plugin": ["3.17", "4.0.0"],
        })
        .withGitRepository()
        .withSemanticCommits()
        .branches()

      // Production dependencies from gradle/libs.versions.toml should get fix(deps)
      // regardless of update type (patch, minor, major)
      const jacksonBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.fasterxml.jackson.core:jackson-databind"),
      )
      expect(jacksonBranch, "missing branch for jackson-databind patch update").toBeDefined()
      expect(jacksonBranch!.prTitle).toMatch(/^fix\(deps\):/)

      const slf4jBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.slf4j:slf4j-api"),
      )
      expect(slf4jBranch, "missing branch for slf4j-api minor update").toBeDefined()
      expect(slf4jBranch!.prTitle).toMatch(/^fix\(deps\):/)

      const commonsLangBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.apache.commons:commons-lang3"),
      )
      expect(commonsLangBranch, "missing branch for commons-lang3 major update").toBeDefined()
      expect(commonsLangBranch!.prTitle).toMatch(/^fix\(deps\):/)

      // Test dependencies from gradle/testLibs.versions.toml should get chore(test deps)
      // regardless of update type (patch, minor, major)
      const junitBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.junit.jupiter:junit-jupiter"),
      )
      expect(junitBranch, "missing branch for junit-jupiter patch update").toBeDefined()
      expect(junitBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      const mockitoBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.mockito:mockito-core"),
      )
      expect(mockitoBranch, "missing branch for mockito-core minor update").toBeDefined()
      expect(mockitoBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      const assertjBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.assertj:assertj-core"),
      )
      expect(assertjBranch, "missing branch for assertj-core major update").toBeDefined()
      expect(assertjBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      // Build dependencies should get chore(build deps)
      // regardless of update type (patch, minor, major)
      const detektBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "io.gitlab.arturbosch.detekt"),
      )
      expect(detektBranch, "missing branch for detekt patch update").toBeDefined()
      expect(detektBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      const kotlinBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.jetbrains.kotlin.jvm"),
      )
      expect(kotlinBranch, "missing branch for kotlin.jvm minor update").toBeDefined()
      expect(kotlinBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      const develocityBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.gradle.develocity"),
      )
      expect(develocityBranch, "missing branch for develocity major update").toBeDefined()
      expect(develocityBranch!.prTitle).toMatch(/^chore\(build deps\):/)
    },
  )
})
