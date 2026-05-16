import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractMetadataFromContent,
  generateFrontmatter,
} from './frontmatter.js';

describe('Frontmatter Parser', () => {
  describe('parseFrontmatter', () => {
    it('should extract metadata from markdown with frontmatter', () => {
      // Given
      const content = `---
project: my-app
techStack:
  - react
  - typescript
severity: high
---

# Issue Title

Description here.`;

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata).not.toBeNull();
      expect(result.metadata?.project).toBe('my-app');
      expect(result.metadata?.techStack).toEqual(['react', 'typescript']);
      expect(result.metadata?.severity).toBe('high');
      expect(result.content).toBe('# Issue Title\n\nDescription here.');
    });

    it('should return null metadata when no frontmatter present', () => {
      // Given
      const content = '# Just a Title\n\nNo frontmatter here.';

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata).toBeNull();
      expect(result.content).toBe(content);
      expect(result.rawFrontmatter).toBeNull();
    });

    it('should handle empty frontmatter', () => {
      // Given
      const content = `---
---

Content after empty frontmatter.`;

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata).toEqual({});
      expect(result.content).toBe('Content after empty frontmatter.');
      expect(result.rawFrontmatter).toBe('');
    });

    it('should parse packages array with objects', () => {
      // Given
      const content = `---
packages:
  - name: react
    version: "19.0.0"
  - name: typescript
    version: "5.3.0"
---

Content.`;

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata?.packages).toEqual([
        { name: 'react', version: '19.0.0' },
        { name: 'typescript', version: '5.3.0' },
      ]);
    });

    it('should parse boolean values correctly', () => {
      // Given
      const content = `---
hasMinimalRepro: true
---

Content.`;

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata?.hasMinimalRepro).toBe(true);
    });

    it('should parse numeric values correctly', () => {
      // Given
      const content = `---
stepsToReproduce: 5
---

Content.`;

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata?.stepsToReproduce).toBe(5);
    });

    it('should handle all metadata fields', () => {
      // Given
      const content = `---
project: my-project
techStack:
  - react
  - node
errorType: runtime
errorCategory: hooks
severity: critical
environment: production
fileTypes:
  - tsx
  - ts
codePatterns:
  - async-await
affectedArea: frontend
frequency: always
hasMinimalRepro: true
stepsToReproduce: 3
rootCause: breaking-change
fixType: code-change
complexity: medium
timeToResolve: 2h
lessonsLearned:
  - Check migration guides
relatedPatterns:
  - suspense
---

Content.`;

      // When
      const result = parseFrontmatter(content);

      // Then
      expect(result.metadata).toMatchObject({
        project: 'my-project',
        techStack: ['react', 'node'],
        errorType: 'runtime',
        errorCategory: 'hooks',
        severity: 'critical',
        environment: 'production',
        fileTypes: ['tsx', 'ts'],
        codePatterns: ['async-await'],
        affectedArea: 'frontend',
        frequency: 'always',
        hasMinimalRepro: true,
        stepsToReproduce: 3,
        rootCause: 'breaking-change',
        fixType: 'code-change',
        complexity: 'medium',
        timeToResolve: '2h',
        lessonsLearned: ['Check migration guides'],
        relatedPatterns: ['suspense'],
      });
    });
  });

  describe('extractMetadataFromContent', () => {
    it('should merge explicit metadata with parsed frontmatter', () => {
      // Given
      const description = `---
project: from-frontmatter
---

Content.`;
      const explicitMetadata = { severity: 'high' as const };

      // When
      const result = extractMetadataFromContent(description, explicitMetadata);

      // Then
      expect(result.metadata?.project).toBe('from-frontmatter');
      expect(result.metadata?.severity).toBe('high');
    });

    it('should prefer explicit metadata over frontmatter', () => {
      // Given
      const description = `---
project: from-frontmatter
severity: low
---

Content.`;
      const explicitMetadata = { severity: 'high' as const };

      // When
      const result = extractMetadataFromContent(description, explicitMetadata);

      // Then
      expect(result.metadata?.severity).toBe('high');
    });

    it('should return clean description without frontmatter', () => {
      // Given
      const description = `---
project: test
---

# Title

Body content.`;

      // When
      const result = extractMetadataFromContent(description);

      // Then
      expect(result.cleanDescription).toBe('# Title\n\nBody content.');
    });
  });

  describe('generateFrontmatter', () => {
    it('should generate valid frontmatter from metadata', () => {
      // Given
      const metadata = {
        project: 'test-project',
        techStack: ['react', 'typescript'],
        severity: 'high' as const,
      };

      // When
      const result = generateFrontmatter(metadata);

      // Then
      expect(result).toContain('---');
      expect(result).toContain('project: test-project');
      expect(result).toContain('techStack:');
      expect(result).toContain('  - react');
      expect(result).toContain('  - typescript');
      expect(result).toContain('severity: high');
    });

    it('should skip undefined fields', () => {
      // Given
      const metadata = {
        project: 'test',
      };

      // When
      const result = generateFrontmatter(metadata);

      // Then
      expect(result).not.toContain('techStack');
      expect(result).not.toContain('severity');
    });
  });
});
