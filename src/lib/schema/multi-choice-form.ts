import { z } from "zod";

import { TaskFormZ } from "@/lib/schema/task-form";

export const ChoicesZ = z.object({
  choices: z
    .array(
      z.object({
        id: z.string().uuid(),
        text: z.string().min(1, "Choice text cannot be empty"),
      }),
    )
    .nonempty("Choices cannot be empty"),
});

export type ChoicesT = z.infer<typeof ChoicesZ>;

export const MultipleChoiceFormZ = TaskFormZ.extend({
  expected_answer: z.string().uuid(),
  ...ChoicesZ.shape,
}).refine((data) => data.choices.map((choice) => choice.id).includes(data.expected_answer), {
  message: "Expected answer must be one of the choices",
  path: ["expected_answer"],
});

export type MultipleChoiceFormT = z.infer<typeof MultipleChoiceFormZ>;

export const MultipleResponseFormZ = TaskFormZ.extend({
  expected_answer: z.array(z.string().uuid()).nonempty("Correct choices cannot be empty"),
  ...ChoicesZ.shape,
}).refine(
  (data) => {
    const ids = data.choices.map((choice) => choice.id);
    return data.expected_answer.every((answer) => ids.includes(answer));
  },
  {
    message: "Expected answers must be one of the choices",
    path: ["expected_answer"],
  },
);

export type MultipleResponseFormT = z.infer<typeof MultipleResponseFormZ>;
