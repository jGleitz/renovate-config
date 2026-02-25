import { test, TestAPI } from "vitest"
import fs from "node:fs/promises"
import which from "which"
import { RenovateRun } from "./RenovateRun.js"
import os from "node:os"
import path from "node:path"

interface RenovateTest {
  readonly renovate: RenovateRun
}

interface RenovateTestPrivate extends RenovateTest {
  projectDir: string
  nodeJsPath: string
}

export const renovateTest: TestAPI<RenovateTest> = test.extend<RenovateTestPrivate>({
  nodeJsPath: [
    async ({}, use) => {
      const nodeJsPath = await which("node")

      await use(nodeJsPath)
    },
    { scope: "worker" },
  ],

  projectDir: async ({}, use) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "renovate-test-"))
    await fs.cp("default.json5", path.join(tmpDir, "renovate.json5"))

    await use(tmpDir)

    await fs.rm(tmpDir, { recursive: true, force: true })
  },

  renovate: async ({ nodeJsPath, projectDir }, use) => {
    await use(new RenovateRun(nodeJsPath, projectDir))
  },
})
