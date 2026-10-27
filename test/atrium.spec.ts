import { describe, expect } from "vitest"
import { renovateTest as test } from "./renovateTest.js"
import fs from "node:fs/promises"

describe("Atrium", () => {
  test("groups all Atrium artifacts into one branch", async ({ renovate }) => {
    await fs.cp("test/fixtures/atrium", renovate.projectDir, { recursive: true })

    const branches = await renovate
      .withDataSourceOverride("maven", {
        "ch.tutteli.atrium:atrium-core-api": ["0.14.0", "0.15.0"],
        "ch.tutteli.atrium:atrium-logic": ["0.14.0", "0.15.0"],
        "ch.tutteli.atrium:atrium-fluent-en_GB": ["0.14.0", "0.15.0"],
        "ch.tutteli.atrium:atrium-specs": ["0.14.0", "0.15.0"],
        "com.fasterxml.jackson.core:jackson-databind": ["2.17.0", "2.17.2"],
      })
      .withGitRepository()
      .withSemanticCommits()
      .branches()

    const atriumBranches = branches.filter((b) =>
      b.updates.some((u) => u.depName?.startsWith("ch.tutteli.atrium:")),
    )
    expect(atriumBranches, "Atrium artifacts must be updated in exactly one branch").toHaveLength(1)

    const atriumDepNames = atriumBranches[0]!.updates.map((u) => u.depName).sort()
    expect(atriumDepNames).toEqual([
      "ch.tutteli.atrium:atrium-core-api",
      "ch.tutteli.atrium:atrium-fluent-en_GB",
      "ch.tutteli.atrium:atrium-logic",
      "ch.tutteli.atrium:atrium-specs",
    ])
  })
})
