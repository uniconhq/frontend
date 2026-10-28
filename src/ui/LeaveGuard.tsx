import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { BodyText } from './BodyText';
import { Button } from './Button';
import { Modal } from './Modal';
import classes from './LeaveGuard.module.css';

/**
 * Leaving the page with changes not saved asks first: by a link, the
 * switcher or the browser's back, and by closing the tab. `what` names the
 * changes, such as "Your changes to the draft". A page that saves its
 * changes says so by `dirty` going false, and leaves without asking.
 * Another search on the same page, such as a link that opens one of its
 * fields, stays on it, unless `search` says the search picks what the page
 * shows, as a workflow's version does.
 */
export function LeaveGuard({
  dirty,
  what = 'Your changes',
  search = false,
}: {
  dirty: boolean;
  what?: string;
  search?: boolean;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        (search && currentLocation.search !== nextLocation.search)),
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const asking = blocker.state === 'blocked';
  return (
    <Modal
      opened={asking}
      onClose={() => blocker.reset?.()}
      title="Leave without saving?"
    >
      <div className={classes.stack}>
        <BodyText size="md">{what} are not saved. Leaving loses them.</BodyText>
        <div className={classes.actions}>
          <Button onClick={() => blocker.reset?.()}>Stay</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Leave without saving
          </Button>
        </div>
      </div>
    </Modal>
  );
}
