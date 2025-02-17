import React from "react";
import { PropsWithChildren } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";

const CreateTaskPopover: React.FC<PropsWithChildren> = ({ children }) => {
  const id = useProblemId();
  const projectId = useProjectId();
  return (
    <Popover>
      <PopoverTrigger className="text-purple-400 hover:text-purple-400/80" asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col">
          <Link to={`/projects/${projectId}/problems/${id}/edit/tasks/new/programming`}>
            <Button variant="ghost" className="w-full justify-start">
              Programming
            </Button>
          </Link>
          <Link to={`/projects/${projectId}/problems/${id}/edit/tasks/new/multiple-choice`}>
            <Button variant="ghost" className="w-full justify-start">
              Multiple choice
            </Button>
          </Link>
          <Link to={`/projects/${projectId}/problems/${id}/edit/tasks/new/multiple-response`}>
            <Button variant="ghost" className="w-full justify-start">
              Multiple response
            </Button>
          </Link>
          <Link to={`/projects/${projectId}/problems/${id}/edit/tasks/new/short-answer`}>
            <Button variant="ghost" className="w-full justify-start">
              Short answer
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CreateTaskPopover;
