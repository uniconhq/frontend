import { zodResolver } from "@hookform/resolvers/zod";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible";
import { useQuery } from "@tanstack/react-query";
import { produce } from "immer";
import { PlusIcon, Trash } from "lucide-react";
import { SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import { useDebouncedCallback } from "use-debounce";
import { z } from "zod";

import { File } from "@/api";
import {
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import FormSection from "@/components/form/form-section";
import NodeInput from "@/components/node-graph/components/step/node-input";
import { Button } from "@/components/ui/button";
import { Form, FormLabel } from "@/components/ui/form";
import FileEditor from "@/features/problems/components/tasks/file-editor";
import {
  GraphAction,
  graphReducer,
} from "@/features/problems/components/tasks/graph-context";
import Testcase from "@/features/problems/components/tasks/testcase";
import { getSupportedPythonVersions } from "@/features/problems/queries";
import { ProgTaskForm } from "@/lib/schema/prog-task-form";
import { uuid } from "@/lib/utils";

export type ProgTaskFormT = z.infer<typeof ProgTaskForm>;

const DEFAULT_FORM_VALUES: Omit<ProgTaskFormT, "required_user_inputs"> = {
  title: "",
  description: "",
  environment: {
    language: "Python",
    extra_options: {
      version: "3.11.9",
      requirements: [],
    },
    time_limit_secs: 5,
    memory_limit_mb: 256,
    slurm: true,
    slurm_options: [],
  },
  testcases: [],
};

const DEFAULT_USER_INPUT: File = {
  name: "",
  content: "# INSERT FILE TEMPLATE HERE",
  trusted: false,
};

const DEFAULT_UPDATE_DEBOUNCE: number = 500;

type OwnProps = {
  title: string;
  initialValue?: ProgTaskFormT;
  onSubmit: SubmitHandler<ProgTaskFormT>;
};

const ProgrammingForm: React.FC<OwnProps> = ({
  title,
  initialValue,
  onSubmit,
}) => {
  const form = useForm<ProgTaskFormT>({
    resolver: zodResolver(ProgTaskForm),
    defaultValues: initialValue ?? DEFAULT_FORM_VALUES,
  });

  const userInputs = useFieldArray({ control: form.control, name: "required_user_inputs" }); // prettier-ignore
  const testcases = useFieldArray({ control: form.control, name: "testcases" });

  const dependencies = form.watch("environment.extra_options.requirements");

  const slurmOptions = form.watch("environment.slurm_options");

  const { data: validPythonVersions } = useQuery(getSupportedPythonVersions());

  const addTestcase = () =>
    testcases.append({
      id: uuid(),
      order_index: testcases.fields.length,
      nodes: [],
      edges: [],
    });

  const addUserInput = () =>
    userInputs.append({
      id: uuid(),
      label: "",
      data: { ...DEFAULT_USER_INPUT },
    });

  const updateUserInput = useDebouncedCallback(
    (
      index: number,
      {
        newLabel,
        newFileContent,
      }: { newLabel?: string; newFileContent?: string },
    ) => {
      const oldInput = form.watch("required_user_inputs")[index];
      const oldFileData = oldInput.data as File;
      userInputs.update(index, {
        ...oldInput,
        label: newLabel ?? oldInput.label,
        data: {
          ...oldFileData,
          name: newLabel ?? oldInput.label,
          content: newFileContent ?? oldFileData.content,
        },
      });
    },
    DEFAULT_UPDATE_DEBOUNCE,
  );

  const addDependency = () =>
    form.setValue(
      "environment.extra_options.requirements",
      dependencies.concat(""),
    );

  const deleteDependency = (index: number) => {
    const updatedDeps = dependencies.filter((_, i) => i !== index);
    form.setValue("environment.extra_options.requirements", updatedDeps);
  };

  const addSlurmOption = () =>
    form.setValue("environment.slurm_options", slurmOptions.concat(""));

  const deleteSlurmOption = (index: number) => {
    const updatedOpts = slurmOptions.filter((_, i) => i !== index);
    form.setValue("environment.slurm_options", updatedOpts);
  };

  const updateTestcase = (index: number) => (action: GraphAction) => {
    const testcase = form.getValues("testcases")[index];
    const newState = produce(
      {
        id: testcase.id,
        steps: testcase.nodes,
        edges: testcase.edges,
        selectedStepId: null,
        selectedSocketId: null,
        edit: true,
      },
      (draft) => {
        graphReducer(draft, action);
      },
    );
    testcases.update(index, {
      ...testcase,
      nodes: newState.steps,
      edges: newState.edges,
    });
  };

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-8"
        >
          <FormSection title="Title">
            <TextField name="title" className="w-1/3" />
          </FormSection>
          <FormSection title="Description">
            <TextAreaField name="description" rows={4} />
          </FormSection>
          <hr />
          <FormSection title="Environment">
            <div className="flex flex-wrap gap-8">
              <SelectField
                label="Language"
                name="environment.language"
                options={[{ label: "Python", value: "Python" }]}
                disabled
              />
              {/* Python version */}
              <SelectField
                label="Version"
                name="environment.extra_options.version"
                options={(validPythonVersions ?? []).map((version) => ({
                  label: version,
                  value: version,
                }))}
              />
              {/* Time and memory limits */}
              <NumberField
                label="Time limit (secs)"
                name="environment.time_limit_secs"
                className="w-fit"
              />
              <NumberField
                label="Memory limit (MB)"
                name="environment.memory_limit_mb"
                className="w-fit"
              />
            </div>
            {/* Dependencies */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <FormLabel>
                  <div className="flex items-center gap-2">
                    Dependencies
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addDependency}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                </FormLabel>
              </div>
              <div className="flex flex-wrap gap-4">
                {dependencies.map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <TextField
                      name={`environment.extra_options.requirements.${index}`}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => deleteDependency(index)}
                    >
                      <Trash />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            {/* Slurm options */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <FormLabel>
                  <div className="flex items-center gap-2">
                    Slurm options
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addSlurmOption}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                </FormLabel>
              </div>
              <div className="flex flex-wrap gap-4">
                {slurmOptions.map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <TextField name={`environment.slurm_options.${index}`} />
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => deleteSlurmOption(index)}
                    >
                      <Trash />
                    </Button>
                  </div>
                ))}
              </div>
              {slurmOptions.filter((opt) => opt.length).length > 0 && (
                <span className="text-gray-500">
                  Preview of <code>srun</code> command used to execute programs:{" "}
                  <code className="rounded-md border px-2 py-1 font-mono">
                    {`srun ${slurmOptions.join(" ")}`}
                  </code>
                </span>
              )}
            </div>
          </FormSection>
          <hr />
          <FormSection title="User File Inputs">
            <div className="flex flex-col items-start gap-4">
              <Button variant="secondary" type="button" onClick={addUserInput}>
                <PlusIcon />
                Add input
              </Button>
              {userInputs.fields.map((input, index) => (
                <Collapsible className="w-full" key={index}>
                  <div className="flex items-center gap-4" key={index}>
                    <NodeInput
                      className={["min-w-[160px]", "py-2"]}
                      value={input.label}
                      onChange={(newLabel) =>
                        updateUserInput(index, { newLabel })
                      }
                    />
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={"secondary"}
                        type="button"
                        className="text-xs"
                      >
                        View/Edit
                      </Button>
                    </CollapsibleTrigger>
                    <Button
                      type="button"
                      variant={"destructive"}
                      onClick={() => userInputs.remove(index)}
                    >
                      <Trash />
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <div className="h-[30vh]">
                      <FileEditor
                        fileName={input.label}
                        fileContent={(input.data as File).content}
                        onUpdateFileContent={(newFileContent: string) =>
                          updateUserInput(index, { newFileContent })
                        }
                        editableContent={true}
                        editableName={false}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </FormSection>
          <hr />
          <div className="flex w-full flex-col items-start">
            <div className="sticky top-0 z-20 w-full">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Testcases</h2>
                <Button variant="secondary" type="button" onClick={addTestcase}>
                  <PlusIcon />
                  Add testcase
                </Button>
              </div>
            </div>
            <div className="flex w-full flex-col gap-4">
              {testcases.fields.map((testcase, index) => (
                <div className="mt-2" key={testcase.id}>
                  <Testcase
                    index={index}
                    testcase={testcase}
                    userInput={{
                      id: uuid(),
                      type: "INPUT_STEP",
                      inputs: [],
                      outputs: [],
                    }}
                    edit={true}
                    nodeGraphOnChange={updateTestcase(index)}
                    onDelete={testcases.remove}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Button className="mt-5 bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">
              Submit
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default ProgrammingForm;
