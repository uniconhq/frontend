import { describe, expect, it } from 'vitest';
import { publicPathOf } from '@/lib/task-pictures';
import { freeName, pictureLine, pictureName } from './picture-name';

describe('a picture added to a statement', () => {
  it('is named so a statement can link to it', () => {
    expect(pictureName('my diagram.png')).toBe('my-diagram.png');
    expect(pictureName('.hidden.png')).toBe('hidden.png');
    expect(pictureName('图.png')).toBe('picture.png');
    expect(pictureName('   ')).toBe('picture');
  });

  it('takes a name no picture has yet', () => {
    expect(freeName('tree.png', new Set())).toBe('tree.png');
    expect(freeName('tree.png', new Set(['tree.png', 'tree-2.png']))).toBe(
      'tree-3.png',
    );
    expect(freeName('tree', new Set(['tree']))).toBe('tree-2');
  });

  it('is shown by a line the statement draws as one of the task’s pictures', () => {
    const line = pictureLine('my diagram.png', 'public/my-diagram.png');
    expect(line).toBe('![my diagram](public/my-diagram.png)');
    expect(publicPathOf('public/my-diagram.png')).toEqual(['my-diagram.png']);
    expect(pictureLine('[x].png', 'public/x.png')).toBe('![x](public/x.png)');
  });
});
