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
  onCancel?: () => void;
  title?: string;
  description?: string;
};

const ConfirmationDialog: React.FC<OwnProps & React.PropsWithChildren> = ({
  children,
  setOpen,
  onConfirm,
  onCancel,
  title = "Are you absolutely sure?",
  description = "This action cannot be undone.",
}) => {
  const openControlledByParent = setOpen !== undefined;
  const openProps = openControlledByParent ? { open: true, onOpenChange: setOpen } : {};
  return (
    <AlertDialog {...openProps}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;
