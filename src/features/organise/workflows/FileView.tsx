import { useState } from 'react';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { Modal } from '@/ui/Modal';
import classes from './workflows.module.css';

/**
 * "View YAML" (M37, M11): the YAML file a version is stored as, read-only, in a
 * dialog of its own, out of the editing area. It is for checking: the graph
 * and the drawer are where it changes.
 */
export function FileView({
  title,
  label,
  text,
}: {
  /** The dialog's title, such as "The YAML of v2". */
  title: string;
  /** What the file is called, for a screen reader and a test. */
  label: string;
  text: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View YAML
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={title} wide>
        {open && (
          <div className={classes.stack}>
            <CodeEditor label={label} value={text} readOnly language="yaml" rows={28} />
            <div>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
