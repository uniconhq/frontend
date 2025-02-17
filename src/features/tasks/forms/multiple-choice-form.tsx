import { OnDragEndResponder } from "@hello-pangea/dnd";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import React from "react";
import { SubmitHandler, useFieldArray, UseFieldArrayReturn, useForm } from "react-hook-form";

import { CheckboxField, ErrorAlert, TextField } from "@/components/form/fields";
import FormSection from "@/components/form/form-section";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import Choices from "@/features/tasks/forms/choices";
import { ChoicesT, MultipleChoiceFormT, MultipleChoiceFormZ } from "@/lib/schema/multi-choice-form";
import { uuid } from "@/lib/utils";

const DEFAULT_FORM_VALUES: Omit<MultipleChoiceFormT, "expected_answer" | "choices"> = {
  title: "",
  autograde: true,
};

type OwnProps = {
  title: string;
  initialValue?: MultipleChoiceFormT;
  onSubmit: SubmitHandler<MultipleChoiceFormT>;
};

const MultipleChoiceForm: React.FC<OwnProps> = ({ title, initialValue, onSubmit }) => {
  const form = useForm<MultipleChoiceFormT>({
    resolver: zodResolver(MultipleChoiceFormZ),
    defaultValues: initialValue ?? DEFAULT_FORM_VALUES,
  });

  const { formState, trigger } = form;
  const choices = useFieldArray({ control: form.control, name: "choices", keyName: "genId" });

  const onDragEnd: OnDragEndResponder<string> = ({ source, destination }) => {
    if (!destination || source.index === destination.index) return;
    choices.move(source.index, destination.index);
  };

  const isChecked = (index: number) => form.getValues().choices[index].id === form.getValues().expected_answer;

  const onCheck = (index: number) => {
    form.setValue("expected_answer", choices.fields[index].id);
    form.trigger("expected_answer");
  };

  const onDelete = (index: number) => {
    if (form.getValues().expected_answer === choices.fields[index].id) {
      // @ts-expect-error clear the expected answer if the choice is deleted
      form.setValue("expected_answer", undefined);
      trigger("expected_answer");
    }
    choices.remove(index);
  };

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormSection title="Task details">
            <TextField label="Question" name="title" />
          </FormSection>
          <hr />
          <FormSection title="Autograde?">
            <CheckboxField label="" name="autograde" className="mt-2" />
          </FormSection>
          <hr />
          <FormSection title="Choices">
            <div className="flex flex-col items-start gap-4">
              <Button variant={"outline"} type="button" onClick={() => choices.append({ id: uuid(), text: "" })}>
                <PlusIcon />
                Add choice
              </Button>
              {formState.errors.expected_answer && <ErrorAlert message="Select the correct option." />}
              <Choices
                choices={choices as unknown as UseFieldArrayReturn<ChoicesT, "choices", "genId">}
                onDragEnd={onDragEnd}
                onCheck={onCheck}
                isChecked={isChecked}
                onDelete={onDelete}
              />
            </div>
          </FormSection>

          <div className="ml-4 mt-12">
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default MultipleChoiceForm;
