import { z } from "zod";

import { TaskFormZ } from "@/lib/schema/task-form";

export const ShortAnswerFormZ = TaskFormZ.extend({
  expected_answer: z.string(),
}).refine((data) => !data.autograde || data.expected_answer.length > 0, {
  message: "Expected answer cannot be empty if autograde is enabled",
  path: ["expected_answer"],
});

export type ShortAnswerFormT = z.infer<typeof ShortAnswerFormZ>;
