import childProcess from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { pathToFileURL } from "node:url"
import fs from "node:fs/promises"
import type { PackageDependency, PackageFile } from "renovate/dist/modules/manager/types.js"
import type { AllConfig } from "renovate/dist/config/types.js"
import type { LogLevelRemap } from "renovate/dist/logger/types.js"
import {
  branchTitleFromLogEntry,
  isErrorSummaryLogEntry,
  isExtractedPackageFilesLogEntry,
  isRenovateLogEntry,
  isUpdatesLogEntry,
  PackageDependencyWithUpdates,
  PackageFileWithUpdates,
  RenovateLogEntry,
} from "./RenovateLogEntry.js"

const exec = promisify(childProcess.exec)

type LogLevelString = LogLevelRemap["newLogLevel"]

export class RenovateRun {
  /**
   * Hooks that are called once at the next start of {@link #execute} after they
   * are registered.
   * @private
   */
  private readonly preExecuteOnce: (() => Promise<void>)[] = []
  private readonly env = {
    // We configure Renovate to write human-readable logs to stdout. These are forwarded to vitest
    // via console.{log, error}. Additionally, we configure Renovate to write logs in JSON format to
    // a file. We extract results from this file.
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
    hostRules: [
      {
        // No external host should be contacted. Tests should use #withCustomDatasource and
        // #withDatasourceOverride to set up mock data sources.
        enabled: false,
      },
    ],
    logLevelRemap: [
      {
        // The planned titles of PRs are only logged at the trace level and --plaform=local
        // currently can’t do a --dry-run=full, which would give us the list of planned branches.
        // Hence, we upgrade the log message to `debug` to see it. Activating trace logging
        // increases test execution times by almost 3x.
        matchMessage: "/^prTitle:/",
        newLogLevel: "debug",
      },
    ],
  }

  constructor(
    private readonly nodeJsPath: string,
    readonly projectDir: string,
  ) {}

