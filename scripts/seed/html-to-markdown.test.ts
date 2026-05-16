import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, detectLanguage } from './html-to-markdown.js';

describe('htmlToMarkdown', () => {
  it('should convert a plain paragraph', () => {
    const md = htmlToMarkdown('<p>Hello world</p>');
    expect(md).toBe('Hello world');
  });

  it('should convert inline code to backticks', () => {
    const md = htmlToMarkdown('<p>Use <code>console.log()</code> for debugging</p>');
    expect(md).toContain('`console.log()`');
  });

  it('should convert pre>code blocks to fenced code blocks', () => {
    const html = '<pre><code>const x = 1;\nconst y = 2;</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('const y = 2;');
  });

  it('should detect language from class attribute on code blocks', () => {
    const html = '<pre><code class="language-typescript">const x: number = 1;</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```typescript');
    expect(md).toContain('const x: number = 1;');
  });

  it('should handle lang- prefix for language detection', () => {
    const html = '<pre><code class="lang-python">print("hello")</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```python');
  });

  it('should produce unfenced code block when no language class is present', () => {
    const html = '<pre><code>echo "hello"</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toMatch(/```\n/);
    expect(md).toContain('echo "hello"');
  });

  it('should convert bold and italic tags', () => {
    const md = htmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>');
    expect(md).toContain('**bold**');
    expect(md).toMatch(/[_*]italic[_*]/);
  });

  it('should convert unordered lists to Markdown list items', () => {
    const html = '<ul><li>first</li><li>second</li></ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('first');
    expect(md).toContain('second');
    expect(md).toMatch(/^[*\-]\s+first/m);
  });

  it('should convert headings to ATX style', () => {
    const md = htmlToMarkdown('<h2>My Heading</h2>');
    expect(md).toContain('## My Heading');
  });

  it('should handle mixed content with paragraphs and code', () => {
    const html = `
      <p>The error occurs when calling <code>fetchData()</code>:</p>
      <pre><code class="language-javascript">async function fetchData() {
  const res = await fetch('/api');
  return res.json();
}</code></pre>
      <p>The fix is to add error handling.</p>
    `;
    const md = htmlToMarkdown(html);

    // Given
    expect(md).toContain('`fetchData()`');
    expect(md).toContain('```javascript');
    expect(md).toContain('async function fetchData()');
    expect(md).toContain('The fix is to add error handling.');
  });
});

describe('detectLanguage', () => {
  it('should extract language from "language-xxx" class', () => {
    expect(detectLanguage('language-typescript')).toBe('typescript');
  });

  it('should extract language from "lang-xxx" class', () => {
    expect(detectLanguage('lang-python')).toBe('python');
  });

  it('should return empty string when no language class is present', () => {
    expect(detectLanguage('')).toBe('');
    expect(detectLanguage('highlight')).toBe('');
  });

  it('should handle class with multiple values', () => {
    expect(detectLanguage('prettyprint language-go linenums')).toBe('go');
  });
});
