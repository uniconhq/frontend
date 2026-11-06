import type { components } from '@/api/schema';
import { $api } from '@/api/query';
import { OutLink } from '@/ui/OutLink';
import { nameOf, submittedItems } from '@/lib/submitted';

type Where = { org: string; contest: string; task: string; number: number };

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
          {paths.map(({ key, label, path, href }) => (
            <li key={key}>
              {label}: <OutLink href={href}>{nameOf(path)}</OutLink>
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
