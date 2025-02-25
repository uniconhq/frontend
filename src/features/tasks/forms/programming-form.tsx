import { zodResolver } from "@hookform/resolvers/zod";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { useQuery } from "@tanstack/react-query";
import { produce } from "immer";
import { PlusIcon, Trash, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { SubmitHandler, useFieldArray, useForm } from "react-hook-form";

import { File as ApiFile, InputStep } from "@/api";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { CheckboxField, NumberField, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import FormSection from "@/components/form/form-section";
import UnsavedChangesHandler from "@/components/form/unsaved-changes-handler";
import NodeInput from "@/components/node-graph/components/step/node-input";
import { Button } from "@/components/ui/button";
import { Form, FormLabel } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import FileEditor from "@/features/problems/components/tasks/file-editor";
import { GraphAction, graphReducer } from "@/features/problems/components/tasks/graph-context";
import TestcaseTabs from "@/features/problems/components/tasks/testcase-tabs";
import { getSupportedPythonVersions } from "@/features/problems/queries";
import { DEFAULT_PY_VERSION, ProgTaskFormT, ProgTaskFormZ } from "@/lib/schema/prog-task-form";
import { isFile, useSyncFormFieldsMultiple, uuid } from "@/lib/utils";

import FileInputSection from "./programming/file-inputs-section";

const createDefaultUserInput = () => ({
  id: uuid(),
  // TODO: make sure this is a valid file name (not already taken)
  label: "user_file.py",
  data: {
    id: uuid(),
    path: "user_file.py",
    content: "# INSERT FILE TEMPLATE HERE",
    trusted: false,
  },
});

const DEFAULT_FORM_VALUES: ProgTaskFormT = {
  title: "",
  description: "",
  environment: {
    language: "Python",
    extra_options: {
      version: DEFAULT_PY_VERSION,
      requirements: [],
    },
    time_limit_secs: 5,
    memory_limit_mb: 256,
    slurm: true,
    slurm_options: [],
  },
  required_user_inputs: [createDefaultUserInput()],
  files: [],
  testcases: [],
};

const DEFAULT_USER_INPUT_STEP: Omit<InputStep, "outputs"> = {
  id: "__USER_INPUT__",
  type: "INPUT_STEP",
  is_user: true,
};

// NOTE: WE have our own "id" field for our data objects, in order to deconflict with react-hook-form's own identifier field
// when using `useFieldArray`, we need to specify a custom keyName to avoid conflicts
const _REACT_FORM_ID_KEY = "_id";

type OwnProps = {
  title: string;
  initialValue?: ProgTaskFormT;
  onSubmit: SubmitHandler<ProgTaskFormT>;
};

const ProgrammingForm: React.FC<OwnProps> = ({ title, initialValue, onSubmit }) => {
  const form = useForm<ProgTaskFormT>({
    resolver: zodResolver(ProgTaskFormZ),
    defaultValues: initialValue ?? DEFAULT_FORM_VALUES,
  });

  const userInputs = useFieldArray({
    control: form.control,
    name: "required_user_inputs",
    keyName: _REACT_FORM_ID_KEY,
  });
  const testcases = useFieldArray({ control: form.control, name: "testcases", keyName: _REACT_FORM_ID_KEY });

  const dependencies = form.watch("environment.extra_options.requirements");
  const slurmOptions = form.watch("environment.slurm_options");

  const { data: validPythonVersions } = useQuery(getSupportedPythonVersions());

  const depsFileInputRef = useRef<HTMLInputElement>(null);
  const handleDepsFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const depsFile = event.target.files?.[0];
    if (!depsFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const depsData = (e.target?.result as string).trim();
      form.setValue("environment.extra_options.requirements", depsData.split("\n"));
      depsFileInputRef.current!.value = ""; // Reset file input
    };
    reader.readAsText(depsFile);
  };

  const [sharedUserInputStep, setSharedInputStep] = useState<InputStep>({ ...DEFAULT_USER_INPUT_STEP, outputs: [] });

  useSyncFormFieldsMultiple({
    form,
    fromKeys: ["required_user_inputs", "files"],
    toKey: "testcases",
    merges: [
      (fromValue, toValue) => {
        // Shared user input step for all testcases
        const newSharedUserInputStep: InputStep = {
          ...DEFAULT_USER_INPUT_STEP,
          outputs: fromValue,
        };
        const testcases = toValue.map((testcase) => ({
          ...testcase,
          nodes: [newSharedUserInputStep, ...testcase.nodes.filter((node) => node.id !== sharedUserInputStep.id)],
        }));
        setSharedInputStep(newSharedUserInputStep);
        return testcases;
      },
      (fromValue, toValue) => {
        const idToFile: Record<string, ApiFile> = fromValue.reduce((acc, file) => ({ ...acc, [file.id]: file }), {});
        const testcases = toValue.map((testcase) => ({
          ...testcase,
          nodes: testcase.nodes.map((node) => {
            if (node.type !== "INPUT_STEP") return node;
            const outputs = (node as InputStep).outputs.map((output) =>
              isFile(output.data) && output.data.id in idToFile
                ? { ...output, data: idToFile[output.data.id] }
                : output,
            );
            return { ...node, outputs };
          }),
        }));
        return testcases;
      },
    ],
  });

  const addTestcase = () =>
    testcases.append({ id: uuid(), order_index: testcases.fields.length, nodes: [sharedUserInputStep], edges: [] });

  const duplicateTestcase = (index: number) => {
    testcases.append({ ...testcases.fields[index], id: uuid(), order_index: testcases.fields.length });
  };

  const addUserInput = () => userInputs.append(createDefaultUserInput());

  const updateUserInput = (
    index: number,
    { newLabel, newFileContent }: { newLabel?: string; newFileContent?: string },
  ) => {
    const oldInput = userInputs.fields[index];
    const oldFileData = oldInput.data as ApiFile;
    userInputs.update(index, {
      ...oldInput,
      label: newLabel ?? oldInput.label,
      data: {
        ...oldFileData,
        path: newLabel ?? oldInput.label,
        content: newFileContent ?? oldFileData.content,
      },
    });
  };

  const addDependency = () => {
    const _KEY = "environment.extra_options.requirements";
    form.setValue(_KEY, form.getValues(_KEY).concat(""));
  };

  const deleteDependency = (index: number) => {
    const _KEY = "environment.extra_options.requirements";
    form.setValue(
      _KEY,
      form.getValues(_KEY).filter((_, i) => i !== index),
    );
  };

  const addSlurmOption = () => {
    const _KEY = "environment.slurm_options";
    form.setValue(_KEY, form.getValues(_KEY).concat(""));
  };

  const deleteSlurmOption = (index: number) => {
    const _KEY = "environment.slurm_options";
    form.setValue(
      _KEY,
      form.getValues(_KEY).filter((_, i) => i !== index),
    );
  };

  const updateTestcaseGraph = (index: number) => (action: GraphAction) => {
    const testcase = form.getValues("testcases")[index];
    const newState = produce(
      {
        id: testcase.id,
        steps: testcase.nodes,
        edges: testcase.edges,
        selectedStepId: null,
        selectedSocketId: null,
        edit: true,
        files: [],
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

  const updateTestcaseSettings = (index: number) => (change: { name?: string; isPrivate?: boolean }) => {
    const testcase = form.getValues("testcases")[index];
    const newTestcase = { ...testcase, ...{ name: change.name, is_private: change.isPrivate } };

    testcases.update(index, newTestcase);
  };

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <Form {...form}>
        <UnsavedChangesHandler form={form} />
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8">
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
              <NumberField label="Time limit (secs)" name="environment.time_limit_secs" className="w-fit" />
              <NumberField label="Memory limit (MB)" name="environment.memory_limit_mb" className="w-fit" />
            </div>
            {/* Dependencies */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <FormLabel>
                  <div className="flex items-center gap-2">
                    Dependencies
                    <Button type="button" variant="secondary" size="sm" onClick={addDependency}>
                      <PlusIcon />
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipContent side="right" align="center">
                          <span>
                            You can upload a <code>requirements.txt</code> file to prefill dependencies
                          </span>
                        </TooltipContent>
                        <input
                          accept=".txt"
                          type="file"
                          style={{ display: "none" }}
                          ref={depsFileInputRef}
                          onChange={handleDepsFileUpload}
                        />
                        <TooltipTrigger asChild type="button">
                          {/* Proxy click event to HTML input element above */}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => depsFileInputRef.current?.click()}
                          >
                            <UploadIcon />
                          </Button>
                        </TooltipTrigger>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </FormLabel>
              </div>
              <div className="flex flex-wrap gap-4">
                {dependencies.map((_, index) => (
                  <div key={index} className="flex items-center gap-4 font-mono">
                    <TextField name={`environment.extra_options.requirements.${index}`} />
                    <Button type="button" variant="destructive" onClick={() => deleteDependency(index)}>
                      <Trash />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            {/* Slurm options */}
            <FormLabel>
              <div className="flex items-center gap-4">
                Slurm
                <CheckboxField name="environment.slurm" />
              </div>
            </FormLabel>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <FormLabel>
                  <div className="flex items-center gap-2">
                    Slurm options
                    <Button type="button" variant="secondary" size="sm" onClick={addSlurmOption}>
                      <PlusIcon />
                    </Button>
                  </div>
                </FormLabel>
              </div>
              <div className="flex flex-wrap gap-4">
                {slurmOptions.map((_, index) => (
                  <div key={index} className="flex items-center gap-4 font-mono">
                    <TextField name={`environment.slurm_options.${index}`} />
                    <Button type="button" variant="destructive" onClick={() => deleteSlurmOption(index)}>
                      <Trash />
                    </Button>
                  </div>
                ))}
              </div>
              {slurmOptions.filter((opt) => opt.length).length > 0 && (
                <span className="text-gray-500">
                  Preview of <code>srun</code> command used to execute programs:{" "}
                  <code className="rounded-md border px-2 py-1 font-mono">{`srun ${slurmOptions.join(" ")}`}</code>
                </span>
              )}
            </div>
          </FormSection>
          <hr />
          <FileInputSection />
          <hr />
          <FormSection title="User File Inputs">
            <div className="flex flex-col items-start gap-4">
              <Button variant="secondary" type="button" onClick={addUserInput}>
                <PlusIcon />
                Add input
              </Button>
              {userInputs.fields.map((input, index) => (
                <Collapsible className="w-full" key={input.id}>
                  <div className="flex items-center gap-4" key={input.id}>
                    <NodeInput
                      className={["min-w-[160px]", "py-2"]}
                      value={input.label}
                      onChange={(newLabel) => updateUserInput(index, { newLabel })}
                    />
                    <CollapsibleTrigger asChild>
                      <Button variant="secondary" type="button" className="text-xs">
                        View/Edit
                      </Button>
                    </CollapsibleTrigger>
                    <ConfirmationDialog
                      onConfirm={() => userInputs.remove(index)}
                      description="Are you sure you want to delete this user file?"
                    >
                      <Button type="button" variant={"destructive"}>
                        <Trash />
                      </Button>
                    </ConfirmationDialog>
                  </div>
                  <CollapsibleContent>
                    <div className="h-[30vh]">
                      <FileEditor
                        fileName={input.label}
                        fileContent={(input.data as ApiFile).content}
                        onUpdateFileContent={(newFileContent: string) => updateUserInput(index, { newFileContent })}
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
              <TestcaseTabs
                edit
                testcases={testcases.fields}
                taskFiles={form.watch("files") || []}
                sharedUserInput={sharedUserInputStep}
                onGraphChange={updateTestcaseGraph}
                onSettingsChange={updateTestcaseSettings}
                onDuplicateTestcase={(index) => () => duplicateTestcase(index)}
                onDelete={(index) => () => {
                  testcases.remove(index);
                }}
              />
            </div>
          </div>
          <Button className="mt-5 w-fit bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">
            Submit
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default ProgrammingForm;
