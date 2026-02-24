import childProcess from "node:child_process"
import path from "node:path"
import fs from "node:fs/promises"
import type { PackageFile, PackageDependency } from "renovate/dist/modules/manager/types.js"

export class RenovateRun {
  private errorOutput: string = ""
  private readonly preExecute: (() => Promise<void>)[] = []
  private readonly args: string[] = ["--platform=local"]
  private readonly parseErrors: string[] = []
  private readonly logEntries: RenovateLogEntry[] = []

  constructor(
    private readonly nodeJsPath: string,
    readonly projectDir: string,
  ) {}

  withCustomDataSource(name: string, versions: string[]): this {
    const versionsFile = path.join(this.projectDir, `${name}-versions.txt`)
    this.preExecute.push(async () => {
      await fs.writeFile(versionsFile, versions.join("\n"), "utf-8")
    })
    const customDatasources = {
      [name]: {
        defaultRegistryUrlTemplate: `file://${versionsFile}`,
        format: "plain",
      },
    }
    this.args.push(`--custom-datasources=${JSON.stringify(customDatasources)}`)
    return this
  }

  async extract(): Promise<ExtractedDependency[]> {
    await this.execute("--dry-run=extract")
    const packageFilesByDatasource = this.logEntries.find(
      (entry) => "packageFiles" in entry,
    )?.packageFiles
    if (packageFilesByDatasource === undefined) {
      throw new Error(this.withLogLines("Renovate did not print the extracted package files!"))
    }
    return dependenciesWithPackageFile<PackageFile>(packageFilesByDatasource)
  }

  async lookup(): Promise<LookedUpDependency[]> {
    await this.execute("--dry-run=lookup")
    const packageFilesByDatasource = this.logEntries.find(
      (entry) => entry.msg === "packageFiles with updates" && "config" in entry,
    )?.config
    if (packageFilesByDatasource === undefined) {
      throw new Error(this.withLogLines("Renovate did not print the loocked up package files!"))
    }
    return dependenciesWithPackageFile<PackageFileWithUpdates, PackageDependencyWithUpdates>(
      packageFilesByDatasource,
    )
  }

  private async execute(...additionalArgs: string[]): Promise<void> {
    await Promise.all(this.preExecute.map((fn) => fn()))

    const renovateIndexJs = path.join(process.cwd(), "node_modules", "renovate", "dist", "renovate")
    const renovateProcess = childProcess.spawn(
      this.nodeJsPath,
      [renovateIndexJs, ...this.args, ...additionalArgs],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: this.projectDir,
        env: {
          LOG_LEVEL: "debug",
          LOG_FORMAT: "json",
        },
      },
    )

    const [exitCode] = await Promise.all([
      new Promise<number | null>((resolve) => renovateProcess.on("close", resolve)),
      renovateProcess.stdout.forEach(this.onStdout.bind(this)),
      renovateProcess.stderr.forEach(this.onStderr.bind(this)),
    ]).catch(async (cause) => {
      console.error(cause)
      if (!renovateProcess.killed) {
        renovateProcess.kill()
      }
      throw cause
    })

    if (exitCode !== 0 || this.parseErrors.length > 0) {
      throw this.failedRunError(exitCode)
    }
  }

  private onStdout(chunk: Buffer) {
    for (const output of chunk
      .toString()
      .split("\n")
      .filter((line) => line.trim() !== "")) {
      try {
        this.logEntries.push(JSON.parse(output))
      } catch (cause) {
        this.parseErrors.push(`Failed to parse log line:\n${output}\n${cause}`)
      }
    }
  }

  private onStderr(chunk: Buffer) {
    const output = chunk.toString()
    if (!RenovateRun.stderrCanBeIgnored(output)) {
      this.errorOutput += output
    }
  }

  private failedRunError(exitCode: number | null): Error {
    let message = exitCode !== 0 ? "Renovate failed" : "Renovate succeeded but encountered errors"
    if (exitCode !== null && exitCode !== 0) {
      message += ` with exit code ${exitCode}`
    }
    const loggerErrors =
      this.logEntries
        .filter((entry) => "loggerErrors" in entry)
        .flatMap(({ loggerErrors }) => loggerErrors) ?? []

    if (loggerErrors.length > 1) {
      message += " :\n"
      message += buildList(loggerErrors.map(RenovateRun.formatLogEntry))
    } else if (this.errorOutput) {
      message += `:\n${this.errorOutput}`
    }

    message += "\n\nErrors while parsing Renovate’s output:\n"
    message += buildList(this.parseErrors)
    return new Error(message)
  }

  private withLogLines(message: string) {
    return (
      message +
      " Log lines: \n\n" +
      this.logEntries.map((entry) => RenovateRun.formatLogEntry(entry, true)).join("\n")
    )
  }

  static stderrCanBeIgnored(output: string) {
    return output.includes("The `punycode` module is deprecated")
  }

  static formatLogEntry(entry: RenovateLogEntry): string
  static formatLogEntry(entry: RenovateLogEntry, printAdditionalKeys: boolean): string
  static formatLogEntry(entry: RenovateLogEntry, printAdditionalKeys: boolean = false): string {
    let result = entry.msg
    if ("errorMessage" in entry) {
      result += `: ${entry.errorMessage}`
    }
    if (printAdditionalKeys) {
      const additionalKeys = Object.keys(entry).filter((key) => !standardLogEntryKeys.has(key))
      if (additionalKeys.length > 0) {
        result += `(additional keys: ${additionalKeys.join(", ")})`
      }
    }
    return result
  }
}

interface ExtractedDependency extends Readonly<PackageDependency> {
  packageFile: PackageFile
}

interface PackageDependencyWithUpdates extends Readonly<PackageDependency> {
  updates: Required<PackageDependency>["updates"]
}

interface LookedUpDependency
  extends Omit<ExtractedDependency, "updates">, PackageDependencyWithUpdates {}

const standardLogEntryKeys = new Set([
  "level",
  "msg",
  "time",
  "name",
  "hostname",
  "pid",
  "logContext",
  "repository",
  "v",
])

interface BaseRenovateLogEntry {
  level: number
  msg: string
  time: string
}

interface ErrorSummaryRenovateLogEntry extends BaseRenovateLogEntry {
  errorMessage: string
  loggerErrors: RenovateLogEntry[]
}

interface PackageFilesRenovateLogEntry extends BaseRenovateLogEntry {
  packageFiles: Record<string, PackageFile[]>
}

interface PackageFileWithUpdates extends Readonly<Omit<PackageFile, "deps">> {
  deps: PackageDependencyWithUpdates[]
}

interface UpdatesRenovateLogEntry extends BaseRenovateLogEntry {
  msg: "packageFiles with updates"
  config: Record<string, PackageFileWithUpdates[]>
}

type RenovateLogEntry =
  | BaseRenovateLogEntry
  | ErrorSummaryRenovateLogEntry
  | PackageFilesRenovateLogEntry
  | UpdatesRenovateLogEntry

function buildList(items: string[]): string {
  if (items.length === 1) {
    return items[0]!
  }
  return items.map((item) => `  - ${item.replace(/\n/g, "\n    ")}`).join("\n")
}

function dependenciesWithPackageFile<P extends { deps: D[] }, D = Readonly<PackageDependency>>(
  config: Record<string, P[]>,
): (D & { packageFile: P })[] {
  return Object.values(config)
    .flat()
    .map((packageFile) => packageFile.deps.map((dep) => ({ ...dep, packageFile })))
    .flat()
}
