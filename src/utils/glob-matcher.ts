import { minimatch } from 'minimatch';

export function matchGlob(pattern: string, filePath: string): boolean {
  return minimatch(filePath, pattern, { dot: true });
}

export function matchGlobs(patterns: string[], filePath: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, filePath));
}
