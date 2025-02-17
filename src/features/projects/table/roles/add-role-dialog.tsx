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

import { useAddRole } from "../../queries";

const roleFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
});

type RoleFormType = z.infer<typeof roleFormSchema>;

const roleFormDefault = {
  name: "",
};

type OwnProps = {
  projectId: number;
} & PropsWithChildren;

const AddRoleDialog: React.FC<OwnProps> = ({ children, projectId }) => {
  const form = useForm<RoleFormType>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: roleFormDefault,
  });

  const [error, setError] = useState("");

  const addRoleMutation = useAddRole(projectId);

  const onSubmit: SubmitHandler<RoleFormType> = (data) => {
    addRoleMutation.mutate(data, {
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
              <DialogTitle>Add role</DialogTitle>
              <DialogDescription>Enter the name of your new role.</DialogDescription>
              {error && <ErrorAlert message={error} />}
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField name="name" label="Name" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="submit">Add role</Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddRoleDialog;
