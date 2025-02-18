import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import CheckboxField from "@/components/form/fields/checkbox-field";
import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
import TextareaField from "@/components/form/fields/textarea-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useProjectId } from "@/features/projects/hooks/use-id";

import { useCreateProblem } from "../../queries";

type OwnProps = {
  setOpen: (active: boolean) => void;
};

const problemFormSchema = z.object({
  name: z.string().min(1, "Title cannot be empty"),
  description: z.string().min(1, "Description cannot be empty"),
  restricted: z.boolean(),
});

type ProblemFormType = z.infer<typeof problemFormSchema>;

const problemFormDefault = {
  name: "",
  description: "",
  restricted: false,
};

const CreateProblemModal: React.FC<OwnProps> = ({ setOpen }) => {
  const projectId = useProjectId();

  const [error, setError] = useState("");

  const form = useForm<ProblemFormType>({
    resolver: zodResolver(problemFormSchema),
    defaultValues: problemFormDefault,
  });

  const createProblemMutation = useCreateProblem(projectId);
  const navigate = useNavigate();

  const onSubmit: SubmitHandler<ProblemFormType> = async (data) => {
    createProblemMutation.mutate(
      { ...data, tasks: [] },
      {
        onError: (error) => {
          if ((error as AxiosError).status === 403) {
            setError("You don't have permission to create a problem.");
          } else {
            setError("Something went wrong.");
          }
        },
        onSuccess: (response) => {
          navigate(`/projects/${projectId}/problems/${response.data?.id}/edit`);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={setOpen}>
      <DialogContent className="min-w-[60vw]">
        <DialogHeader>
          <DialogTitle>New problem</DialogTitle>
        </DialogHeader>
        <div>
          {error && <ErrorAlert message={error} />}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-2">
              <TextField label="Title" name="name" />
              <TextareaField label="Description" name="description" rows={5} />
              <CheckboxField label="Restricted" name="restricted" />
              <div className="mt-6 flex justify-between">
                <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Create</Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateProblemModal;
