import { describe, expect } from "vitest"
import { renovateTest } from "./renovateTest.js"
import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"

async function createMavenMetadata(
  repoDir: string,
  groupId: string,
  artifactId: string,
  versions: string[],
): Promise<void> {
  const groupPath = groupId.replace(/\./g, "/")
  const dir = path.join(repoDir, groupPath, artifactId)
  await fs.mkdir(dir, { recursive: true })
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<metadata>`,
    `  <groupId>${groupId}</groupId>`,
    `  <artifactId>${artifactId}</artifactId>`,
    `  <versioning>`,
    `    <latest>${versions[versions.length - 1]}</latest>`,
    `    <release>${versions[versions.length - 1]}</release>`,
    `    <versions>`,
    ...versions.map((v) => `      <version>${v}</version>`),
    `    </versions>`,
    `  </versioning>`,
    `</metadata>`,
  ].join("\n")
  await fs.writeFile(path.join(dir, "maven-metadata.xml"), xml, "utf-8")

  for (const version of versions) {
    const versionDir = path.join(dir, version)
    await fs.mkdir(versionDir, { recursive: true })
    const pom = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<project xmlns="http://maven.apache.org/POM/4.0.0">`,
      `  <modelVersion>4.0.0</modelVersion>`,
      `  <groupId>${groupId}</groupId>`,
      `  <artifactId>${artifactId}</artifactId>`,
      `  <version>${version}</version>`,
      `</project>`,
    ].join("\n")
    await fs.writeFile(path.join(versionDir, `${artifactId}-${version}.pom`), pom, "utf-8")
  }
}

function startMavenServer(repoDir: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const filePath = path.resolve(repoDir, decodeURIComponent(req.url!).slice(1))
      if (!filePath.startsWith(repoDir)) {
        res.writeHead(400)
        res.end("Bad request")
        return
      }
      try {
        const content = await fs.readFile(filePath, "utf-8")
        res.writeHead(200, { "Content-Type": "application/xml" })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end("Not found")
      }
    })
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      })
    })
  })
}

async function writeConfigWithMavenRegistry(projectDir: string, registryUrl: string) {
  const defaultConfig = await fs.readFile("default.json5", "utf-8")
  const insertionTarget = "  ],\n  customManagers:"
  const newRule = [
    `    {`,
    `      matchDatasources: ["maven"],`,
    `      registryUrls: ["${registryUrl}"],`,
    `    },`,
    ``,
  ].join("\n")
  const modified = defaultConfig.replace(insertionTarget, newRule + insertionTarget)
  await fs.writeFile(path.join(projectDir, "renovate.json5"), modified)
}

describe("Gradle version catalogs", () => {
  renovateTest(
    "assigns correct semantic commit types to dependencies from different catalogs",
    async ({ renovate }) => {
      await fs.cp("test/fixtures/gradle-version-catalogs", renovate.projectDir, { recursive: true })

      const repoDir = path.join(renovate.projectDir, "local-repo")

      await Promise.all([
        // Production: jackson-databind (patch + major)
        createMavenMetadata(repoDir, "com.fasterxml.jackson.core", "jackson-databind", [
          "2.17.0",
          "2.17.2",
          "3.0.0",
        ]),
        // Test: junit-jupiter (patch + major)
        createMavenMetadata(repoDir, "org.junit.jupiter", "junit-jupiter", [
          "5.10.2",
          "5.10.4",
          "6.0.0",
        ]),
        // Build: kotlin plugin marker (patch + major)
        createMavenMetadata(
          repoDir,
          "org.jetbrains.kotlin.jvm",
          "org.jetbrains.kotlin.jvm.gradle.plugin",
          ["1.9.23", "1.9.25", "2.0.0"],
        ),
        // Build: develocity plugin marker (patch + major)
        createMavenMetadata(
          repoDir,
          "com.gradle.develocity",
          "com.gradle.develocity.gradle.plugin",
          ["3.17", "3.17.1", "4.0.0"],
        ),
      ])

      const server = await startMavenServer(repoDir)
      try {
        await writeConfigWithMavenRegistry(renovate.projectDir, server.url)

        const branches = await renovate.withGitRepo().withSemanticCommits().branches()

        // Production dependencies from gradle/libs.versions.toml should get fix(deps)
        const jacksonPatchBranch = branches.find((b) =>
          b.upgrades.some(
            (u) =>
              u.depName === "com.fasterxml.jackson.core:jackson-databind" &&
              u.updateType === "patch",
          ),
        )
        expect(jacksonPatchBranch, "missing patch branch for jackson-databind").toBeDefined()
        expect(jacksonPatchBranch!.prTitle).toMatch(/^fix\(deps\):/)

        const jacksonMajorBranch = branches.find((b) =>
          b.upgrades.some(
            (u) =>
              u.depName === "com.fasterxml.jackson.core:jackson-databind" &&
              u.updateType === "major",
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
      } finally {
        await server.close()
      }
    },
  )
})
