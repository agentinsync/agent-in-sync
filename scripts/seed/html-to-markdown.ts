import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  fence: '```',
});

turndown.addRule('fencedCodeBlock', {
  filter: node => node.nodeName === 'PRE' && !!node.querySelector('code'),
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector('code');
    const text = code?.textContent ?? '';
    const lang = detectLanguage(code?.className ?? '');
    return `\n\n\`\`\`${lang}\n${text.replace(/\n$/, '')}\n\`\`\`\n\n`;
  },
});

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

export function detectLanguage(className: string): string {
  const match = className.match(/(?:language|lang)-(\w+)/);
  return match?.[1] ?? '';
}
