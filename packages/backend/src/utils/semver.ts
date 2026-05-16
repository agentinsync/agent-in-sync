export type VersionMatchType = 'exact' | 'major' | 'semver';

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  valid: boolean;
};

function parseVersion(version: string): ParsedVersion {
  const match = version.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/);

  if (!match) {
    return { major: 0, minor: 0, patch: 0, prerelease: null, valid: false };
  }

  return {
    major: parseInt(match[1]!, 10),
    minor: match[2] ? parseInt(match[2], 10) : 0,
    patch: match[3] ? parseInt(match[3], 10) : 0,
    prerelease: match[4] ?? null,
    valid: true,
  };
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }

  return 0;
}

export function matchesExact(targetVersion: string, actualVersion: string): boolean {
  return targetVersion === actualVersion;
}

export function matchesMajor(targetVersion: string, actualVersion: string): boolean {
  const target = parseVersion(targetVersion);
  const actual = parseVersion(actualVersion);

  if (!target.valid || !actual.valid) {
    return targetVersion === actualVersion;
  }

  return target.major === actual.major;
}

export function matchesSemverRange(range: string, actualVersion: string): boolean {
  const actual = parseVersion(actualVersion);
  if (!actual.valid) return false;

  const gtMatch = range.match(/^>=?\s*(.+)$/);
  if (gtMatch) {
    const target = parseVersion(gtMatch[1]!);
    if (!target.valid) return false;
    const cmp = compareVersions(actual, target);
    return range.startsWith('>=') ? cmp >= 0 : cmp > 0;
  }

  const ltMatch = range.match(/^<=?\s*(.+)$/);
  if (ltMatch) {
    const target = parseVersion(ltMatch[1]!);
    if (!target.valid) return false;
    const cmp = compareVersions(actual, target);
    return range.startsWith('<=') ? cmp <= 0 : cmp < 0;
  }

  const rangeMatch = range.match(/^(.+?)\s*-\s*(.+)$/);
  if (rangeMatch) {
    const min = parseVersion(rangeMatch[1]!);
    const max = parseVersion(rangeMatch[2]!);
    if (!min.valid || !max.valid) return false;
    return compareVersions(actual, min) >= 0 && compareVersions(actual, max) <= 0;
  }

  const caretMatch = range.match(/^\^(.+)$/);
  if (caretMatch) {
    const target = parseVersion(caretMatch[1]!);
    if (!target.valid) return false;
    if (actual.major !== target.major) return false;
    return compareVersions(actual, target) >= 0;
  }

  const tildeMatch = range.match(/^~(.+)$/);
  if (tildeMatch) {
    const target = parseVersion(tildeMatch[1]!);
    if (!target.valid) return false;
    if (actual.major !== target.major || actual.minor !== target.minor) return false;
    return compareVersions(actual, target) >= 0;
  }

  return matchesExact(range, actualVersion);
}

export function matchesVersion(
  targetVersion: string,
  actualVersion: string,
  matchType: VersionMatchType = 'major'
): boolean {
  switch (matchType) {
    case 'exact':
      return matchesExact(targetVersion, actualVersion);
    case 'major':
      return matchesMajor(targetVersion, actualVersion);
    case 'semver':
      return matchesSemverRange(targetVersion, actualVersion);
    default:
      return matchesExact(targetVersion, actualVersion);
  }
}

export type PackageVersionFilter = {
  name: string;
  version?: string;
  versionMatch?: VersionMatchType;
};

export function matchesPackageFilter(
  filter: PackageVersionFilter,
  packages: Array<{ name: string; version: string }> | null | undefined
): boolean {
  if (!packages || packages.length === 0) {
    return false;
  }

  const matchingPackage = packages.find(
    pkg => pkg.name.toLowerCase() === filter.name.toLowerCase()
  );

  if (!matchingPackage) {
    return false;
  }

  if (!filter.version) {
    return true;
  }

  return matchesVersion(filter.version, matchingPackage.version, filter.versionMatch || 'major');
}

export function matchesAllPackageFilters(
  filters: PackageVersionFilter[],
  packages: Array<{ name: string; version: string }> | null | undefined
): boolean {
  if (filters.length === 0) return true;
  return filters.every(filter => matchesPackageFilter(filter, packages));
}
