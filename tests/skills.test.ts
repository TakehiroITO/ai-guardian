import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSkill, listSkills } from '../src/core/skills';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-skills-test-'));
  const skillsDir = path.join(tmpDir, '.ai', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('loadSkill', () => {
  it('loads a skill from project directory', () => {
    fs.writeFileSync(path.join(tmpDir, '.ai', 'skills', 'review.md'), `---
name: review
description: Code review skill
tools: ["ai-guardian review"]
---

Review the code.`);

    const skill = loadSkill('review', tmpDir);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('review');
    expect(skill!.description).toBe('Code review skill');
    expect(skill!.tools).toEqual(['ai-guardian review']);
    expect(skill!.content).toBe('Review the code.');
    expect(skill!.source).toBe('project');
  });

  it('returns null for non-existent skill', () => {
    const skill = loadSkill('nonexistent', tmpDir);
    expect(skill).toBeNull();
  });
});

describe('listSkills', () => {
  it('lists all skills', () => {
    fs.writeFileSync(path.join(tmpDir, '.ai', 'skills', 'a.md'), `---
name: alpha
---
Content A.`);
    fs.writeFileSync(path.join(tmpDir, '.ai', 'skills', 'b.md'), `---
name: beta
---
Content B.`);

    const skills = listSkills(tmpDir);
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
  });

  it('returns empty when no skills directory', () => {
    fs.rmSync(path.join(tmpDir, '.ai', 'skills'), { recursive: true });
    const skills = listSkills(tmpDir);
    expect(skills).toEqual([]);
  });
});
