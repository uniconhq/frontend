import { z } from "zod";

export const TaskFormZ = z.object({
  title: z.string().nonempty("Title cannot be empty!"),
  description: z.string().optional().nullable(),
  autograde: z.boolean().default(true).optional(),
});
