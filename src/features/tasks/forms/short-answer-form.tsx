import { zodResolver } from "@hookform/resolvers/zod";
import { SubmitHandler, useForm } from "react-hook-form";

import CheckboxField from "@/components/form/fields/checkbox-field";
import TextField from "@/components/form/fields/text-field";
import TextareaField from "@/components/form/fields/textarea-field";
import FormSection from "@/components/form/form-section";
import UnsavedChangesHandler from "@/components/form/unsaved-changes-handler";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { ShortAnswerFormT, ShortAnswerFormZ } from "@/lib/schema/short-answer-form";

const DEFAULT_FORM_VALUES: ShortAnswerFormT = {
  title: "",
  expected_answer: "",
  autograde: false,
};

type OwnProps = {
  title: string;
  initialValue?: ShortAnswerFormT;
  onSubmit: SubmitHandler<ShortAnswerFormT>;
};

const ShortAnswerForm: React.FC<OwnProps> = ({ title, initialValue, onSubmit }) => {
  const form = useForm<ShortAnswerFormT>({
    resolver: zodResolver(ShortAnswerFormZ),
    defaultValues: initialValue ?? DEFAULT_FORM_VALUES,
  });

  const { watch } = form;

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <Form {...form}>
        <UnsavedChangesHandler form={form} />
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormSection title="Task details">
            <TextareaField label="Question" name="title" />
          </FormSection>
          <hr />
          <FormSection title="Autograde?">
            <CheckboxField label="" name="autograde" className="mt-2" />
            {watch("autograde") && <TextField label="Expected answer" name="expected_answer" />}
          </FormSection>

          <div className="mt-12">
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default ShortAnswerForm;
