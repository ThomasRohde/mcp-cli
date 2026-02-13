import { describe, expect, it } from 'vitest';
import { rankTools } from '../src/search.js';

describe('rankTools', () => {
  it('ranks stronger name matches first', () => {
    const tools = [
      { name: 'jira.createIssue', description: 'Create issue in Jira' },
      { name: 'jira.getIssue', description: 'Fetch issue details' },
      { name: 'github.createPullRequest', description: 'Create pull request' }
    ];
    const ranked = rankTools('create jira issue', tools);
    expect(ranked[0].tool.name).toBe('jira.createIssue');
  });
});
