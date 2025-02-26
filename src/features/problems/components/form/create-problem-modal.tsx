import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { parseISO } from "date-fns";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { DateTimeField, RadioBooleanField, TextAreaField, TextField } from "@/components/form/fields";
import ErrorAlert from "@/components/form/fields/error-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useCreateProblem } from "@/features/problems/queries";
import { useProjectId } from "@/features/projects/hooks/use-id";

type OwnProps = {
  setOpen: (active: boolean) => void;
};

const problemFormSchema = z
  .object({
    name: z.string().min(1, "Title cannot be empty"),
    description: z.string().min(1, "Description cannot be empty"),
    restricted: z.boolean(),
    started_at: z.string().datetime({ offset: true }).optional().nullable(),
    ended_at: z.string().datetime({ offset: true }).optional().nullable(),
    closed_at: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .superRefine(({ started_at, ended_at, closed_at }, ctx) => {
    const startedDate = started_at ? parseISO(started_at) : new Date();
    const endedDate = ended_at ? parseISO(ended_at) : new Date(8.64e15);
    const closedDate = closed_at ? parseISO(closed_at) : new Date(8.64e15);
    if (endedDate < startedDate) {
      return ctx.addIssue({
        code: "custom",
        message: "Due date cannot be before release date (defaults to now if not set)",
        path: ["ended_at"],
      });
    }
    if (closedDate < endedDate) {
      return ctx.addIssue({
        code: "custom",
        message: "Lock date cannot be before due date",
      });
    }
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
    const now = new Date();
    createProblemMutation.mutate(
      { ...data, started_at: data.started_at ?? now.toISOString(), tasks: [] },
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
              <TextAreaField label="Description" name="description" rows={5} />

              <div className="my-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <DateTimeField name="started_at" label="Release Date" />
                <DateTimeField name="ended_at" label="Due Date" />
                <DateTimeField name="closed_at" label="Lock Date" />
              </div>
              <RadioBooleanField
                label="Access control"
                name="restricted"
                trueLabel="Restricted"
                falseLabel="Unrestricted"
              />
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
