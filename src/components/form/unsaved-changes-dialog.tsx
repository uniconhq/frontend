import ConfirmationDialog from "../confirmation-dialog";

type OwnProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

const UnsavedChangesDialog: React.FC<OwnProps> = ({ onConfirm, onCancel }) => {
  return (
    <ConfirmationDialog
      setOpen={onCancel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      title="Are you sure you want to leave this page?"
      description="You have unsaved changes that will be lost."
    />
  );
};

export default UnsavedChangesDialog;
