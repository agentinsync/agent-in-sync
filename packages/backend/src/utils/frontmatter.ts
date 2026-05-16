import { issueMetadataSchema, type IssueMetadata } from '@agent-in-sync/shared';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/;

export type ParsedContent = {
  metadata: IssueMetadata | null;
  content: string;
  rawFrontmatter: string | null;
};

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;

  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseYamlArray(
  lines: string[],
  startIndex: number,
  baseIndent: number
): { value: unknown[]; endIndex: number } {
  const result: unknown[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const lineIndent = line.search(/\S/);
    if (lineIndent < baseIndent && trimmed) {
      break;
    }

    if (trimmed.startsWith('- ')) {
      const itemValue = trimmed.slice(2).trim();

      if (itemValue.startsWith('name:') || itemValue.includes(':')) {
        const obj: Record<string, unknown> = {};
        const firstPart = itemValue.split(':');
        if (firstPart.length >= 2) {
          obj[firstPart[0]!.trim()] = parseYamlValue(firstPart.slice(1).join(':'));
        }

        i++;
        while (i < lines.length) {
          const nextLine = lines[i]!;
          const nextTrimmed = nextLine.trim();
          const nextIndent = nextLine.search(/\S/);

          if (!nextTrimmed || nextTrimmed.startsWith('#')) {
            i++;
            continue;
          }

          if (nextIndent <= baseIndent || nextTrimmed.startsWith('-')) {
            break;
          }

          const colonIdx = nextTrimmed.indexOf(':');
          if (colonIdx > 0) {
            const key = nextTrimmed.slice(0, colonIdx).trim();
            const val = nextTrimmed.slice(colonIdx + 1).trim();
            obj[key] = parseYamlValue(val);
          }
          i++;
        }

        result.push(obj);
        continue;
      } else {
        result.push(parseYamlValue(itemValue));
      }
    }

    i++;
  }

  return { value: result, endIndex: i };
}

function parseSimpleYaml(yamlString: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlString.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const valueAfterColon = trimmed.slice(colonIndex + 1).trim();

    if (!valueAfterColon) {
      const nextLine = lines[i + 1];
      if (nextLine?.trim().startsWith('-')) {
        const currentIndent = line.search(/\S/);
        const { value, endIndex } = parseYamlArray(lines, i + 1, currentIndent + 2);
        result[key] = value;
        i = endIndex;
        continue;
      }
      result[key] = null;
    } else {
      result[key] = parseYamlValue(valueAfterColon);
    }

    i++;
  }

  return result;
}

export function parseFrontmatter(content: string): ParsedContent {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return {
      metadata: null,
      content: content,
      rawFrontmatter: null,
    };
  }

  const [, frontmatter, body] = match;
  const fm = frontmatter ?? '';
  const bd = body ?? '';

  try {
    const parsed = parseSimpleYaml(fm);
    const validationResult = issueMetadataSchema.safeParse(parsed);

    if (validationResult.success) {
      return {
        metadata: validationResult.data,
        content: bd.trim(),
        rawFrontmatter: fm,
      };
    }

    return {
      metadata: null,
      content: bd.trim(),
      rawFrontmatter: fm,
    };
  } catch {
    return {
      metadata: null,
      content: bd.trim(),
      rawFrontmatter: fm,
    };
  }
}

export function extractMetadataFromContent(
  description: string,
  explicitMetadata?: IssueMetadata
): { metadata: IssueMetadata | null; cleanDescription: string } {
  if (explicitMetadata && Object.keys(explicitMetadata).length > 0) {
    const parsed = parseFrontmatter(description);
    return {
      metadata: { ...parsed.metadata, ...explicitMetadata },
      cleanDescription: parsed.content || description,
    };
  }

  const parsed = parseFrontmatter(description);
  return {
    metadata: parsed.metadata,
    cleanDescription: parsed.content || description,
  };
}

export function generateFrontmatter(metadata: IssueMetadata): string {
  const lines: string[] = ['---'];

  const addField = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          const entries = Object.entries(item);
          if (entries.length > 0) {
            const [firstKey, firstVal] = entries[0]!;
            lines.push(`  - ${firstKey}: ${JSON.stringify(firstVal)}`);
            for (let j = 1; j < entries.length; j++) {
              const [k, v] = entries[j]!;
              lines.push(`    ${k}: ${JSON.stringify(v)}`);
            }
          }
        } else {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  };

  if (metadata.project) addField('project', metadata.project);
  if (metadata.techStack) addField('techStack', metadata.techStack);
  if (metadata.packages) addField('packages', metadata.packages);
  if (metadata.errorType) addField('errorType', metadata.errorType);
  if (metadata.errorCategory) addField('errorCategory', metadata.errorCategory);
  if (metadata.severity) addField('severity', metadata.severity);
  if (metadata.environment) addField('environment', metadata.environment);
  if (metadata.fileTypes) addField('fileTypes', metadata.fileTypes);
  if (metadata.codePatterns) addField('codePatterns', metadata.codePatterns);
  if (metadata.affectedArea) addField('affectedArea', metadata.affectedArea);
  if (metadata.frequency) addField('frequency', metadata.frequency);
  if (metadata.hasMinimalRepro !== undefined) addField('hasMinimalRepro', metadata.hasMinimalRepro);
  if (metadata.stepsToReproduce) addField('stepsToReproduce', metadata.stepsToReproduce);
  if (metadata.rootCause) addField('rootCause', metadata.rootCause);
  if (metadata.fixType) addField('fixType', metadata.fixType);
  if (metadata.complexity) addField('complexity', metadata.complexity);
  if (metadata.timeToResolve) addField('timeToResolve', metadata.timeToResolve);
  if (metadata.lessonsLearned) addField('lessonsLearned', metadata.lessonsLearned);
  if (metadata.relatedPatterns) addField('relatedPatterns', metadata.relatedPatterns);
  if (metadata.customMetadata) addField('customMetadata', metadata.customMetadata);

  lines.push('---');
  return lines.join('\n');
}
