import {
  userEvent as library,
  type Options,
  type UserEvent,
} from '@testing-library/user-event';

// No pause between keys: the default zero timeout costs about 15 ms per key on Windows.
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
