import { z } from "zod";

import { PythonVersion, Testcase } from "@/api/types.gen";

const positiveLimit = (label: string) =>
  z.coerce.number().positive(`${label} must be greater than 0!`);

const File = z.object({
  name: z.string().nonempty("File name cannot be empty!"),
  content: z.string(),
  trusted: z.boolean().optional().default(false),
});

const RequiredInput = z.object({
  id: z.string().nonempty("Input ID cannot be empty!").uuid(),
  label: z.string().nonempty("Input Label cannot be empty!"),
  data: z.union([z.string(), z.number(), z.boolean(), File]),
});

const SlurmOption = z
  .string()
  .nonempty("Slurm option cannot be empty!")
  .refine((value) => !value.includes(" "), {
    message: "Slurm option cannot contain spaces!",
  });

export const ProgTaskForm = z
  .object({
    title: z.string().nonempty("Title cannot be empty!"),
    description: z.string(),
    environment: z.object({
      language: z.literal("Python"),
      extra_options: z.object({
        version: z.custom<PythonVersion>(() => true),
        requirements: z
          .array(z.string().nonempty("Package name cannot be empty!"))
          .default([]),
      }),
      time_limit_secs: positiveLimit("Time limit"),
      memory_limit_mb: positiveLimit("Memory limit"),
      slurm: z.boolean().default(true),
      slurm_options: z.array(SlurmOption),
    }),
    required_user_inputs: z
      .array(RequiredInput)
      .nonempty("At least one user input is required!"),
    testcases: z.array(z.custom<Testcase>(() => true)),
  })
  .superRefine((values, context) => {
    // If `slurm` is not enabled, `slurm_options` should be empty
    if (!values.environment.slurm && values.environment.slurm_options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "There should no be Slurm options when Slurm is disabled!",
        path: ["slurm_options"],
      });
    }
  });
