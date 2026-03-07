import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"

describe("Gradle version catalogs", () => {
  renovateTest(
    "assigns correct semantic commit types to dependencies from different catalogs",
    async ({ renovate }) => {
      await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

      const branches = await renovate.initGitRepo().branches()

      // Production dependencies from gradle/libs.versions.toml should get fix(deps)
      const jacksonBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.fasterxml.jackson.core:jackson-databind"),
      )
      expect(jacksonBranch).toBeDefined()
      expect(jacksonBranch!.prTitle).toMatch(/^fix\(deps\):/)

      // Test dependencies from gradle/testLibs.versions.toml should get chore(test deps)
      const junitBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.junit.jupiter:junit-jupiter"),
      )
      expect(junitBranch).toBeDefined()
      expect(junitBranch!.prTitle).toMatch(/^chore\(test deps\):/)

      // Build dependencies from gradle/buildLibs.versions.toml should get chore(build deps)
      const kotlinBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "org.jetbrains.kotlin.jvm"),
      )
      expect(kotlinBranch).toBeDefined()
      expect(kotlinBranch!.prTitle).toMatch(/^chore\(build deps\):/)

      // Dependencies in settings.gradle.kts should get chore(build deps)
      const develocityBranch = branches.find((b) =>
        b.upgrades.some((u) => u.depName === "com.gradle.develocity"),
      )
      expect(develocityBranch).toBeDefined()
      expect(develocityBranch!.prTitle).toMatch(/^chore\(build deps\):/)
    },
  )
})
