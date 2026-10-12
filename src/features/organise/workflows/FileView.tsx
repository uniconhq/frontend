import { useState } from 'react';
import { Button } from '@/ui/Button';
import { CodeEditor, type LineRange } from '@/ui/CodeEditor';
import { Modal } from '@/ui/Modal';
import classes from './workflows.module.css';

/**
 * "View file" (M37, M11): the file the workflow is stored as, read-only, in a
 * dialog of its own, out of the editing area. It is for checking: the graph
 * and the drawer are where it changes. The lines of the box selected are
 * marked.
 */
export function FileView({
  title,
  label,
  text,
  marked,
}: {
  /** The dialog's title, such as "The draft's file". */
  title: string;
  /** What the file is called, for a screen reader and a test. */
  label: string;
  text: string;
  marked?: LineRange[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View file
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={title} wide>
        {open && (
          <div className={classes.stack}>
            <CodeEditor
              label={label}
              value={text}
              readOnly
              language="yaml"
              rows={28}
              marked={marked}
            />
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
