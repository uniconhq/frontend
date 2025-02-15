import { File as FileType } from "@/api";

export const isFile = (data: unknown): data is FileType => {
  if (data === undefined || data === null) {
    return false;
  }
  return (
    (data as FileType).name !== undefined &&
    (data as FileType).content !== undefined
  );
};
