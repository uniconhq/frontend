import { zodResolver } from "@hookform/resolvers/zod";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { PropsWithChildren, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";

import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
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

import { useAddGroup } from "../queries";

const groupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
});

type GroupFormType = z.infer<typeof groupFormSchema>;

const groupFormDefault = {
  name: "",
};

type OwnProps = {
  projectId: number;
} & PropsWithChildren;

const AddGroupDialog: React.FC<OwnProps> = ({ children, projectId }) => {
  const form = useForm<GroupFormType>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: groupFormDefault,
  });

  const [error, setError] = useState("");

  const addGroupMutation = useAddGroup(projectId);

  const onSubmit: SubmitHandler<GroupFormType> = (data) => {
    addGroupMutation.mutate(data, {
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
              <DialogTitle>Add group</DialogTitle>
              <DialogDescription>Enter the name of your new group.</DialogDescription>
              {error && <ErrorAlert message={error} />}
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField name="name" label="Name" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="submit">Add group</Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddGroupDialog;
