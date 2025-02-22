import { AlertDialogTrigger } from "@radix-ui/react-alert-dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type OwnProps = {
  setOpen?: (active: boolean) => void;
  onConfirm: () => void;
  description?: string;
};

const ConfirmationDialog: React.FC<OwnProps & React.PropsWithChildren> = ({
  children,
  setOpen,
  onConfirm,
  description = "This action cannot be undone.",
}) => {
  const openControlledByParent = setOpen !== undefined;
  const openProps = openControlledByParent ? { open: true, onOpenChange: setOpen } : {};
  return (
    <AlertDialog {...openProps}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;
