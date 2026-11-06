import { useState } from 'react';
import { $api } from '@/api/query';
import type { TaskWhere } from '@/lib/task-pictures';
import { formatLimit } from '@/lib/size';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { Group } from '@/ui/layout';
import shared from '../organise.module.css';
import { freeName, pictureLine, pictureName } from './picture-name';
import { pictureRefusal, picturesAllowed } from './statement-pictures';

/**
 * "Add a picture" on the Statement card (M51): a picture chosen, once it is
 * one the server says a picture may be (`pictures` on the task), waits for the
 * statement's save under a name no file under `public/` has (`taken`), and
 * the line that shows it, `![diagram](public/diagram.png)`, goes at the end
 * of the statement's text, for the organiser to move. Anything else is
 * refused in words and nothing is staged.
 */
export function AddPicture({
  task,
  taken,
  onStaged,
  disabled,
}: {
  task: TaskWhere;
  /** The names under `public/` now, with those already waiting for the save. */
  taken: ReadonlySet<string>;
  onStaged: (picture: { name: string; file: File; line: string }) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const pictures = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}',
    {
      params: { path: task },
    },
  ).data?.pictures;

  const stage = (file: File) => {
    if (pictures === undefined) return;
    const why = pictureRefusal(file, pictures);
    setRefused(why);
    if (why !== null) return;
    const name = freeName(pictureName(file.name), taken);
    onStaged({ name, file, line: pictureLine(file.name, `public/${name}`) });
    setOpen(false);
  };

  return (
    <div className={shared.stack}>
      {!open && (
        <Group gap="xs">
          <Button
            variant="secondary"
            onClick={() => setOpen(true)}
            disabled={disabled || pictures === undefined}
          >
            Add a picture
          </Button>
        </Group>
      )}
      {open && pictures !== undefined && (
        <>
          <FileDrop
            label="Picture"
            description={`A file ending in ${picturesAllowed(pictures)}, of at most ${formatLimit(pictures.most)}. A line that shows it goes at the end of the statement, for you to move; both are saved when the statement is.`}
            accept="image/*"
            files={[]}
            onChange={(chosen) => {
              const [file] = chosen;
              if (file !== undefined) stage(file);
            }}
            disabled={disabled}
          />
          <Group gap="xs">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setRefused(null);
              }}
            >
              Cancel
            </Button>
          </Group>
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