  withCustomDataSource(name: string, versions: Record<string, string[]>): this {
    for (const [packageName, packageVersions] of Object.entries(versions)) {
      this.preExecuteOnce.push(async () => {
        await fs.writeFile(
          path.join(this.projectDir, `${name}-${encodeURIComponent(packageName)}-versions.txt`),
          JSON.stringify(
            {
              releases: packageVersions.map((version) => ({
                version,
                releaseTimestamp: "2026-01-01T00:00:00Z",
              })),
            },
            null,
            2,
          ),
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
      },
    ]
    return this
  }

  async extract(): Promise<ExtractedDependency[]> {
    const logEntries = await this.execute({ dryRun: "extract" })

    const extractedPackageFilesLogEntries = logEntries.filter(isExtractedPackageFilesLogEntry)
    if (extractedPackageFilesLogEntries.length === 0) {
      throw new Error("Renovate did not print the extracted package files!")
    } else if (extractedPackageFilesLogEntries.length > 1) {
      throw new Error(
        `Renovate printed multiple log entries with extracted dependencies, but only one was expected! Log entries:\n` +
          extractedPackageFilesLogEntries.map((e) => JSON.stringify(e)).join("\n"),
      )
    }
    return dependenciesWithPackageFile<PackageFile>(
      extractedPackageFilesLogEntries[0]!.packageFiles,
    )
  }

  async lookup(): Promise<LookedUpDependency[]> {
    const logEntries = await this.execute({ dryRun: "lookup" })
    return this.extractLookedUpDependencies(logEntries)
  }

  private extractLookedUpDependencies(logEntries: RenovateLogEntry[]): LookedUpDependency[] {
    const lookedUpDependencyLogEntries = logEntries.filter(isUpdatesLogEntry)
    if (lookedUpDependencyLogEntries.length === 0) {
      throw new Error("Renovate did not print the looked up package files!")
    } else if (lookedUpDependencyLogEntries.length > 1) {
      throw new Error(
        `Renovate printed multiple log entries with looked up dependencies, but only one was expected! Log entries:\n` +
          lookedUpDependencyLogEntries.map((e) => JSON.stringify(e)).join("\n"),
      )
    }

    return dependenciesWithPackageFile<PackageFileWithUpdates, PackageDependencyWithUpdates>(
      lookedUpDependencyLogEntries[0]!.config,
    )
  }

  async branches(): Promise<PlannedBranch[]> {
    const logEntries = await this.execute({ dryRun: "lookup" })

    const lookedUpDependencies = this.extractLookedUpDependencies(logEntries)
    const branchTitles = logEntries.flatMap((entry) => {
      const branch = branchTitleFromLogEntry(entry)
      return branch ? [branch] : []
    })
    if (branchTitles.length === 0) {
      throw new Error("Renovate did not print planned PR titles!")
    }

    return branchTitles.map(({ branchName, prTitle }) => ({
      branchName,
      prTitle,
      updates: lookedUpDependencies.flatMap((dependency) => {
        const updatesOnThisBranch = dependency.updates.filter(
          (update) => update.branchName === branchName,
        )
        return updatesOnThisBranch.length > 0
          ? [
              {
                ...dependency,
                updates: updatesOnThisBranch,
              },
            ]
          : []
      }),
    }))
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

  private async execute(runConfig: AllConfig): Promise<RenovateLogEntry[]> {
    const logFile = path.join(this.projectDir, this.env.LOG_FILE)
    await fs.rm(logFile, { force: true })

    const handlers = this.preExecuteOnce.splice(0)
    for (const fn of handlers) {
      await fn()
    }

    const renovateIndexJs = path.join(process.cwd(), "node_modules", "renovate", "dist", "renovate")
    const renovateProcess = childProcess.spawn(this.nodeJsPath, [renovateIndexJs], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: this.projectDir,
      env: {
        ...process.env,
        ...this.env,
        RENOVATE_CONFIG: JSON.stringify({
          ...this.config,
          ...runConfig,
        }),
      },
    })

    const errorOutput: string[] = []

    const [exitCode] = await Promise.all([
      new Promise<number | null>((resolve) => renovateProcess.on("close", resolve)),
      renovateProcess.stdout.forEach(this.onStdout.bind(this)),
      renovateProcess.stderr.forEach(this.onStderr(errorOutput).bind(this)),
    ]).catch(async (cause) => {
      console.error(cause)
      if (!renovateProcess.killed) {
        renovateProcess.kill()
      }
      throw cause
    })

    const { logEntries, parseErrors } = await this.readLogFile(logFile)

    if (exitCode !== 0 || parseErrors.length > 0) {
      throw this.failedRunError(exitCode, errorOutput, logEntries, parseErrors)
    }

    return logEntries
  }

  private onStdout(chunk: Buffer) {
    // Redirecting to `console` so vitest can intercept the output:
    for (const output of linesInOutputChunk(chunk)) {
      console.log(output)
    }
  }

  private async readLogFile(logFile: string): Promise<LogParseResult> {
    const logEntries: RenovateLogEntry[] = []
    const parseErrors: string[] = []

    try {
      const output = await fs.readFile(logFile, "utf-8")

      for (const line of output.split("\n")) {
        if (line.trim() === "") {
          continue
        }

        try {
          const entry: unknown = JSON.parse(line)
          if (isRenovateLogEntry(entry)) {
            logEntries.push(entry)
          } else {
            parseErrors.push(`Log entry is not in Renovate’s format:\n${line}`)
          }
        } catch (cause) {
          parseErrors.push(`Failed to parse log line:\n${line}\n${cause}`)
        }
      }
    } catch (cause) {
      if (typeof cause === "object" && cause && "code" in cause && cause.code === "ENOENT") {
        parseErrors.push(`Renovate did not produce a log file! Expected it at ${logFile}.`)
      } else {
        parseErrors.push(`Failed to open Renovate’s log file at ${logFile}:\n${cause}`)
      }
    }

    return { logEntries, parseErrors }
  }

  private onStderr(errorOutput: string[]) {
    return (chunk: Buffer) => {
      // Redirecting to `console` so vitest can intercept the output:
      for (const line of linesInOutputChunk(chunk)) {
        if (!RenovateRun.stderrCanBeIgnored(line)) {
          errorOutput.push(line)
          console.error(line)
        }
      }
    }
  }

  private failedRunError(
    exitCode: number | null,
    errorOutput: string[],
    logEntries: RenovateLogEntry[],
    parseErrors: string[],
  ): Error {
    let message = exitCode === 0 ? "Renovate succeeded but encountered errors" : "Renovate failed"
    if (exitCode !== null && exitCode !== 0) {
      message += ` with exit code ${exitCode}`
    }
    const loggerErrors = logEntries
      .filter(isErrorSummaryLogEntry)
      .flatMap(({ loggerErrors }) => loggerErrors)

    if (loggerErrors.length > 0) {
      message += " :\n"
      message += buildList(loggerErrors.map(RenovateRun.formatLogEntry))
    } else if (errorOutput.length > 0) {
      message += `:\n${errorOutput.join("\n")}`
    }

    message += "\n\nErrors while parsing Renovate’s output:\n"
    message += buildList(parseErrors)
    return new Error(message)
  }

  static stderrCanBeIgnored(output: string) {
    return output.includes("The `punycode` module is deprecated")
  }

  static formatLogEntry(entry: RenovateLogEntry): string {
    let result = entry.msg
    if ("errorMessage" in entry) {
      result += `: ${entry.errorMessage}`
    }
    return result
  }
}

type LogParseResult = {
  logEntries: RenovateLogEntry[]
  parseErrors: string[]
}

interface ExtractedDependency extends Readonly<PackageDependency> {
  packageFile: PackageFile
}

interface LookedUpDependency
  extends Omit<ExtractedDependency, "updates">, PackageDependencyWithUpdates {}

interface PlannedBranch {
  branchName: string
  prTitle: string
  updates: LookedUpDependency[]
}

function buildList(items: string[]): string {
  if (items.length === 1) {
    return items[0]!
  }
  return items.map((item) => `  - ${item.replaceAll("\n", "\n    ")}`).join("\n")
}

function dependenciesWithPackageFile<P extends { deps: D[] }, D = Readonly<PackageDependency>>(
  config: Record<string, P[]>,
): (D & { packageFile: P })[] {
  return Object.values(config)
    .flat()
    .flatMap((packageFile) => packageFile.deps.map((dep) => ({ ...dep, packageFile })))
}

function linesInOutputChunk(chunk: Buffer): string[] {
  return chunk
    .toString()
    .split("\n")
    .filter((line) => line.trim() !== "")
}
