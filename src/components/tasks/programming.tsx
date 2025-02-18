import { useState } from "react";

import { ProgrammingTask } from "@/api";
import Testcase from "@/features/problems/components/tasks/testcase";
import TaskContainer from "@/features/tasks/components/task-container";
import TaskSection from "@/features/tasks/components/task-section";
import TaskSectionHeader from "@/features/tasks/components/task-section-header";

import { Table, TableBody, TableCell, TableHead, TableRow } from "../ui/table";
import ProgrammingSubmitForm from "./programming-submit";

export function Programming({
  submit,
  problemId,
  task,
}: {
  submit: boolean;
  problemId: number;
  task: ProgrammingTask;
}) {
  const [selectedTestcaseIdx, setSelectedTestcaseIdx] = useState<number | null>(task.testcases.length ? 0 : null);

  return (
    <TaskContainer title={task.title} description={task.description}>
      <TaskSection>
        <TaskSectionHeader content="Environment" />
        <div className="w-fit">
          <Table>
            <TableBody>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableCell>{task.environment.language}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Time Limit</TableHead>
                <TableCell className="font-mono">{task.environment.time_limit_secs}s</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Memory Limit</TableHead>
                <TableCell className="font-mono">{task.environment.memory_limit_mb}MB</TableCell>
              </TableRow>
              {task.environment.extra_options && (
                <>
                  <TableRow>
                    <TableHead>Extra Options</TableHead>
                    <TableCell>
                      <Table className="w-fit">
                        <TableBody>
                          {task.environment.extra_options.version && (
                            <TableRow>
                              <TableHead>Version</TableHead>
                              <TableCell className="font-mono">{task.environment.extra_options.version}</TableCell>
                            </TableRow>
                          )}
                          {task.environment.extra_options.requirements &&
                            task.environment.extra_options.requirements.length > 0 && (
                              <TableRow>
                                <TableHead>Dependencies</TableHead>
                                <TableCell className="font-mono">
                                  {task.environment.extra_options.requirements.join(", ")}
                                </TableCell>
                              </TableRow>
                            )}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </TaskSection>
      <TaskSection>
        <TaskSectionHeader content="Testcases" />
        <div className="flex gap-2 font-mono text-gray-300">
          {task.testcases.map((testcase, index) => (
            <Testcase
              edit={false}
              key={testcase.id}
              index={index}
              testcase={testcase}
              isSelected={selectedTestcaseIdx === index}
              onSelected={setSelectedTestcaseIdx}
            />
          ))}
        </div>
      </TaskSection>
      {<ProgrammingSubmitForm problemId={problemId} task={task} submit={submit} />}
    </TaskContainer>
  );
}
