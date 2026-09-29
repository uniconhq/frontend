import { useSearchParams } from 'react-router';
import { BodyText } from '@/ui/BodyText';
import { SectionTitle } from '@/ui/SectionTitle';
import { t } from '@/lib/t';
import { FILE_PARAM } from './file-param';
import { FileEditor } from './FileEditor';
import { FileTree } from './FileTree';
import type { Place } from './place';
import classes from './Files.module.css';

/**
 * A contest's or a task's files: the tree on one side and the open file on
 * the other. Which file is open is `?file=` on the page's own address, so a
 * link to a file opens it. Every file opens as text.
 */
export function FileBrowser({ place }: { place: Place }) {
  const [search] = useSearchParams();
  const open = search.get(FILE_PARAM);

  return (
    <div className={classes.browser}>
      <SectionTitle>{t('Files')}</SectionTitle>
      <div className={classes.panes}>
        <FileTree place={place} open={open} />
        <div className={classes.pane}>
          {open === null ? (
            <BodyText tone="secondary">{t('Pick a file to open it.')}</BodyText>
          ) : (
            <FileEditor key={open} place={place} path={open} />
          )}
        </div>
      </div>
    </div>
  );
}
