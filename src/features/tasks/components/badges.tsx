import { BotIcon } from "lucide-react";

import { TaskType } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const BADGE_COLOUR_MAP: Record<TaskType, string> = {
  MULTIPLE_CHOICE_TASK: "bg-blue-400",
  MULTIPLE_RESPONSE_TASK: "bg-red-400",
  SHORT_ANSWER_TASK: "bg-yellow-400",
  PROGRAMMING_TASK: "bg-green-400",
};

const BADGE_NAME_MAP: Record<TaskType, string> = {
  MULTIPLE_CHOICE_TASK: "Multiple Choice",
  MULTIPLE_RESPONSE_TASK: "Multiple Response",
  SHORT_ANSWER_TASK: "Short Answer",
  PROGRAMMING_TASK: "Programming",
};

export const TaskTypeBadge = ({ type }: { type: TaskType }) => {
  return <Badge className={cn(BADGE_COLOUR_MAP[type], "py-1")}>{BADGE_NAME_MAP[type]}</Badge>;
};

export const AutogradedBadge = () => (
  <Tooltip>
    <TooltipContent side="top" align="center">
      <span>This task is graded automatically</span>
    </TooltipContent>
    <TooltipTrigger>
      <BotIcon />
    </TooltipTrigger>
  </Tooltip>
);
