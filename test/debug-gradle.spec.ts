import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"
import path from "node:path"
import childProcess from "node:child_process"

describe("Debug", () => {
  renovateTest("debug", async ({ renovate }) => {
    await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

    const name = "maven"
    const versions: Record<string, string[]> = { "com.fasterxml.jackson.core:jackson-databind": ["2.17.0", "2.18.0"] }
    for (const [pkg, vers] of Object.entries(versions)) {
      await fs.writeFile(path.join(renovate.projectDir, `${name}-${pkg}-versions.txt`), vers.join("\n"), "utf-8")
    }
    
    const customDatasources = { [name]: { defaultRegistryUrlTemplate: `file://${path.join(renovate.projectDir, `${name}-{{packageName}}-versions.txt`)}`, format: "plain" } }
    const packageRules = [{ matchDatasources: [name], overrideDatasource: `custom.${name}`, registryUrls: [] }]

    const nodeJsPath = process.argv[0]!
    const renovateIndexJs = path.join(process.cwd(), "node_modules", "renovate", "dist", "renovate")
    
    await new Promise<void>((resolve, reject) => {
      childProcess.exec("git init && git add -A && git commit -m 'fix: initial commit'", {
        cwd: renovate.projectDir,
        env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@test.com" },
      }, (err) => err ? reject(err) : resolve())
    })
    
    const result = childProcess.spawnSync(nodeJsPath, [
      renovateIndexJs, "--platform=local", '--host-rules=[{"enabled":false}]',
      `--custom-datasources=${JSON.stringify(customDatasources)}`,
      `--package-rules=${JSON.stringify(packageRules)}`,
      "--semantic-commits=enabled",
      "--force-cli=false",
      "--dry-run=full",
    ], {
      cwd: renovate.projectDir,
      env: { ...process.env, LOG_LEVEL: "debug", LOG_FORMAT: "json" },
      maxBuffer: 50 * 1024 * 1024,
    })
    
    // Get all log messages
    const stdout = result.stdout.toString()
    const lines = stdout.split("\n").filter(l => l.trim())
    const allMsgs = lines.map(l => { try { return JSON.parse(l).msg } catch { return null } }).filter(Boolean)
    
    await fs.writeFile("/tmp/debug-output.txt", allMsgs.join("\n"), "utf-8")
    expect(true).toBe(true)
  })
})
