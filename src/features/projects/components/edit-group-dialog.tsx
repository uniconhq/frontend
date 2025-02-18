import { zodResolver } from "@hookform/resolvers/zod";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { PropsWithChildren, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";

import { GroupPublic } from "@/api";
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

import { useUpdateGroup } from "../queries";

const groupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
});

type GroupFormType = z.infer<typeof groupFormSchema>;

type OwnProps = {
  projectId: number;
  group: GroupPublic;
} & PropsWithChildren;

const EditGroupDialog: React.FC<OwnProps> = ({ children, projectId, group }) => {
  const form = useForm<GroupFormType>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { name: group.name },
  });

  const [error, setError] = useState("");

  const updateGroupMutation = useUpdateGroup(projectId, group.id);

  const onSubmit: SubmitHandler<GroupFormType> = (data) => {
    updateGroupMutation.mutate(
      {
        ...data,
        supervisors: group.members.filter((member) => member.is_supervisor).map((member) => member.user.id),
        members: group.members.filter((member) => !member.is_supervisor).map((member) => member.user.id),
      },
      {
        onError: () => {
          setError("Something went wrong.");
        },
        onSuccess: () => {
          form.reset();
        },
      },
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Edit group</DialogTitle>
              <DialogDescription>Edit the name of your group.</DialogDescription>
              {error && <ErrorAlert message={error} />}
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField name="name" label="Name" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="submit">Edit group</Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditGroupDialog;
