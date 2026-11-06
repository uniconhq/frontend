type Named = { name: string; label: string; title: string };

/** The server sends the name as the label when there is none, so null then. */
export function labelOf(task: Named): string | null {
  return task.label === task.name ? null : task.label;
}

export function headingOf(task: Named): string {
  const label = labelOf(task);
  return label === null ? task.title : `${label}. ${task.title}`;
}
