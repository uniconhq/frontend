import type { DefinitionError } from '@/api/types';
import { t } from '@/lib/t';
import classes from './organise.module.css';

/**
 * What is wrong with a definition file, each at its YAML path so the organiser
 * can find the line. An empty path is the file as a whole.
 */
export function DefinitionErrors({ errors }: { errors: DefinitionError[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className={classes.named} aria-label={t('Errors')}>
      {errors.map((error) => (
        <li key={`${error.path}:${error.message}`}>
          <span className={classes.errorPath}>
            {error.path === '' ? t('the whole file') : error.path}
          </span>
          {': '}
          {error.message}
        </li>
      ))}
    </ul>
  );
}
