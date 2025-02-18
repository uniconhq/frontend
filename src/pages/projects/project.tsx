import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import CreateProblemModal from "@/features/problems/components/form/create-problem-modal";
import DefinitionsTable from "@/features/problems/table/definitions-table";
import { useProjectId } from "@/features/projects/hooks/use-id";
import { getProjectById } from "@/features/projects/queries";

const Project = () => {
  const id = useProjectId();
  const { data: project, isLoading } = useQuery(getProjectById(Number(id)));

  const [newProblemOpen, setNewProblemOpen] = useState(false);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!project) {
    return <div>Something went wrong.</div>;
  }

  return (
    <div className="m-auto flex w-full max-w-5xl flex-col gap-8 p-4 px-8">
      {newProblemOpen && <CreateProblemModal setOpen={setNewProblemOpen} />}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Problems</h2>
        {project.create_problems && (
          <Button variant="ghost" className="hover:text-purple-300" onClick={() => setNewProblemOpen(true)}>
            <Plus /> New Problem
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <DefinitionsTable data={project.problems} />
      </div>
    </div>
  );
};

export default Project;
