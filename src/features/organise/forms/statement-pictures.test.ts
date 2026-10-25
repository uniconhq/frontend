import { describe, expect, it } from 'vitest';
import { showingPictures } from './statement-pictures';

describe('the settings a new picture is shown by', () => {
  it('adds public/ to what is shown now, keeping what is listed and its comments', () => {
    expect(
      showingPictures('name: Sum # the title\nscoring:\n  show:\n    now: [log]\n', [
        'tree.png',
      ]),
    ).toBe('name: Sum # the title\nscoring:\n  show:\n    now: [log, public/]\n');
  });

  it('changes nothing when public/, or the picture itself, is shown now', () => {
    expect(
      showingPictures('name: Sum\nscoring:\n  show:\n    now: [public/]\n', ['a.png']),
    ).toBeNull();
    expect(
      showingPictures('name: Sum\nscoring:\n  show:\n    now: [public/a.png]\n', [
        'a.png',
      ]),
    ).toBeNull();
  });

  it('lists the picture alone when a file under public/ is shown only later', () => {
    expect(
      showingPictures(
        'name: Sum\nscoring:\n  show:\n    after_close: [public/answer.png]\n',
        ['tree.png'],
      ),
    ).toBe(
      'name: Sum\nscoring:\n  show:\n    after_close: [public/answer.png]\n    now: [public/tree.png]\n',
    );
  });

  it('leaves settings it cannot read alone', () => {
    expect(showingPictures('name: [', ['a.png'])).toBeNull();
    expect(showingPictures('name: Sum\nscoring: 3\n', ['a.png'])).toBeNull();
    expect(
      showingPictures('name: Sum\nscoring:\n  show:\n    now: log\n', ['a.png']),
    ).toBeNull();
  });
});
