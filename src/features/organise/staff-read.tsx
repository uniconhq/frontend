import type { components } from '@/api/schema';
import { $api } from '@/api/query';
import { OutLink } from '@/ui/OutLink';
import { nameOf, submittedItems } from '@/lib/submitted';

type Where = { org: string; contest: string; task: string; number: number };

/**
 * A staff file's name as the page shows it: its path under its input's
 * folder. The backend serves each path as the staff download address,
 * `/-/downloads/<org>/<contest>/<task>/entrants/<entrant>/<number>/files/...`.
 */
function staffName(address: string): string {
  const at = address.indexOf('/files/');
  return nameOf(at === -1 ? address : address.slice(at + 1));
}

/** The address as a link: each segment encoded, so a name stays one segment. */
function staffHref(address: string): string {
  return address.split('/').map(encodeURIComponent).join('/');
}

/**
 * The files and values a submission was made with, input by input, each part
 * of an input given in parts under it, named as the task's form names them
 * once its page can be read, and each file a download through the door.
 */
export function StaffFiles({
  where,
  files,
}: {
  where: Where;
  files: components['schemas']['SubmittedFiles'];
}) {
  const page = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/page',
    { params: { path: { org: where.org, contest: where.contest, task: where.task } } },
    { retry: false },
  );
  const { files: paths, values } = submittedItems(
    files.inputs,
    page.data?.inputs ?? [],
  );
  return (
    <>
      {paths.length > 0 && (
        <ul aria-label="Files">
          {paths.map(({ key, label, path }) => (
            <li key={key}>
              {label}: <OutLink href={staffHref(path)}>{staffName(path)}</OutLink>
            </li>
          ))}
        </ul>
      )}
      {values.length > 0 && (
        <ul aria-label="Values given">
          {values.map(({ key, label, value }) => (
            <li key={key}>
              {label}: {value}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
