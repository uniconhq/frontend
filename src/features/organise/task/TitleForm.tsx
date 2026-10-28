import { useState } from 'react';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import { useOpenedField } from '../contest/opened';
import { DefinitionForm, type FormProps } from '../forms/DefinitionFile';
import { readTask, writeTask } from '../forms/task-values';
import type { TaskPlace } from './build-data';
import { taskMergeWords } from './merge-words';
import { placeOfIn } from './places';
import shared from '../organise.module.css';

function Form({ doc, busy, asking, onSave, admin }: FormProps & { admin: boolean }) {
  const [read] = useState(() => readTask(doc, []));
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
export function TitleForm({ place, admin }: { place: TaskPlace; admin: boolean }) {
  return (
    <DefinitionForm
      place={place}
      path="task.yaml"
      admin={admin}
      words={taskMergeWords(new Map())}
      placeOf={placeOfIn(place)}
    >
      {(props) => <Form {...props} admin={admin} />}
    </DefinitionForm>
  );
}
