import { OnDragEndResponder } from "@hello-pangea/dnd";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { SubmitHandler, useFieldArray, UseFieldArrayReturn, useForm } from "react-hook-form";

import { CheckboxField, ErrorAlert, TextAreaField } from "@/components/form/fields";
import FormSection from "@/components/form/form-section";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import Choices from "@/features/tasks/forms/choices";
import { ChoicesT, MultipleResponseFormT, MultipleResponseFormZ } from "@/lib/schema/multi-choice-form";
import { uuid } from "@/lib/utils";

const DEFAULT_FORM_VALUES: Omit<MultipleResponseFormT, "choices" | "expected_answer"> = {
  title: "",
  autograde: true,
};

type OwnProps = {
  initialValue?: MultipleResponseFormT;
  onSubmit: SubmitHandler<MultipleResponseFormT>;
};

const MultipleResponseForm: React.FC<OwnProps> = ({ initialValue, onSubmit }) => {
  const form = useForm<MultipleResponseFormT>({
    resolver: zodResolver(MultipleResponseFormZ),
    defaultValues: initialValue ?? DEFAULT_FORM_VALUES,
  });

  const choices = useFieldArray({ control: form.control, name: "choices", keyName: "genId" });

  const { formState, setValue, getValues, trigger } = form;

  const onDragEnd: OnDragEndResponder<string> = ({ source, destination }) => {
    if (!destination || source.index === destination.index) return;
    choices.move(source.index, destination.index);
  };

  const isChecked = (index: number) => {
    const choice = choices.fields[index];
    return form.getValues().expected_answer.includes(choice.id);
  };

  const onCheck = (index: number) => {
    const choice = choices.fields[index];
    form.setValue(
      "expected_answer",
      isChecked(index)
        ? (getValues().expected_answer.filter((i) => i !== choice.id) as [string, ...string[]])
        : [...getValues().expected_answer, choice.id],
    );
    form.trigger("expected_answer");
  };

  const onDelete = (index: number) => {
    const choice = choices.fields[index];
    choices.remove(index);

    setValue("expected_answer", getValues().expected_answer.filter((i) => i !== choice.id) as [string, ...string[]]);

    trigger("expected_answer");
  };

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New multiple response task</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormSection title="Task details">
            <TextAreaField label="Question" name="title" />
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
          <div className="mt-12">
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default MultipleResponseForm;
