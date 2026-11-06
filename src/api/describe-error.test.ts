import { describe, expect, it } from 'vitest';
import { describeError } from './describe-error';
import { ApiError } from './problem';

describe('an error in words', () => {
  it('puts the server’s sentence under the page’s heading', () => {
    const refused = new ApiError({
      code: 'conflict',
      status: 409,
      title: 'Conflict',
      detail: 'The name x is taken. Choose another.',
    });
    expect(describeError(refused, 'Couldn’t save')).toEqual({
      title: 'Couldn’t save',
      message: 'The name x is taken. Choose another.',
    });
  });

  it('keeps its own words for an error the browser made, never its exception text', () => {
    const down = new ApiError({
      code: 'network_error',
      status: 0,
      title: 'Cannot reach Unicon',
      detail: 'Failed to fetch',
    });
    expect(describeError(down, 'Couldn’t save')).toEqual({
      title: 'Cannot reach Unicon',
      message:
        'Your work is kept in this tab. This page will work again when it is back.',
    });
  });
});
