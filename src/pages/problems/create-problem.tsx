import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import ErrorAlert from "@/components/form/fields/error-alert";
import TextareaField from "@/components/form/fields/textarea-field";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useCreateProblem } from "@/features/problems/queries";
import { useProjectId } from "@/features/projects/hooks/use-id";
import { json } from "@/utils/json";

const definitionFormSchema = z.object({
  definition: z
    .string()
    .min(1, "Definition cannot be empty")
    .transform((str, ctx): z.infer<ReturnType<typeof json>> => {
      try {
        return JSON.parse(str);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON" });
        return z.NEVER;
      }
    }),
});

type DefinitionFormType = z.infer<typeof definitionFormSchema>;
const definitionFormDefault = {
  definition: "",
};

const CreateProblem = () => {
  const id = useProjectId();
  const idNumber = Number(id);

  const createDefinitionMutation = useCreateProblem(idNumber);
  const navigate = useNavigate();

  const form = useForm<DefinitionFormType>({
    resolver: zodResolver(definitionFormSchema),
    defaultValues: definitionFormDefault,
  });

  const [error, setError] = useState("");

  const onSubmit: SubmitHandler<DefinitionFormType> = async (data) => {
    // @ts-expect-error - just let the backend validate it
    createDefinitionMutation.mutate(data.definition, {
      onSuccess: (response) => {
        navigate(`/projects/${id}/problems/${response.data?.id}`);
      },
      onError: (error) => {
        setError(JSON.stringify(error));
      },
    });
  };

  return (
    <div className="flex w-full flex-col gap-8 px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create new contest</h1>
      </div>
      {error && <ErrorAlert message={error} />}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <TextareaField label="Contest definition" name="definition" rows={20} />
          <div className="mt-12">
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CreateProblem;
