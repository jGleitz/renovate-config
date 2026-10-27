import fs from "node:fs/promises"
import { describe, expect } from "vitest"
import { renovateTest as test } from "./renovateTest.js"

describe("npm packages in Gradle version catalogs", () => {
  test("looks up scoped and unscoped npm packages while preserving Maven dependencies", async ({
    renovate,
  }) => {
    await fs.cp("test/fixtures/npm-version-catalogs", renovate.projectDir, { recursive: true })

    const dependencies = await renovate
      .withDataSourceOverride("npm", {
        prettier: ["3.4.2", "3.5.0"],
        "@vitest/coverage-v8": ["3.0.0", "3.1.0"],
        "@puppeteer/browsers": ["3.2.5", "3.2.6"],
        "proxy-agent": ["8.0.1", "8.0.2"],
      })
      .withDataSourceOverride("maven", {
        "org.junit.jupiter:junit-jupiter": ["5.11.0", "5.12.0"],
        "com.example.npm:helper": ["1.0.0", "1.1.0"],
      })
      .lookup()

    expect(dependencies).toHaveLength(6)
    for (const [name, version] of Object.entries({
      prettier: "3.5.0",
      "@vitest/coverage-v8": "3.1.0",
      "@puppeteer/browsers": "3.2.6",
      "proxy-agent": "8.0.2",
    })) {
      const dependency = dependencies.find((entry) => entry.depName === `npm:${name}`)
      expect(dependency, `missing npm dependency ${name}`).toMatchObject({
        versioning: "npm",
      })
      expect(dependency!.updates).toEqual(
        expect.arrayContaining([expect.objectContaining({ newValue: version })]),
      )
    }
    for (const name of ["org.junit.jupiter:junit-jupiter", "com.example.npm:helper"]) {
      expect(dependencies.find((entry) => entry.depName === name)).toMatchObject({
        packageName: name,
        datasource: "maven",
      })
    }
  })

  test("retains the catalog's production, test and build commit scopes for npm updates", async ({
    renovate,
  }) => {
    await fs.cp("test/fixtures/npm-version-catalogs", renovate.projectDir, { recursive: true })
    const branches = await renovate
      .withDataSourceOverride("npm", {
        prettier: ["3.4.2", "3.5.0"],
        "@vitest/coverage-v8": ["3.0.0", "3.1.0"],
        "@puppeteer/browsers": ["3.2.5", "3.2.6"],
        "proxy-agent": ["8.0.1", "8.0.2"],
      })
      .withDataSourceOverride("maven", {
        "org.junit.jupiter:junit-jupiter": ["5.11.0"],
        "com.example.npm:helper": ["1.0.0"],
      })
      .withGitRepository()
      .withSemanticCommits()
      .branches()

    for (const [name, title] of [
      ["prettier", /^fix\(deps\):/],
      ["@vitest/coverage-v8", /^chore\(test deps\):/],
      ["@puppeteer/browsers", /^chore\(build deps\):/],
      ["proxy-agent", /^chore\(build deps\):/],
    ] as const) {
      const branch = branches.find((entry) =>
        entry.updates.some((update) => update.depName === `npm:${name}`),
      )
      expect(branch, `missing branch for ${name}`).toBeDefined()
      expect(branch!.prTitle).toMatch(title)
      expect(branch!.prTitle).not.toContain("npm:")
    }
  })
})
