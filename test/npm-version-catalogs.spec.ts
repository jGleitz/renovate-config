import fs from "node:fs/promises"
import { createServer } from "node:http"
import { once } from "node:events"
import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"

const test = renovateTest.extend<{ npmRegistry: string }>({
  npmRegistry: async ({}, use) => {
    const packages: Record<string, string[]> = {
      prettier: ["3.4.2", "3.5.0"],
      "@vitest/coverage-v8": ["3.0.0", "3.1.0"],
      "@puppeteer/browsers": ["3.2.5", "3.2.6"],
      "proxy-agent": ["8.0.1", "8.0.2"],
    }
    const requestedPackages = new Set<string>()
    const server = createServer((request, response) => {
      const name = decodeURIComponent((request.url ?? "/").slice(1))
      const versions = packages[name]
      if (!versions) {
        response.writeHead(404).end()
        return
      }
      requestedPackages.add(name)
      response.setHeader("Content-Type", "application/json")
      response.end(
        JSON.stringify({
          name,
          "dist-tags": { latest: versions.at(-1) },
          versions: Object.fromEntries(versions.map((version) => [version, { name, version }])),
          time: Object.fromEntries(versions.map((version) => [version, "2026-01-01T00:00:00Z"])),
        }),
      )
    })
    const listening = once(server, "listening")
    server.listen(0, "127.0.0.1")
    await listening
    try {
      const address = server.address()
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP address for the npm registry")
      }
      await use(`http://127.0.0.1:${address.port}/`)
      expect(requestedPackages).toEqual(new Set(Object.keys(packages)))
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
})

describe("npm packages in Gradle version catalogs", () => {
  test("looks up scoped and unscoped npm packages while preserving Maven dependencies", async ({
    renovate,
    npmRegistry,
  }) => {
    await fs.cp("test/fixtures/npm-version-catalogs", renovate.projectDir, { recursive: true })

    const dependencies = await renovate
      .withNpmRegistry(npmRegistry)
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
    npmRegistry,
  }) => {
    await fs.cp("test/fixtures/npm-version-catalogs", renovate.projectDir, { recursive: true })
    const branches = await renovate
      .withNpmRegistry(npmRegistry)
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
