import { useState } from 'react';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import { useOpenedField } from '../contest/opened';
import { usePlaceMay } from '../may';
import { readTask, writeTask } from '../forms/task-values';
import { ValuesForm, type ValuesFormProps } from '../forms/ValuesForm';
import type { TaskPlace } from './build-data';
import { taskPlaceOf } from './places';
import shared from '../organise.module.css';

function Form({
  values,
  busy,
  asking,
  onSave,
  admin,
}: ValuesFormProps & { admin: boolean }) {
  const [read] = useState(() => readTask(values, []));
  const [name, setName] = useState(read.values.name);
  useOpenedField(true);
  const changed = name !== read.values.name;
  return (
    <form
      className={shared.form}
      aria-label="Title"
      onSubmit={(event) => {
        event.preventDefault();
        onSave((fresh) =>
          writeTask(
            fresh,
            read.values,
            { ...read.values, name },
            {
              admin,
              unreadable: read.unreadable,
            },
          ),
        );
      }}
    >
      <FieldBox name="name">
        <TextInput
          label="Title"
          value={name}
          onChange={setName}
          description="What entrants see the task called, on its pages and in the contest."
          disabled={!admin || asking}
        />
      </FieldBox>
      {admin && (
        <div className={shared.actions}>
          <Button
            type="submit"
            loading={busy}
            disabled={!changed || asking || name.trim() === ''}
          >
            Save title
          </Button>
          {changed && <UnsavedNote />}
        </div>
      )}
    </form>
  );
}

/**
 * The task's title, what entrants see it called: the one setting not on the
 * task's page, since it is the admin's and changes nothing of how the task
 * grades. Saving it is a save of the task, answered as any other.
 */
export function TitleForm({ place }: { place: TaskPlace }) {
  const may = usePlaceMay(place);
  return (
    <ValuesForm
      place={place}
      placeOf={taskPlaceOf(place.org, place.contest, place.task)}
    >
      {(props) => <Form {...props} admin={may.edit_admin_settings} />}
    </ValuesForm>
  );
}
