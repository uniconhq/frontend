import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
import TextareaField from "@/components/form/fields/textarea-field";
import UnsavedChangesHandler from "@/components/form/unsaved-changes-handler";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useCreateOrganisation } from "@/features/organisations/queries";

const organisationFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  description: z.string().min(1, "Description cannot be empty"),
});

type OrganisationFormType = z.infer<typeof organisationFormSchema>;

const organisationFormDefault = {
  name: "",
  description: "",
};

const CreateOrganisation = () => {
  const [error, setError] = useState("");

  const form = useForm<OrganisationFormType>({
    resolver: zodResolver(organisationFormSchema),
    defaultValues: organisationFormDefault,
  });

  const createOrganisationMutation = useCreateOrganisation();
  const navigate = useNavigate();

  const onSubmit: SubmitHandler<OrganisationFormType> = async (data) => {
    createOrganisationMutation.mutate(data, {
      onError: (error) => {
        setError(error.message);
      },
      onSuccess: (response) => {
        form.reset();
        navigate(`/organisations/${response.data?.id}`);
      },
    });
  };

  return (
    <div className="m-auto flex w-full max-w-5xl flex-col gap-8 px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create new organisation</h1>
      </div>
      {error && <ErrorAlert message={error} />}
      <UnsavedChangesHandler form={form} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <TextField name="name" label="Name" />
          <TextareaField name="description" label="Description" />
          <div>
            <Button className="bg-purple-600 text-white hover:bg-purple-600 hover:bg-opacity-80">Submit</Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CreateOrganisation;
