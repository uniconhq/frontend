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

import { useJoinOrganisation } from "../queries";

type OwnProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const joinOrganisationSchema = z.object({
  key: z.string().min(1, "Invitation key cannot be empty"),
});

type JoinOrganisationFormType = z.infer<typeof joinOrganisationSchema>;

const joinOrganisationFormDefault = {
  key: "",
};

export function JoinOrganisationDialog({ open, onOpenChange }: OwnProps) {
  const [error, setError] = useState("");

  const form = useForm<JoinOrganisationFormType>({
    resolver: zodResolver(joinOrganisationSchema),
    defaultValues: joinOrganisationFormDefault,
  });

  const joinOrganisationMutation = useJoinOrganisation();

  const navigate = useNavigate();
  const onSubmit: SubmitHandler<JoinOrganisationFormType> = async (data) => {
    joinOrganisationMutation.mutate(data, {
      onSuccess: (response) => {
        navigate(`/organisations/${response.data?.id}`);
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
              <DialogTitle>Join organisation</DialogTitle>
              <DialogDescription>Enter your organisation's invitation key.</DialogDescription>
              {error && <ErrorAlert message={error} />}
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField name="key" label="Invitation key" />
            </div>
            <DialogFooter>
              <Button type="submit">Join organisation</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
