import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import shared from '../organise.module.css';
import { freeName, pictureLine, pictureName } from './picture-name';
import { pictureRefusal } from './statement-pictures';

/**
 * "Add a picture" on the Statement card (M51): a picture chosen, once it is
 * one the page can show and no larger than the forge serves, waits for the
 * statement's save under a name no file under `public/` has (`taken`), and
 * the line that shows it, `![diagram](public/diagram.png)`, goes at the end
 * of the statement's text, for the organiser to move. Anything else is
 * refused in words and nothing is staged.
 */
export function AddPicture({
  taken,
  onStaged,
  disabled,
}: {
  /** The names under `public/` now, with those already waiting for the save. */
  taken: ReadonlySet<string>;
  onStaged: (picture: { name: string; file: File; line: string }) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const stage = (file: File) => {
    const why = pictureRefusal(file);
    setRefused(why);
    if (why !== null) return;
    const name = freeName(pictureName(file.name), taken);
    onStaged({ name, file, line: pictureLine(file.name, `public/${name}`) });
    setOpen(false);
  };

  return (
    <div className={shared.stack}>
      {!open && (
        <div className={shared.actions}>
          <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
            Add a picture
          </Button>
        </div>
      )}
      {open && (
        <>
          <FileDrop
            label="Picture"
            description="A PNG, JPEG, GIF, WebP or SVG file of at most 10 MB. A line that shows it goes at the end of the statement, for you to move; both are saved when the statement is."
            accept="image/*"
            files={[]}
            onChange={(chosen) => {
              const [file] = chosen;
              if (file !== undefined) stage(file);
            }}
            disabled={disabled}
          />
          <div className={shared.actions}>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setRefused(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
      {refused !== null && (
        <div role="alert">
          <BodyText tone="secondary">{refused}</BodyText>
        </div>
      )}
    </div>
  );
}
