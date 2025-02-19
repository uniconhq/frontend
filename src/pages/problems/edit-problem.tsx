import { useQuery } from "@tanstack/react-query";

import EditProblemForm from "@/features/problems/form/edit-problem-form";
import { getProblemById } from "@/features/problems/queries";
import { useProblemId } from "@/features/projects/hooks/use-id";

import { Unauthorized } from "../error";

const EditProblem = () => {
  const id = useProblemId();
  const { data } = useQuery(getProblemById(Number(id)));
  if (data && !data.edit) throw Unauthorized;

  return data && <EditProblemForm id={Number(id)} problem={data} />;
};

export default EditProblem;
