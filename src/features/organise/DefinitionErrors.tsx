import type { DefinitionError } from '@/api/types';
import { PageLink } from '@/ui/PageLink';
import classes from './organise.module.css';

/**
 * Where a problem is fixed: the setting in words and the address that opens
 * it with its field focused.
 */
export type ProblemPlace = { label: string; to: string };

/**
 * What is wrong with a definition file. With `placeOf`, each problem names
 * the part of the page and the field it is about, in words, as a link that
 * opens it; without, each is at its place in the file, an empty place being
 * the file as a whole.
 */
export function DefinitionErrors({
  errors,
  placeOf,
}: {
  errors: DefinitionError[];
  placeOf?: (path: string) => ProblemPlace;
}) {
  if (errors.length === 0) return null;
  return (
    <ul className={classes.named} aria-label="Errors">
      {errors.map((error) => {
        const place = placeOf?.(error.path);
        return (
          <li key={`${error.path}:${error.message}`}>
            {place === undefined ? (
              <span className={classes.errorPath}>
                {error.path === '' ? 'the whole file' : error.path}
              </span>
            ) : (
              <PageLink to={place.to}>{place.label}</PageLink>
            )}
            {': '}
            {error.message}
          </li>
        );
      })}
    </ul>
  );
}
