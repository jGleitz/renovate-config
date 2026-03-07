import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"

describe("Gradle version catalogs", () => {
  renovateTest(
    "assigns correct semantic commit types to dependencies from different catalogs",
    async ({ renovate }) => {
      await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

      const branches = await renovate
        .withOverriddenDatasource("maven", {
          "com.fasterxml.jackson.core:jackson-databind": ["2.17.0", "2.17.2", "3.0.0"],
          "org.junit.jupiter:junit-jupiter": ["5.10.2", "5.10.4", "6.0.0"],
          "org.jetbrains.kotlin.jvm:org.jetbrains.kotlin.jvm.gradle.plugin": [
            "1.9.23",
            "1.9.25",
            "2.0.0",
          ],
          "com.gradle.develocity:com.gradle.develocity.gradle.plugin": ["3.17", "3.17.1", "4.0.0"],
        })
        .withGitRepo()
        .withSemanticCommits()
        .branches()

      // Production dependencies from gradle/libs.versions.toml should get fix(deps)
      const jacksonPatchBranch = branches.find((b) =>
        b.upgrades.some(
          (u) =>
            u.depName === "com.fasterxml.jackson.core:jackson-databind" && u.updateType === "patch",
        ),
      )
      expect(jacksonPatchBranch, "missing patch branch for jackson-databind").toBeDefined()
      expect(jacksonPatchBranch!.prTitle).toMatch(/^fix\(deps\):/)

      const jacksonMajorBranch = branches.find((b) =>
        b.upgrades.some(
          (u) =>
            u.depName === "com.fasterxml.jackson.core:jackson-databind" && u.updateType === "major",
        ),
      )
      expect(jacksonMajorBranch, "missing major branch for jackson-databind").toBeDefined()
      expect(jacksonMajorBranch!.prTitle).toMatch(/^fix\(deps\):/)

      // Test dependencies from gradle/testLibs.versions.toml should get chore(test deps)
      const junitPatchBranch = branches.find((b) =>
        b.upgrades.some(
          (u) => u.depName === "org.junit.jupiter:junit-jupiter" && u.updateType === "patch",
        ),
      )
      expect(junitPatchBranch, "missing patch branch for junit-jupiter").toBeDefined()
      expect(junitPatchBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      const junitMajorBranch = branches.find((b) =>
        b.upgrades.some(
          (u) => u.depName === "org.junit.jupiter:junit-jupiter" && u.updateType === "major",
        ),
      )
      expect(junitMajorBranch, "missing major branch for junit-jupiter").toBeDefined()
      expect(junitMajorBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      // Build dependencies from gradle/buildLibs.versions.toml should get chore(build deps)
      const kotlinPatchBranch = branches.find((b) =>
        b.upgrades.some(
          (u) => u.depName === "org.jetbrains.kotlin.jvm" && u.updateType === "patch",
        ),
      )
      expect(kotlinPatchBranch, "missing patch branch for kotlin.jvm").toBeDefined()
      expect(kotlinPatchBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      const kotlinMajorBranch = branches.find((b) =>
        b.upgrades.some(
          (u) => u.depName === "org.jetbrains.kotlin.jvm" && u.updateType === "major",
        ),
      )
      expect(kotlinMajorBranch, "missing major branch for kotlin.jvm").toBeDefined()
      expect(kotlinMajorBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      // Dependencies in settings.gradle.kts should get chore(build deps)
      const develocityPatchBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.gradle.develocity" && u.updateType === "patch"),
      )
      expect(develocityPatchBranch, "missing patch branch for develocity").toBeDefined()
      expect(develocityPatchBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      const develocityMajorBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.gradle.develocity" && u.updateType === "major"),
      )
      expect(develocityMajorBranch, "missing major branch for develocity").toBeDefined()
      expect(develocityMajorBranch!.prTitle).toMatch(/^chore\(build deps\):/)
    },
  )
})
