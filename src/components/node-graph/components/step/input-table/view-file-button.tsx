import { useQuery } from "@tanstack/react-query";
import { useContext, useEffect, useRef } from "react";

import { File, InputStep, StepSocket } from "@/api";
import { Button } from "@/components/ui/button";
import { getFile } from "@/features/files/queries";
import { GraphActionType, GraphDispatchContext } from "@/features/problems/components/tasks/graph-context";

type OwnProps = {
  step: InputStep;
  socket: StepSocket;
};

const ViewFileButton: React.FC<OwnProps> = ({ step, socket }) => {
  const dispatch = useContext(GraphDispatchContext)!;
  const file = socket.data as File;
  const isBinaryFile = (socket.data as File).on_minio;
  const key = file.key || "";
  const { data: downloadedFile } = useQuery({ ...getFile(key), enabled: isBinaryFile });
  const url = useRef("");

  useEffect(() => {
    if (downloadedFile) {
      url.current = URL.createObjectURL(downloadedFile as Blob);
    }
    return () => {
      if (url.current) {
        URL.revokeObjectURL(url.current);
      }
    };
  }, [downloadedFile]);

  if (isBinaryFile) {
    const file = socket.data as File;
    return (
      <Button size={"sm"} className="h-fit w-fit px-1 py-1" variant={"secondary"} asChild>
        <a href={url.current} download={file.path.split("/").pop()!}>
          Download file
        </a>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={"sm"}
      className="h-fit w-fit px-1 py-1"
      variant="secondary"
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
