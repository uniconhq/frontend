import { zodResolver } from "@hookform/resolvers/zod";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { PropsWithChildren, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";

import { OrganisationPublic } from "@/api";
import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
import TextareaField from "@/components/form/fields/textarea-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";

import { useUpdateOrganisation } from "../queries";

const organisationFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  description: z.string().min(1, "Description cannot be empty"),
});

type OrganisationFormType = z.infer<typeof organisationFormSchema>;

type OwnProps = {
  organisation: OrganisationPublic;
} & PropsWithChildren;

const EditOrganisationDialog: React.FC<OwnProps> = ({ organisation, children }) => {
  const form = useForm<OrganisationFormType>({
    resolver: zodResolver(organisationFormSchema),
    defaultValues: organisation,
  });

  const [error, setError] = useState("");

  const updateGroupMutation = useUpdateOrganisation(organisation.id);

  const onSubmit: SubmitHandler<OrganisationFormType> = (data) => {
    updateGroupMutation.mutate(data, {
      onError: () => {
        setError("Something went wrong.");
      },
      onSuccess: () => {
        form.reset();
      },
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Edit organisation</DialogTitle>
              <DialogDescription />
              {error && <ErrorAlert message={error} />}
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField name="name" label="Name" />
              <TextareaField name="description" label="Description" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="submit">Save changes</Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditOrganisationDialog;
