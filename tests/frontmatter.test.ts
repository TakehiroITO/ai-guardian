import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../src/utils/frontmatter';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const input = `---
name: test-skill
description: A test skill
---

This is the content.`;

    const result = parseFrontmatter<{ name: string; description: string }>(input);
    expect(result.data.name).toBe('test-skill');
    expect(result.data.description).toBe('A test skill');
    expect(result.content).toBe('This is the content.');
  });

  it('returns empty data when no frontmatter', () => {
    const input = 'Just plain content without frontmatter.';
    const result = parseFrontmatter(input);
    expect(result.data).toEqual({});
    expect(result.content).toBe('Just plain content without frontmatter.');
  });

  it('returns empty data when only opening delimiter', () => {
    const input = `---
name: incomplete`;
    const result = parseFrontmatter(input);
    expect(result.data).toEqual({});
    expect(result.content).toBe(input.trim());
  });

  it('handles nested YAML structures', () => {
    const input = `---
name: test
context:
  paths:
    - ".ai/ARCHITECTURE.md"
  dynamic: true
---

Content here.`;

    const result = parseFrontmatter<{ name: string; context: { paths: string[]; dynamic: boolean } }>(input);
    expect(result.data.name).toBe('test');
    expect(result.data.context.paths).toEqual(['.ai/ARCHITECTURE.md']);
    expect(result.data.context.dynamic).toBe(true);
  });

  it('handles empty frontmatter', () => {
    const input = `---
---

Content.`;
    const result = parseFrontmatter(input);
    expect(result.content).toBe('Content.');
  });

  it('handles invalid YAML gracefully', () => {
    const input = `---
: invalid: yaml: here
---

Content.`;
    const result = parseFrontmatter(input);
    expect(result.content).toBe('Content.');
  });
});
