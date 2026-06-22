import type { PackageDependency, PackageFile } from "renovate/dist/modules/manager/types.js"

export interface RenovateLogEntry {
  level: number
  msg: string
  time: string
}

export function isRenovateLogEntry(value: unknown): value is RenovateLogEntry {
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

interface ErrorSummaryRenovateLogEntry extends RenovateLogEntry {
  errorMessage: string
  loggerErrors: RenovateLogEntry[]
}

export function isErrorSummaryLogEntry(
  entry: RenovateLogEntry,
): entry is ErrorSummaryRenovateLogEntry {
  return (
    "errorMessage" in entry &&
    typeof entry.errorMessage === "string" &&
    "loggerErrors" in entry &&
    Array.isArray(entry.loggerErrors) &&
    entry.loggerErrors.every(isRenovateLogEntry)
  )
}

interface PackageFilesRenovateLogEntry extends RenovateLogEntry {
  packageFiles: Record<string, PackageFile[]>
}

export function isExtractedPackageFilesLogEntry(
  entry: RenovateLogEntry,
): entry is PackageFilesRenovateLogEntry {
  return (
    "packageFiles" in entry && typeof entry.packageFiles === "object" && entry.packageFiles !== null
  )
}

export interface PackageFileWithUpdates extends Readonly<Omit<PackageFile, "deps">> {
  deps: PackageDependencyWithUpdates[]
}

interface UpdatesRenovateLogEntry extends RenovateLogEntry {
  msg: "packageFiles with updates"
  config: Record<string, PackageFileWithUpdates[]>
}

export function isUpdatesLogEntry(entry: RenovateLogEntry): entry is UpdatesRenovateLogEntry {
  return (
    entry.msg === "packageFiles with updates" &&
    "config" in entry &&
    typeof entry.config === "object" &&
    entry.config !== null
  )
}

interface BranchTitle {
  branchName: string
  prTitle: string
}

export function branchTitleFromLogEntry(entry: RenovateLogEntry): BranchTitle | null {
  if (!("branch" in entry) || typeof entry.branch !== "string") {
    return null
  }

  const match = /^prTitle: "([^"]*)"$/.exec(entry.msg)
  return match === null ? null : { branchName: entry.branch, prTitle: match[1]! }
}

export interface PackageDependencyWithUpdates extends Readonly<PackageDependency> {
  updates: Required<PackageDependency>["updates"]
}
