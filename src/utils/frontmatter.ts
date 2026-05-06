import * as yaml from 'js-yaml';

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T;
  content: string;
}

export function parseFrontmatter<T = Record<string, unknown>>(markdown: string): FrontmatterResult<T> {
  const lines = markdown.split('\n');

  // First line must be '---'
  if (lines[0]?.trim() !== '---') {
    return { data: {} as T, content: markdown.trim() };
  }

  // Find the closing '---'
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { data: {} as T, content: markdown.trim() };
  }

  const yamlBlock = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n');

  let data: T;
  try {
    data = (yaml.load(yamlBlock) as T) || ({} as T);
  } catch {
    data = {} as T;
  }

  return { data, content: body.trim() };
}
