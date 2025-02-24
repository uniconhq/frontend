import { Label } from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";

import { File, ProgrammingTask } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTaskAttemptResults, useCreateTaskAttempt, useRerunTaskAttempt } from "@/features/problems/queries";
import TaskSection from "@/features/tasks/components/task-section";
import TaskSectionHeader from "@/features/tasks/components/task-section-header";
import { isFile } from "@/lib/utils";

import TaskResultCard from "./submission-results/task-result";

const DEFAULT_REFETCH_INTERVAL: number = 5000;

export function ProgrammingSubmitForm({
  problemId,
  task,
  submit, // whether user is allowed to make submissions
}: {
  problemId: number;
  task: ProgrammingTask;
  submit: boolean;
}) {
  const { register, handleSubmit } = useForm();
  const rerunAttemptMutation = useRerunTaskAttempt(problemId);

  const createTaskAttemptMutation = useCreateTaskAttempt(problemId, task.id);
  const { data: taskAttemptResults, refetch } = useQuery({
    ...getTaskAttemptResults(problemId, task.id),
    refetchInterval: ({ state: { data } }) =>
      // Only refetch if there is a pending task result
      data?.some((taskAttempt) => taskAttempt.task_results.some((result) => result.status == "PENDING"))
        ? DEFAULT_REFETCH_INTERVAL
        : false,
  });

  const [selectedAttemptIdx, setSelectedAttemptIdx] = useState<number | null>(null);
  const [selectedResultIdx, setSelectedResultIdx] = useState<number | null>(null);

  useEffect(() => {
    if (taskAttemptResults?.length) {
      const lastAttemptIdx = taskAttemptResults.length - 1;
      setSelectedAttemptIdx(lastAttemptIdx);
      setSelectedResultIdx(taskAttemptResults[lastAttemptIdx]?.task_results.length - 1);
    }
  }, [taskAttemptResults]);

  // NOTE: Assume that all required inputs are files
  const requiredInputs: { id: string; name: string }[] = task.required_inputs
    .filter((input) => isFile(input.data))
    .map((input) => ({ id: input.id, name: (input.data as File).path }));

  const submitForm: SubmitHandler<Record<string, FileList>> = (formData) => {
    Promise.all(
      requiredInputs.map(async ({ id, name }) => {
        const file = formData[id.replace(/\./g, "_")];
        const content = await file[0].text();
        return { id, data: { name, content } };
      }),
    ).then((files) => {
      createTaskAttemptMutation.mutate({ task_id: task.id, value: files }, { onSuccess: () => refetch() });
    });
  };

  const selectedAttempt =
    taskAttemptResults && selectedAttemptIdx !== null ? taskAttemptResults[selectedAttemptIdx] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {submit && (
        <TaskSection>
          <TaskSectionHeader content="Submission" />
          <form onSubmit={handleSubmit(submitForm)}>
            {requiredInputs.map(({ id, name }) => (
              <div key={id} className="mt-2 grid w-full max-w-sm items-center gap-2">
                <Label className="text-md font-mono">{name}</Label>
                <Input {...register(id.replace(/\./g, "_"), { required: true })} id={id} type="file" />
              </div>
            ))}
            <Button className="mt-6" type="submit">
              Submit
            </Button>
          </form>
        </TaskSection>
      )}
      <TaskSection>
        <TaskSectionHeader content="Results" />
        <div className="relative flex flex-col gap-4">
          <div className="flex gap-4">
            <Select
              value={selectedAttemptIdx?.toString() ?? ""}
              onValueChange={(value) => {
                setSelectedAttemptIdx(+value);
                if (taskAttemptResults && taskAttemptResults[+value]?.task_results.length > 0) {
                  setSelectedResultIdx(taskAttemptResults[+value]?.task_results.length - 1);
                }
              }}
              disabled={!taskAttemptResults?.length}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select an attempt" />
              </SelectTrigger>
              <SelectContent>
                {taskAttemptResults
                  ?.slice()
                  .reverse()
                  .map((taskAttempt, index) => (
                    <SelectItem key={taskAttempt.id} value={`${taskAttemptResults.length - index - 1}`}>
                      Attempt #{taskAttemptResults.length - index}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedAttempt && selectedAttempt.task_results.length > 0 && (
              <Select
                value={selectedResultIdx?.toString() ?? ""}
                onValueChange={(value) => setSelectedResultIdx(+value)}
                disabled={!selectedAttempt.task_results?.length}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select a result" />
                </SelectTrigger>
                <SelectContent>
                  {selectedAttempt.task_results
                    ?.slice()
                    .reverse()
                    .map((taskResult, index) => (
                      <SelectItem key={taskResult.id} value={`${selectedAttempt.task_results.length - index - 1}`}>
                        Result #{selectedAttempt.task_results.length - index}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {submit && selectedAttempt && (
              <Button onClick={() => rerunAttemptMutation.mutate(selectedAttempt.id)}>
                <RefreshCcw />
                Rerun
              </Button>
            )}
          </div>
          {selectedAttemptIdx !== null && taskAttemptResults?.length && selectedAttempt ? (
            <TaskResultCard
              title={`Attempt ${selectedAttemptIdx + 1}`}
              taskAttempt={{
                ...selectedAttempt,
                task_results: selectedAttempt.task_results.filter((_result, index) => index === selectedResultIdx),
                task: {
                  ...task,
                  problem_id: problemId,
                  autograde: task.autograde ?? false,
                  other_fields: { ...task },
                },
              }}
              problemId={problemId}
            />
          ) : null}
        </div>
      </TaskSection>
    </div>
  );
}

export default ProgrammingSubmitForm;
