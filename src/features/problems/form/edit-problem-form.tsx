import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";

import { Problem } from "@/api";
import { DateTimeField, RadioBooleanField, TextAreaField, TextField } from "@/components/form/fields";
import ErrorAlert from "@/components/form/fields/error-alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useProjectId } from "@/features/projects/hooks/use-id";
import { useToast } from "@/hooks/use-toast";

import { useUpdateProblem } from "../queries";
import EditTasksDisplay from "./edit-tasks-display";

type OwnProps = {
  id: number;
  problem: Problem;
};

const problemFormSchema = z
  .object({
    name: z.string().min(1, "Name cannot be empty"),
    description: z.string().min(1, "Description cannot be empty"),
    restricted: z.boolean(),
    published: z.boolean(),
    started_at: z.coerce.date(),
    ended_at: z.coerce.date(),
    closed_at: z.coerce.date().optional().nullable(),
  })
  .superRefine(({ started_at, ended_at, closed_at }, ctx) => {
    if (ended_at < started_at) {
      return ctx.addIssue({
        code: "custom",
        message: "End date cannot be before start date",
        path: ["ended_at"],
      });
    }
    if (closed_at && closed_at < ended_at) {
      return ctx.addIssue({
        code: "custom",
        message: "Close date cannot be before end date",
      });
    }
  });

type ProblemFormType = z.infer<typeof problemFormSchema>;

const EditProblemForm: React.FC<OwnProps> = ({ id, problem }) => {
  const [error, setError] = useState("");

  const updateProblemMutation = useUpdateProblem(id);

  const form = useForm<ProblemFormType>({
    resolver: zodResolver(problemFormSchema),
    defaultValues: problem,
  });

  const toast = useToast();
  const projectId = useProjectId();

  const [taskOrder, setTaskOrder] = useState(
    problem.tasks.map((task, index) => ({
      id: task.id,
      orderIndex: index,
    })),
  );

  useEffect(() => {
    setTaskOrder(
      problem.tasks.map((task, index) => ({
        id: task.id,
        orderIndex: index,
      })),
    );
  }, [problem.tasks]);

  const sortedTasks = taskOrder.map((order) => problem.tasks.find((task) => task.id === order.id)!);

  const onSubmit: SubmitHandler<ProblemFormType> = async (data) => {
    updateProblemMutation.mutate(
      {
        ...data,
        task_order: taskOrder.map((order) => ({
          id: order.id,
          order_index: order.orderIndex,
        })),
      },
      {
        onSettled: (response) => {
          if (!response) {
            // this should not happen
            return;
          }
          if (response.status !== 200) {
            setError(JSON.stringify(response.error));
          } else {
            toast.toast({
              title: "Problem updated",
              description: `"${problem.name}" has been updated successfully.`,
            });
          }
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex w-full flex-col gap-8 px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Edit problem</h1>
            <Button variant="primary">Save</Button>
          </div>
          {error && <ErrorAlert message={error} />}
          <div className="flex w-full flex-col items-start gap-6 lg:flex-row lg:gap-0">
            <div className="sticky top-0">
              <h2 className="min-w-[200px] text-lg font-medium">Problem details</h2>
            </div>
            <div className="flex w-full flex-col gap-4">
              <TextField label="Title" name="name" />
              <TextAreaField label="Description" name="description" rows={5} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <DateTimeField name="started_at" label="Starts at" />
                <DateTimeField name="ended_at" label="Ends at" />
                <DateTimeField name="closed_at" label="Closes at" />
              </div>
              <div className="grid grid-cols-2">
                <RadioBooleanField
                  label="Access control"
                  name="restricted"
                  trueLabel="Restricted"
                  falseLabel="Unrestricted"
                />
                <RadioBooleanField label="Visibility" name="published" trueLabel="Published" falseLabel="Draft" />
              </div>
            </div>
          </div>
          <EditTasksDisplay tasks={sortedTasks} problemId={id} projectId={projectId} handleUpdateOrder={setTaskOrder} />
        </div>
      </form>
    </Form>
  );
};

export default EditProblemForm;
