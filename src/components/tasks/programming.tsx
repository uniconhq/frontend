import { useState } from "react";

import { InputStep, ProgrammingTask } from "@/api";
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
  const userInput: InputStep = {
    id: 0,
    type: "INPUT_STEP",
    inputs: [],
    outputs: task.required_inputs,
  };

  const [selectedTestcaseIdx, setSelectedTestcaseIdx] = useState<number | null>(
    task.testcases.length ? 0 : null,
  );

  return (
    <TaskContainer>
      <TaskSection>
        <TaskSectionHeader content="Question" />
        <span className="text-gray-300">{task.question}</span>
      </TaskSection>
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
                <TableCell>{task.environment.time_limit_secs}s</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Memory Limit</TableHead>
                <TableCell>{task.environment.memory_limit_mb}MB</TableCell>
              </TableRow>
              {task.environment.extra_options && (
                <>
                  <TableRow>
                    <TableHead>Extra Options</TableHead>
                    <TableCell>
                      <Table className="w-fit">
                        <TableBody>
                          {Object.entries(task.environment.extra_options).map(
                            ([key, value]) =>
                              !!value && (
                                <TableRow key={key}>
                                  <TableHead>{key}</TableHead>
                                  <TableCell className="whitespace-pre-line">
                                    {value}
                                  </TableCell>
                                </TableRow>
                              ),
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
              userInput={userInput}
              isSelected={selectedTestcaseIdx === index}
              onSelected={setSelectedTestcaseIdx}
            />
          ))}
        </div>
      </TaskSection>
      {
        <ProgrammingSubmitForm
          problemId={problemId}
          task={task}
          submit={submit}
        />
      }
    </TaskContainer>
  );
}
