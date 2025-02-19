import { zodResolver } from "@hookform/resolvers/zod";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import TextareaField from "@/components/form/fields/textarea-field";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useCreateSubmission } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import { json } from "@/utils/json";

const submissionFormSchema = z.object({
  submission: z
    .string()
    .min(1, "Submission cannot be empty")
    .transform((str, ctx): z.infer<ReturnType<typeof json>> => {
      try {
        return JSON.parse(str);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON" });
        return z.NEVER;
      }
    }),
});

type SubmissionFormType = z.infer<typeof submissionFormSchema>;
const submissionFormDefault = {
  submission: "",
};

const CreateSubmission = () => {
  const id = useProblemId();
  const projectId = useProjectId();
  const createContestSubmissionMutation = useCreateSubmission(Number(id));
  const navigate = useNavigate();

  // @ts-expect-error - it is infinitely deep because of the definition in json.ts
  const form = useForm<SubmissionFormType>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: submissionFormDefault,
  });

  const onSubmit: SubmitHandler<SubmissionFormType> = async (data) => {
    // @ts-expect-error - just let the backend validate it
    createContestSubmissionMutation.mutate(data.submission, {
      onSuccess: (response) => {
        navigate(`/projects/${projectId}/submissions/${response.data?.id}`);
      },
    });
  };

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create a new submission</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <TextareaField label="Contest Submission" name="submission" rows={20} />
          <div className="mt-12">
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CreateSubmission;
