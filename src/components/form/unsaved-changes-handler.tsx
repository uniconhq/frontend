import { FieldValues, UseFormReturn } from "react-hook-form";

import { useBlockUnsavedChanges } from "@/lib/utils";

import UnsavedChangesDialog from "./unsaved-changes-dialog";

type OwnProps<T extends FieldValues> = {
  form?: UseFormReturn<T>;
  isDirty?: boolean;
};

const UnsavedChangesHandler = <T extends FieldValues>({ form, isDirty }: OwnProps<T>) => {
  // If neither form or isDirty is provided, we assume this component is used wrongly, so we don't block.
  if (!form && isDirty === undefined)
    console.warn(
      "UnsavedChangesHandler is used without form or isDirty prop. This component will not block unsaved changes.",
    );

  const shouldBlock =
    isDirty ??
    (form
      ? !!Object.keys(form.formState.dirtyFields).length &&
        !form.formState.isSubmitting &&
        !form.formState.isSubmitSuccessful
      : false);

  const { blocked, ignoreBlock, resetBlock } = useBlockUnsavedChanges(shouldBlock);
  if (!blocked || !shouldBlock) return null;

  return <UnsavedChangesDialog onConfirm={() => ignoreBlock()} onCancel={() => resetBlock()} />;
};

export default UnsavedChangesHandler;
