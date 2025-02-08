import {
  DragDropContext,
  Draggable,
  Droppable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";
import { TrashIcon } from "lucide-react";
import { UseFieldArrayReturn } from "react-hook-form";
import { z } from "zod";

import TextField from "@/components/form/fields/text-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export type Choice = {
  id: string; // UUID
  genId: string;
  text: string;
};

export const formWithChoicesSchema = z.object({
  choices: z
    .array(
      z.object({
        id: z.string().uuid(),
        text: z.string().min(1, "Choice text cannot be empty"),
      }),
    )
    .nonempty("Choices cannot be empty"),
});

export type FormWithChoicesType = z.infer<typeof formWithChoicesSchema>;

type OwnProps = {
  choices: UseFieldArrayReturn<FormWithChoicesType, "choices", "genId">;
  onDragEnd: OnDragEndResponder<string>;
  onCheck: (index: number) => void;
  isChecked: (index: number) => boolean;
  onDelete: (index: number) => void;
};

const Choices: React.FC<OwnProps> = ({
  choices,
  onDragEnd,
  isChecked,
  onCheck,
  onDelete,
}) => {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="choices">
        {(provided) => (
          <div
            className="flex w-full flex-col gap-2"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {choices.fields.map((choice, index) => (
              <Draggable
                draggableId={choice.genId}
                index={index}
                key={choice.genId}
              >
                {(provided) => (
                  <Card
                    className="flex w-full items-start gap-2 p-2"
                    key={choice.genId}
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <Checkbox
                      className="mt-[2px] h-8 w-8"
                      iconClassName="h-6 w-6"
                      checked={isChecked(index)}
                      onClick={() => onCheck(index)}
                    />
                    <div className="flex-grow">
                      <TextField name={`choices[${index}].text`} />
                    </div>
                    <Button
                      type="button"
                      variant={"destructive"}
                      onClick={() => onDelete(index)}
                    >
                      <TrashIcon />
                    </Button>
                  </Card>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default Choices;
