import { type ClassValue, clsx } from "clsx";
import { useEffect } from "react";
import { FieldValues, Path, PathValue, UseFormReturn, useWatch } from "react-hook-form";
import { useBlocker } from "react-router-dom";
import { twMerge } from "tailwind-merge";
import { v4 as randomUUID } from "uuid";

import { File } from "@/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uuid(): string {
  return randomUUID();
}

export const isFile = (data: unknown): data is File => {
  if (data === undefined || data === null) return false;
  return typeof data === "object" && "path" in data && "content" in data;
};

// Referenced from: https://github.com/orgs/react-hook-form/discussions/9841
type UseSyncFormParams<T extends FieldValues, K1 extends keyof T, K2 extends keyof T> = {
  form: UseFormReturn<T>;
  fromKey: K1;
  toKey: K2;
  merge?: (fromValue: T[K1], toValue: T[K2]) => T[K1] | T[K2];
};

export const useSyncFormFields = <T extends FieldValues, K1 extends keyof T, K2 extends keyof T>({
  form,
  fromKey,
  toKey,
  merge = (a, _b) => a,
}: UseSyncFormParams<T, K1, K2>) => {
  const fromValue = useWatch<T>({ control: form.control, name: fromKey as unknown as Path<T> });

  useEffect(() => {
    const toValue = form.getValues(toKey as unknown as Path<T>);

    form.setValue(
      toKey as unknown as Path<T>,
      merge(fromValue as PathValue<T, Path<T>>, toValue as PathValue<T, Path<T>>),
    );
    // merge should not be a dependency, because it is a function that is not supposed to change
    // and if we place it here, we would have to always wrap it in useCallback before passing it to this hook
    // which is not very convenient
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromValue, form.setValue, fromKey, toKey]);
};

type UseSyncFormParamsMultiple<T extends FieldValues, FromKeys extends readonly (keyof T)[], ToKey extends keyof T> = {
  form: UseFormReturn<T>;
  fromKeys: FromKeys;
  toKey: ToKey;
  merges?: { [I in keyof FromKeys]: (fromValue: T[FromKeys[I]], toValue: T[ToKey]) => T[ToKey] };
};

export const useSyncFormFieldsMultiple = <
  T extends FieldValues,
  FromKeys extends readonly (keyof T)[],
  ToKey extends keyof T,
>({
  form,
  fromKeys,
  toKey,
  merges,
}: UseSyncFormParamsMultiple<T, FromKeys, ToKey>) => {
  const fromValues = useWatch<T>({ control: form.control, name: fromKeys as unknown as Path<T>[] });

  useEffect(() => {
    const toValue = form.getValues(toKey as unknown as Path<T>);
    let mergedValue = toValue;

    fromValues.forEach((fromValue, index) => {
      if (merges && merges[index]) {
        const merge = merges[index];
        mergedValue = merge(fromValue as PathValue<T, Path<T>>, mergedValue as PathValue<T, Path<T>>);
      }
    });

    form.setValue(toKey as unknown as Path<T>, mergedValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, toKey, ...fromValues]);
};

export const useBlockUnsavedChanges = (hasUnsavedChanges: boolean) => {
  const blocker = useBlocker(hasUnsavedChanges);
  const blocked = blocker.state === "blocked";

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message = "You have unsaved changes. Are you sure you want to leave?";
        event.returnValue = message; // For most browsers

        return message; // For some older versions
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  return {
    blocked,
    ignoreBlock: () => blocker.proceed?.(),
    resetBlock: () => blocker.reset?.(),
  };
};
