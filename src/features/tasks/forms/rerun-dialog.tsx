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
import { Button } from "@/components/ui/button";

type OwnProps = {
  onClose: () => void;
  onSaveWithRerun: () => void;
  onSaveWithoutRerun: () => void;
  isSafe: boolean;
};
const RerunDialog: React.FC<OwnProps> = ({ isSafe, onClose, onSaveWithRerun, onSaveWithoutRerun }) => {
  const title = isSafe ? "Rerun past attempts?" : "Changes may break previous attempts.";
  const description = isSafe
    ? "If you do not rerun, users will need to manually rerun their own submissions."
    : "Rerunning could cause inconsistencies in previous attempts' result displays.";

  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <div className="flex space-x-2">
            {isSafe && (
              <>
                <Button variant={"destructive"} onClick={onSaveWithoutRerun}>
                  Save only
                </Button>
                <AlertDialogAction onClick={onSaveWithRerun}>Save and rerun</AlertDialogAction>
              </>
            )}
            {!isSafe && (
              <>
                <Button variant={"destructive"} onClick={onSaveWithRerun}>
                  Save and rerun
                </Button>
                <AlertDialogAction onClick={onSaveWithoutRerun}>Save only</AlertDialogAction>
              </>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RerunDialog;
