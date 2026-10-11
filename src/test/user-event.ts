import {
  userEvent as library,
  type Options,
  type UserEvent,
} from '@testing-library/user-event';

/**
 * user-event as the tests use it, with no pause between one key or click and
 * the next. The library pauses with a zero-length timeout by default, which
 * Windows runs no sooner than its clock tick of about 15 ms, so each key typed
 * or tabbed cost a test that long. Nothing else changes: each direct call
 * still makes a user of its own, as the library's do.
 */
const NO_PAUSE = { delay: null } satisfies Options;

const userEvent = {
  setup: (options: Options = {}): UserEvent =>
    library.setup({ ...NO_PAUSE, ...options }),
  click: (element: Element) => library.click(element, NO_PAUSE),
  clear: (element: Element) => library.setup(NO_PAUSE).clear(element),
  keyboard: (text: string) => library.keyboard(text, NO_PAUSE),
  selectOptions: (select: Element, values: Parameters<UserEvent['selectOptions']>[1]) =>
    library.selectOptions(select, values, NO_PAUSE),
  type: (
    element: Element,
    text: string,
    options: Parameters<UserEvent['type']>[2] = {},
  ) => library.type(element, text, { ...NO_PAUSE, ...options }),
  upload: (element: HTMLElement, files: File | File[]) =>
    library.upload(element, files, NO_PAUSE),
};

export default userEvent;
