import { BORDER, GEOMETRY, HEAD, LINE, PIN, STACK } from './graph';

/** A workflow box's sizes. */
export const BOX = {
  closed: 260,
  open: 320,
  /** The space between two columns, which the wires cross. */
  gap: 88,
  stack: STACK,
  border: BORDER,
  head: HEAD,
  line: LINE,
  /** A workflow box's foot, which opens it. */
  foot: 26,
  pin: PIN,
  /** Room left of the first column for a step's tab of the inputs it reads, while they are hidden. */
  tab: 76,
} as const;

/** `BOX` and the row height as the stylesheets read them, in pixels. */
export const BOX_PROPERTIES = Object.fromEntries(
  Object.entries({ ...BOX, row: GEOMETRY.row }).map(([part, size]) => [
    `--box-${part}`,
    `${String(size)}px`,
  ]),
);
