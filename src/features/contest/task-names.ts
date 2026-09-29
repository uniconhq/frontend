/** A task as the contest's pages name it. */
type Named = { name: string; label: string; title: string };

/**
 * The label the contest gives a task, or none when it gives none: the server
 * sends the task's name as its label then, and showing the name beside the
 * title says nothing twice.
 */
export function labelOf(task: Named): string | null {
  return task.label === task.name ? null : task.label;
}

/** What a task is called on its own page: the title, after its label. */
export function headingOf(task: Named): string {
  const label = labelOf(task);
  return label === null ? task.title : `${label}. ${task.title}`;
}
