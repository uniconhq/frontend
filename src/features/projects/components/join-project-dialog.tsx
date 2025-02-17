import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";

import { useJoinProject } from "../queries";

type OwnProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const joinProjectFormSchema = z.object({
  invitation_key: z.string().min(1, "Invitation key cannot be empty"),
});

type JoinProjectFormType = z.infer<typeof joinProjectFormSchema>;

const joinProjectFormDefault = {
  invitation_key: "",
};

export function JoinProjectDialog({ open, onOpenChange }: OwnProps) {
  const [error, setError] = useState("");

  const form = useForm<JoinProjectFormType>({
    resolver: zodResolver(joinProjectFormSchema),
    defaultValues: joinProjectFormDefault,
  });

  const joinProjectMutation = useJoinProject();

  const navigate = useNavigate();
  const onSubmit: SubmitHandler<JoinProjectFormType> = async (data) => {
    joinProjectMutation.mutate(data.invitation_key, {
      onSuccess: (response) => {
        navigate(`/projects/${response.data?.id}`);
      },
      onError: () => {
        setError("Invalid invitation key.");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Join project</DialogTitle>
              <DialogDescription>Enter your project's invitation key.</DialogDescription>
              {error && <ErrorAlert message={error} />}
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField name="invitation_key" label="Invitation key" />
            </div>
            <DialogFooter>
              <Button type="submit">Join project</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
