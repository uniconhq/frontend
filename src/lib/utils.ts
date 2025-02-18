import { type ClassValue, clsx } from "clsx";
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
  return typeof data === "object" && "name" in data && "content" in data;
};
