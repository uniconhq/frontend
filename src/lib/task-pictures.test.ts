import { describe, expect, it } from 'vitest';
import { publicPathOf, taskPictureHref } from './task-pictures';

const SUM = { org: 'acme', contest: 'spring', task: 'sum' };
const ROUTE = '/api/v1/orgs/acme/contests/spring/tasks/sum/public';

describe('a task’s own pictures', () => {
  it('reads a path under public/, written plain or from here', () => {
    expect(publicPathOf('public/diagram.png')).toEqual(['diagram.png']);
    expect(publicPathOf('./public/figures/tree.svg')).toEqual(['figures', 'tree.svg']);
    expect(publicPathOf('public/my%20tree.png')).toEqual(['my tree.png']);
  });

  it('takes no other address', () => {
    for (const src of [
      'https://example.com/public/a.png',
      '//example.com/public/a.png',
      '/public/a.png',
      'diagram.png',
      'statement/diagram.png',
      'public/',
      'public//a.png',
      'public/../task.yaml',
      'public/./a.png',
      'public/a/%2E%2E/b.png',
      'public/a%2Fb.png',
      'public/a.png?x=1',
      'public/a.png#top',
      'public\\a.png',
      'public/%E0%A4%A.png',
      'data:image/png;base64,AAAA',
    ]) {
      expect(publicPathOf(src), src).toBeNull();
    }
  });

  it('reads each from the task’s own route, every part encoded on its own', () => {
    expect(taskPictureHref(SUM, 'public/diagram.png')).toBe(`${ROUTE}/diagram.png`);
    expect(taskPictureHref(SUM, './public/figures/my%20tree.png')).toBe(
      `${ROUTE}/figures/my%20tree.png`,
    );
    expect(
      taskPictureHref({ org: 'a b', contest: 'c', task: 'd' }, 'public/x.png'),
    ).toBe('/api/v1/orgs/a%20b/contests/c/tasks/d/public/x.png');
    expect(taskPictureHref(SUM, 'https://example.com/x.png')).toBeNull();
  });
});
