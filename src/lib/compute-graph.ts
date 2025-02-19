import {
  File,
  IfElseStep,
  InputStep,
  LoopStep,
  ObjectAccessStep,
  OutputStep,
  PyRunFunctionSocket,
  PyRunFunctionStep,
  SocketType,
  StepSocket,
  StepType,
  StringMatchStep,
} from "@/api";

import { uuid } from "./utils";

export const createSocket = (
  type: SocketType,
  label?: string,
  data: string | number | boolean | File | null = null,
) => ({ id: uuid(), type, label, data });

const createBaseStep = (type: StepType, inputs: StepSocket[], outputs: StepSocket[]) => ({
  id: uuid(),
  type,
  inputs: [createSocket("CONTROL"), ...inputs],
  outputs: [createSocket("CONTROL"), ...outputs],
});

export const createDefaultStep = (type: StepType) => {
  switch (type) {
    case "INPUT_STEP":
      return {
        ...createBaseStep(type, [], [createSocket("DATA")]),
        is_user: false,
      } as InputStep;
    case "OUTPUT_STEP":
      return createBaseStep(type, [createSocket("DATA")], []) as OutputStep;
    case "PY_RUN_FUNCTION_STEP":
      return {
        ...createBaseStep(
          type,
          [{ ...createSocket("DATA", "Module"), import_as_module: true }] as PyRunFunctionSocket[],
          [createSocket("DATA", "Result")],
        ),
        function_identifier: "",
        allow_error: false,
      } as PyRunFunctionStep;
    case "OBJECT_ACCESS_STEP":
      return {
        ...createBaseStep(type, [createSocket("DATA", "Object")], [createSocket("DATA", "Value")]),
        key: "",
      } as ObjectAccessStep;
    case "STRING_MATCH_STEP":
      return createBaseStep(
        type,
        [createSocket("DATA", "Operand 1"), createSocket("DATA", "Operand 2")],
        [createSocket("DATA", "Match?")],
      ) as StringMatchStep;
    case "LOOP_STEP":
      return createBaseStep(
        type,
        [createSocket("CONTROL", "Predicate")],
        [createSocket("CONTROL", "Body")],
      ) as LoopStep;
    case "IF_ELSE_STEP":
      return createBaseStep(
        type,
        [createSocket("CONTROL", "Predicate")],
        [createSocket("CONTROL", "If"), createSocket("CONTROL", "Else")],
      ) as IfElseStep;
  }
};
