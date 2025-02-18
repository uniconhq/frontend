import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useOrganisationId } from "@/features/projects/hooks/use-id";
import { ProjectQueryKeys, useCreateProject } from "@/features/projects/queries";

const projectFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
});

type ProjectFormType = z.infer<typeof projectFormSchema>;

const projectFormDefault = {
  name: "",
};

const CreateProject = () => {
  const [error, setError] = useState("");

  const form = useForm<ProjectFormType>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: projectFormDefault,
  });

  const id = useOrganisationId();

  const createProjectMutation = useCreateProject(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const onSubmit: SubmitHandler<ProjectFormType> = async (data) => {
    createProjectMutation.mutate(data, {
      onError: (error) => {
        setError(error.message);
      },
      onSuccess: (response) => {
        navigate(`/projects/${response.data?.id}`, {});
        // Invalidatation needed to display project in sidebar
        queryClient.invalidateQueries({ queryKey: [ProjectQueryKeys.Project] });
      },
    });
  };

  return (
    <div className="m-auto flex w-full max-w-5xl flex-col gap-8 px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create new project</h1>
      </div>
      {error && <ErrorAlert message={error} />}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <TextField name="name" label="Name" />
          <div>
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CreateProject;
