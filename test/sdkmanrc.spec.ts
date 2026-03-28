import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"

describe(".sdkmanrc files", () => {
  renovateTest("detects the Java version and finds updates for it", async ({ renovate }) => {
    await fs.cp("test/fixtures/sdkmanrc", renovate.projectDir, { recursive: true })

    const lookedUpDependencies = await renovate
      .withDataSourceOverride("java-version", {
        java: ["24.0.1+9", "24.1.0+10", "25.0.2+10.0.LTS"],
      })
      .lookup()

    expect(lookedUpDependencies).toHaveLength(1)
    expect(lookedUpDependencies[0]).toMatchObject({
      depName: "java",
      packageName: "java",
      currentValue: "24.0.1",
      datasource: "java-version",
    })
    const updates = lookedUpDependencies[0]!.updates
    expect(updates.find((u) => u.updateType === "minor")).toMatchObject({
      newVersion: "24.1.0",
      newValue: "24.1.0",
    })
    expect(updates.find((u) => u.updateType === "major")).toMatchObject({
      newVersion: "25.0.2",
      newValue: "25.0.2",
    })
  })
})
