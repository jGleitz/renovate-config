import childProcess from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { pathToFileURL } from "node:url"
import fs from "node:fs/promises"
import type { PackageDependency, PackageFile } from "renovate/dist/modules/manager/types.js"
import type { AllConfig } from "renovate/dist/config/types.js"
import type { LogLevelRemap } from "renovate/dist/logger/types.js"

const exec = promisify(childProcess.exec)

type LogLevelString = LogLevelRemap["newLogLevel"]

export class RenovateRun {
  private errorOutput: string = ""
  /**
   * Hooks that are called once at the next start of {@link #execute} after they
   * are registered.
   * @private
   */
  private readonly preExecuteOnce: (() => Promise<void>)[] = []
  private readonly env = {
    LOG_LEVEL: "debug" satisfies LogLevelString,
    LOG_FORMAT: "pretty",
    LOG_FILE: "renovate.log",
    LOG_FILE_LEVEL: "debug" satisfies LogLevelString,
    LOG_FILE_FORMAT: "json",
  }
  /**
   * Configuration for all renovate runs. The config passed to {@link #execute}
   * will override these options.
   * @private
   */
  private readonly config: AllConfig = {
    platform: "local",
    hostRules: [{
      // No external host should be contacted. Tests should use #withCustomDatasource and #withDatasourceOverride to set up mock data sources.
      enabled: false,
    }],
    logLevelRemap: [{
      // The planned titles of PRs are only logged at the trace level and
      // --plaform=local currently can’t do a --dry-run=full, which would give
      // us the list of planned branches. Hence, we upgrade the log message to
      // `debug` to see it. Activating trace logging increases test execution
      // times by almost 3x.
      matchMessage: "/^prTitle:/",
      newLogLevel: "debug",
    }],
  }
  private readonly parseErrors: string[] = []
  private readonly logEntries: RenovateLogEntry[] = []
  private readonly branchTitles: BranchTitle[] = []
  private extractedPackageFiles: Record<string, PackageFile[]> | undefined
  private packageFilesWithUpdates: Record<string, PackageFileWithUpdates[]> | undefined

  constructor(
    private readonly nodeJsPath: string,
    readonly projectDir: string,
  ) {}

  withCustomDataSource(name: string, versions: Record<string, string[]>): this {
    for (const [packageName, packageVersions] of Object.entries(versions)) {
      this.preExecuteOnce.push(async () => {
        await fs.writeFile(
          path.join(this.projectDir, `${name}-${encodeURIComponent(packageName)}-versions.txt`),
          JSON.stringify({
            releases: packageVersions.map(version => ({
              version,
              releaseTimestamp: "2026-01-01T00:00:00Z",
            })),
          }, null, 2),
          "utf-8",
        )
      })
    }
    this.config.customDatasources = {
      ...this.config.customDatasources,
      [name]: {
        defaultRegistryUrlTemplate: `${pathToFileURL(this.projectDir).href}/${name}-{{encodeURIComponent packageName}}-versions.txt`,
        format: "json",
      },
    }
    return this
  }

  withDataSourceOverride(name: string, versions: Record<string, string[]>): this {
    this.withCustomDataSource(name, versions)
    this.config.packageRules = [
      ...(this.config.packageRules ?? []),
      {
        matchDatasources: [name],
        overrideDatasource: `custom.${name}`,
        registryUrls: [],
      }
    ]
    return this
  }

  async extract(): Promise<ExtractedDependency[]> {
    await this.execute({ dryRun: "extract" })
    if (this.extractedPackageFiles === undefined) {
      throw new Error(this.withLogLines("Renovate did not print the extracted package files!"))
    }
    return dependenciesWithPackageFile<PackageFile>(this.extractedPackageFiles)
  }

  async lookup(): Promise<LookedUpDependency[]> {
    await this.execute({ dryRun: "lookup" })
    return this.parseLookedUpDependencies()
  }

  private parseLookedUpDependencies(): LookedUpDependency[] {
    if (this.packageFilesWithUpdates === undefined) {
      throw new Error(this.withLogLines("Renovate did not print the looked up package files!"))
    }
    return dependenciesWithPackageFile<PackageFileWithUpdates, PackageDependencyWithUpdates>(
      this.packageFilesWithUpdates,
    )
  }

