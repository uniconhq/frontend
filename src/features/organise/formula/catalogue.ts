import type { components } from '@/api/schema';

/**
 * The catalogue `GET /blocks` serves, narrowed to the forms the formula
 * editor reads.
 */
export type Catalogue = components['schemas']['Catalogue'];

/** What a page that writes formulas says when `GET /blocks` fails. */
export const BLOCKS_UNLOADED =
  'The blocks formulas are made of could not be loaded, so formulas cannot be shown, checked or saved. Reload the page to try again.';
