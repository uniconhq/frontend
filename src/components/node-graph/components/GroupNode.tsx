import { IoPeopleCircle } from "react-icons/io5";

import { GroupNodeData } from "@/lib/types";
import { range } from "@/utils";

import { NodeSlot, NodeSlotGroup } from "./NodeSlot";

export function GroupNode({
  minUsers,
  maxUsers,
}: Pick<GroupNodeData, "minUsers" | "maxUsers">) {
  return (
    <>
      <div className="mb-2 flex items-center px-2">
        <IoPeopleCircle className="mr-1" />
        {minUsers}-{maxUsers}
      </div>
      <div className="flex flex-row justify-between">
        <NodeSlotGroup>
          {range(maxUsers).map((i: number) => (
            <NodeSlot
              key={i}
              id={`Group.In.${i}`}
              label={`User ${i + 1}`}
              type="source"
            />
          ))}
        </NodeSlotGroup>
        <NodeSlotGroup>
          <NodeSlot id="Group.Out" label="" type="target" />
        </NodeSlotGroup>
      </div>
    </>
  );
}