  withGitRepository(): this {
    this.preExecuteOnce.push(async () => {
      await exec("git init -b main && git add -A && git commit -m 'fix: initial commit'", {
        cwd: this.projectDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "test",
          GIT_AUTHOR_EMAIL: "test@test.com",
          GIT_COMMITTER_NAME: "test",
          GIT_COMMITTER_EMAIL: "test@test.com",
        },
      }).catch((error: childProcess.ExecException & { stdout: string; stderr: string }) => {
        throw new Error(
          `Failed to initialize git repo (exit code ${error.code}):\n` +
          `stdout: ${error.stdout}\nstderr: ${error.stderr}`,
        )
      })
    })
    return this
  }

  withSemanticCommits(): this {
    this.config.semanticCommits = "enabled"
    return this
  }

  async branches(): Promise<PlannedBranch[]> {
    await this.execute({ dryRun: "lookup" })

    const lookedUpDependencies = this.parseLookedUpDependencies()
    if (this.branchTitles.length === 0) {
      throw new Error(this.withLogLines("Renovate did not print planned PR titles!"))
    }

    return this.branchTitles.map((entry) => ({
      branchName: entry.branch,
      prTitle: entry.prTitle,
      upgrades: lookedUpDependencies.filter((dep) =>
        dep.updates.some((update) => update.branchName === entry.branch),
      ),
    }))
  }

  private async execute(runConfig: AllConfig): Promise<void> {
    this.errorOutput = ""
    this.parseErrors.splice(0)
    this.logEntries.splice(0)
    this.branchTitles.splice(0)
    this.extractedPackageFiles = undefined
    this.packageFilesWithUpdates = undefined
    const logFile = path.join(this.projectDir, this.env.LOG_FILE)
    await fs.rm(logFile, { force: true })

    const handlers = this.preExecuteOnce.splice(0)
    for (const fn of handlers) {
      await fn()
    }

    const renovateIndexJs = path.join(process.cwd(), "node_modules", "renovate", "dist", "renovate")
    const renovateProcess = childProcess.spawn(
      this.nodeJsPath,
      [renovateIndexJs],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: this.projectDir,
        env: {
          ...process.env,
          ...this.env,
          RENOVATE_CONFIG: JSON.stringify({
            ...this.config,
            runConfig,
          }),
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

    await this.readLogFile(logFile)

    if (exitCode !== 0 || this.parseErrors.length > 0) {
      throw this.failedRunError(exitCode)
    }
  }

  private onStdout(_chunk: Buffer) {
    // Renovate writes human-readable logs to stdout for debugging failed tests.
    // Structured assertions use the JSON log file parsed in readLogFile().
  }

  private async readLogFile(logFile: string): Promise<void> {
    const output = await fs.readFile(logFile, "utf-8").catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") {
        return ""
      }
      throw cause
    })

    for (const line of output.split("\n")) {
      if (line.trim() === "") {
        continue
      }

      try {
        const entry = JSON.parse(line)
        if (!isRenovateLogEntry(entry)) {
          this.parseErrors.push(`Failed to parse log line as a Renovate log entry:\n${line}`)
        } else {
          this.processLogEntry(entry)
        }
      } catch (cause) {
        this.parseErrors.push(`Failed to parse log line:\n${line}\n${cause}`)
      }
    }
  }

  private processLogEntry(entry: RenovateLogEntry): void {
    const branchTitle = branchTitleFromLogEntry(entry)
    if (branchTitle !== null) {
      this.branchTitles.push(branchTitle)
      this.logEntries.push(entry)
      return
    }

    if (isExtractedPackageFilesLogEntry(entry)) {
      this.extractedPackageFiles = entry.packageFiles
      this.logEntries.push(entry)
      return
    }

    if (isUpdatesLogEntry(entry)) {
      this.packageFilesWithUpdates = entry.config
      this.logEntries.push(entry)
      return
    }

    if (isErrorSummaryLogEntry(entry)) {
      this.logEntries.push(entry)
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

    if (loggerErrors.length > 0) {
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

interface BranchTitle {
  branch: string
  prTitle: string
}

interface PlannedBranch {
  branchName: string
  prTitle: string
  upgrades: LookedUpDependency[]
}

type RenovateLogEntry =
  | BaseRenovateLogEntry
  | ErrorSummaryRenovateLogEntry
  | PackageFilesRenovateLogEntry
  | UpdatesRenovateLogEntry

function isRenovateLogEntry(value: unknown): value is RenovateLogEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "level" in value &&
    typeof value.level === "number" &&
    "msg" in value &&
    typeof value.msg === "string" &&
    "time" in value &&
    typeof value.time === "string"
  )
}

function isExtractedPackageFilesLogEntry(
  entry: RenovateLogEntry,
): entry is PackageFilesRenovateLogEntry {
  return "packageFiles" in entry
}

function isUpdatesLogEntry(entry: RenovateLogEntry): entry is UpdatesRenovateLogEntry {
  return entry.msg === "packageFiles with updates" && "config" in entry
}

function isErrorSummaryLogEntry(entry: RenovateLogEntry): entry is ErrorSummaryRenovateLogEntry {
  return "loggerErrors" in entry
}

function branchTitleFromLogEntry(entry: RenovateLogEntry): BranchTitle | null {
  if (!("branch" in entry) || typeof entry.branch !== "string") {
    return null
  }

  const match = /^prTitle: "([^"]*)"$/.exec(entry.msg)
  return match === null ? null : { branch: entry.branch, prTitle: match[1]! }
}

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
