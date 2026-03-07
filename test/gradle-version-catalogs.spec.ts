import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"

describe("Gradle version catalogs", () => {
  renovateTest(
    "assigns correct semantic commit types to dependencies from different catalogs",
    async ({ renovate }) => {
      await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

      const dependencies = await renovate.extract()

      // Verify all dependencies are extracted
      const jacksonDatabind = dependencies.find(
        (d) => d.depName === "com.fasterxml.jackson.core:jackson-databind",
      )
      expect(jacksonDatabind).toBeDefined()

      const junitJupiter = dependencies.find((d) => d.depName === "org.junit.jupiter:junit-jupiter")
      expect(junitJupiter).toBeDefined()

      const kotlinPlugin = dependencies.find((d) => d.depName === "org.jetbrains.kotlin.jvm")
      expect(kotlinPlugin).toBeDefined()

      const develocityPlugin = dependencies.find((d) => d.depName === "com.gradle.develocity")
      expect(develocityPlugin).toBeDefined()

      // Production dependencies from gradle/libs.versions.toml should get fix(deps)
      expect(jacksonDatabind).toMatchObject({
        semanticCommitType: "fix",
        semanticCommitScope: "deps",
      })

      // Test dependencies from gradle/testLibs.versions.toml should get chore(test deps)
      expect(junitJupiter).toMatchObject({
        semanticCommitType: "chore",
        semanticCommitScope: "test deps",
      })

      // Build dependencies from gradle/buildLibs.versions.toml should get chore(build deps)
      expect(kotlinPlugin).toMatchObject({
        semanticCommitType: "chore",
        semanticCommitScope: "build deps",
      })

      // Dependencies in settings.gradle.kts should get chore(build deps)
      expect(develocityPlugin).toMatchObject({
        semanticCommitType: "chore",
        semanticCommitScope: "build deps",
      })
    },
  )
})
