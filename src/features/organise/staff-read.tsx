import type { components } from '@/api/schema';
import { OutLink } from '@/ui/OutLink';

type Where = { org: string; contest: string; task: string; number: number };

/** The files a submission was made with, each a download through the door. */
export function StaffFiles({
  where,
  entrant,
  files,
}: {
  where: Where;
  entrant: string;
  files: components['schemas']['SubmittedFiles'];
}) {
  const paths = Object.values(files.inputs).flatMap((input) => input.files);
  if (paths.length === 0) return null;
  const part = encodeURIComponent;
  const root = `/-/downloads/${part(where.org)}/${part(where.contest)}/${part(where.task)}/entrants/${part(entrant)}/${String(where.number)}`;
  return (
    <ul aria-label="Files">
      {paths.map((path) => (
        <li key={path}>
          <OutLink href={`${root}/${path.split('/').map(part).join('/')}`}>{path}</OutLink>
        </li>
      ))}
    </ul>
  );
}
