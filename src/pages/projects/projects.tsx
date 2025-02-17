import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import EmptyPlaceholder from "@/components/layout/empty-placeholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { JoinProjectDialog } from "@/features/projects/components/join-project-dialog";
import { getProjects } from "@/features/projects/queries";

const Projects = () => {
  const { data: projects, isLoading } = useQuery(getProjects());
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  return (
    <div className="m-auto flex w-full max-w-5xl flex-col gap-8 p-4 px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button
          variant="ghost"
          className="hover:text-purple-300"
          onClick={() => {
            setJoinDialogOpen(true);
          }}
        >
          <Plus /> Join project
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {joinDialogOpen && <JoinProjectDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />}
        {!isLoading &&
          projects?.map((project) => (
            <Link to={`/projects/${project.id}`} key={project.id}>
              <Card className="group flex items-center justify-between p-4 hover:opacity-80">
                <div>
                  <CardTitle className="text-xl">{project.name}</CardTitle>
                  {project.roles[0] && <Badge className="mt-2 bg-gray-400">{project.roles[0].name}</Badge>}
                </div>

                <ArrowRight className="hidden h-4 w-4 group-hover:block" />
              </Card>
            </Link>
          ))}
        {!isLoading && !projects?.length && (
          <EmptyPlaceholder description="No projects found.">
            <span className="cursor-pointer text-purple-400 hover:opacity-80" onClick={() => setJoinDialogOpen(true)}>
              Join a project with an invitation key.
            </span>
          </EmptyPlaceholder>
        )}
      </div>
    </div>
  );
};

export default Projects;
