import { describe, it, expect } from 'vitest';
import {
  matchesExact,
  matchesMajor,
  matchesSemverRange,
  matchesVersion,
  matchesPackageFilter,
  matchesAllPackageFilters,
} from './semver.js';

describe('Semver Utilities', () => {
  describe('matchesExact', () => {
    it('should match identical versions', () => {
      expect(matchesExact('19.0.0', '19.0.0')).toBe(true);
      expect(matchesExact('1.2.3', '1.2.3')).toBe(true);
    });

    it('should not match different versions', () => {
      expect(matchesExact('19.0.0', '19.0.1')).toBe(false);
      expect(matchesExact('19.0.0', '19.1.0')).toBe(false);
      expect(matchesExact('19.0.0', '18.0.0')).toBe(false);
    });
  });

  describe('matchesMajor', () => {
    it('should match same major version', () => {
      expect(matchesMajor('19', '19.0.0')).toBe(true);
      expect(matchesMajor('19.0.0', '19.5.2')).toBe(true);
      expect(matchesMajor('5', '5.3.0')).toBe(true);
    });

    it('should not match different major versions', () => {
      expect(matchesMajor('19', '18.9.9')).toBe(false);
      expect(matchesMajor('5', '6.0.0')).toBe(false);
    });

    it('should handle versions with only major number', () => {
      expect(matchesMajor('19', '19.0.0')).toBe(true);
      expect(matchesMajor('19', '19.5.2')).toBe(true);
    });
  });

  describe('matchesSemverRange', () => {
    it('should match >= ranges', () => {
      expect(matchesSemverRange('>=18.0.0', '18.0.0')).toBe(true);
      expect(matchesSemverRange('>=18.0.0', '19.0.0')).toBe(true);
      expect(matchesSemverRange('>=18.0.0', '18.5.0')).toBe(true);
      expect(matchesSemverRange('>=18.0.0', '17.9.9')).toBe(false);
    });

    it('should match > ranges', () => {
      expect(matchesSemverRange('>18.0.0', '18.0.1')).toBe(true);
      expect(matchesSemverRange('>18.0.0', '19.0.0')).toBe(true);
      expect(matchesSemverRange('>18.0.0', '18.0.0')).toBe(false);
    });

    it('should match <= ranges', () => {
      expect(matchesSemverRange('<=19.0.0', '19.0.0')).toBe(true);
      expect(matchesSemverRange('<=19.0.0', '18.0.0')).toBe(true);
      expect(matchesSemverRange('<=19.0.0', '19.0.1')).toBe(false);
    });

    it('should match < ranges', () => {
      expect(matchesSemverRange('<19.0.0', '18.9.9')).toBe(true);
      expect(matchesSemverRange('<19.0.0', '19.0.0')).toBe(false);
    });

    it('should match caret ranges (^)', () => {
      expect(matchesSemverRange('^18.0.0', '18.0.0')).toBe(true);
      expect(matchesSemverRange('^18.0.0', '18.5.0')).toBe(true);
      expect(matchesSemverRange('^18.0.0', '18.99.99')).toBe(true);
      expect(matchesSemverRange('^18.0.0', '19.0.0')).toBe(false);
      expect(matchesSemverRange('^18.0.0', '17.9.9')).toBe(false);
    });

    it('should match tilde ranges (~)', () => {
      expect(matchesSemverRange('~18.2.0', '18.2.0')).toBe(true);
      expect(matchesSemverRange('~18.2.0', '18.2.5')).toBe(true);
      expect(matchesSemverRange('~18.2.0', '18.3.0')).toBe(false);
      expect(matchesSemverRange('~18.2.0', '19.0.0')).toBe(false);
    });

    it('should match hyphen ranges', () => {
      expect(matchesSemverRange('18.0.0 - 19.0.0', '18.5.0')).toBe(true);
      expect(matchesSemverRange('18.0.0 - 19.0.0', '18.0.0')).toBe(true);
      expect(matchesSemverRange('18.0.0 - 19.0.0', '19.0.0')).toBe(true);
      expect(matchesSemverRange('18.0.0 - 19.0.0', '17.9.9')).toBe(false);
      expect(matchesSemverRange('18.0.0 - 19.0.0', '19.0.1')).toBe(false);
    });

    it('should fall back to exact match for plain versions', () => {
      expect(matchesSemverRange('18.0.0', '18.0.0')).toBe(true);
      expect(matchesSemverRange('18.0.0', '18.0.1')).toBe(false);
    });
  });

  describe('matchesVersion', () => {
    it('should use exact match by type', () => {
      expect(matchesVersion('19.0.0', '19.0.0', 'exact')).toBe(true);
      expect(matchesVersion('19.0.0', '19.0.1', 'exact')).toBe(false);
    });

    it('should use major match by type', () => {
      expect(matchesVersion('19', '19.5.0', 'major')).toBe(true);
      expect(matchesVersion('19', '18.0.0', 'major')).toBe(false);
    });

    it('should use semver match by type', () => {
      expect(matchesVersion('>=18.0.0', '19.0.0', 'semver')).toBe(true);
      expect(matchesVersion('>=18.0.0', '17.0.0', 'semver')).toBe(false);
    });

    it('should default to major match', () => {
      expect(matchesVersion('19', '19.5.0')).toBe(true);
    });
  });

  describe('matchesPackageFilter', () => {
    const packages = [
      { name: 'react', version: '19.0.0' },
      { name: 'typescript', version: '5.3.0' },
    ];

    it('should match by name only', () => {
      expect(matchesPackageFilter({ name: 'react' }, packages)).toBe(true);
      expect(matchesPackageFilter({ name: 'vue' }, packages)).toBe(false);
    });

    it('should match by name and exact version', () => {
      expect(
        matchesPackageFilter({ name: 'react', version: '19.0.0', versionMatch: 'exact' }, packages)
      ).toBe(true);
      expect(
        matchesPackageFilter({ name: 'react', version: '19.0.1', versionMatch: 'exact' }, packages)
      ).toBe(false);
    });

    it('should match by name and major version', () => {
      expect(
        matchesPackageFilter({ name: 'react', version: '19', versionMatch: 'major' }, packages)
      ).toBe(true);
      expect(
        matchesPackageFilter({ name: 'react', version: '18', versionMatch: 'major' }, packages)
      ).toBe(false);
    });

    it('should match by name and semver range', () => {
      expect(
        matchesPackageFilter(
          { name: 'react', version: '>=18.0.0', versionMatch: 'semver' },
          packages
        )
      ).toBe(true);
      expect(
        matchesPackageFilter(
          { name: 'react', version: '>=20.0.0', versionMatch: 'semver' },
          packages
        )
      ).toBe(false);
    });

    it('should return false for null/empty packages', () => {
      expect(matchesPackageFilter({ name: 'react' }, null)).toBe(false);
      expect(matchesPackageFilter({ name: 'react' }, undefined)).toBe(false);
      expect(matchesPackageFilter({ name: 'react' }, [])).toBe(false);
    });

    it('should be case-insensitive for package names', () => {
      expect(matchesPackageFilter({ name: 'React' }, packages)).toBe(true);
      expect(matchesPackageFilter({ name: 'TYPESCRIPT' }, packages)).toBe(true);
    });
  });

  describe('matchesAllPackageFilters', () => {
    const packages = [
      { name: 'react', version: '19.0.0' },
      { name: 'typescript', version: '5.3.0' },
    ];

    it('should return true when all filters match', () => {
      const filters = [
        { name: 'react', version: '19', versionMatch: 'major' as const },
        { name: 'typescript', version: '5', versionMatch: 'major' as const },
      ];
      expect(matchesAllPackageFilters(filters, packages)).toBe(true);
    });

    it('should return false when any filter does not match', () => {
      const filters = [
        { name: 'react', version: '19', versionMatch: 'major' as const },
        { name: 'vue' },
      ];
      expect(matchesAllPackageFilters(filters, packages)).toBe(false);
    });

    it('should return true for empty filters', () => {
      expect(matchesAllPackageFilters([], packages)).toBe(true);
    });
  });
});
