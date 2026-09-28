import { t } from '@/lib/t';
import classes from './Breadcrumb.module.css';

/**
 * Filesystem-style trail: org / contest / current, each segment a pill with a
 * dropdown that switches sideways at that level. Static until there is a
 * contest to name, since the segments come from the route params once contest
 * routes exist.
 */
export function Breadcrumb() {
  return (
    <nav className={classes.trail} aria-label={t('Breadcrumb')}>
      <span className={classes.segment}>
        {t('browse')}
        <span className={classes.caret} aria-hidden="true">
          ▾
        </span>
      </span>
    </nav>
  );
}
