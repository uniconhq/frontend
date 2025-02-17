import { useContext } from "react";

import { InputStep, StepSocket } from "@/api";
import { Button } from "@/components/ui/button";
import { GraphActionType, GraphDispatchContext } from "@/features/problems/components/tasks/graph-context";

type OwnProps = {
  step: InputStep;
  socket: StepSocket;
};

const ViewFileButton: React.FC<OwnProps> = ({ step, socket }) => {
  const dispatch = useContext(GraphDispatchContext)!;
  return (
    <Button
      type="button"
      size={"sm"}
      className="h-fit w-fit px-1 py-1"
      variant={"secondary"}
      onClick={() => {
        dispatch({
          type: GraphActionType.SelectSocket,
          payload: {
            stepId: step.id,
            socketId: socket.id,
          },
        });
      }}
    >
      View file
    </Button>
  );
};

export default ViewFileButton;
