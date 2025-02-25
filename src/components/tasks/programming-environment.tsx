import { MemoryStickIcon, PackageIcon, ServerIcon, TagIcon, TimerIcon } from "lucide-react";

import { ComputeContext } from "@/api";
import { Badge } from "@/components/ui/badge";

export const ProgrammingEnvironment = ({ environment }: { environment: ComputeContext }) => {
  const dependencies = environment.extra_options?.requirements ?? [];
  const slurmOptions = environment.slurm_options ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <span className="font-mono capitalize text-zinc-100">{environment.language.toLowerCase()}</span>
        {environment.extra_options?.version && (
          <Badge className="flex gap-2 py-1 font-mono text-zinc-100" variant="outline">
            <TagIcon className="h-4 w-4" />
            {environment.extra_options.version}
          </Badge>
        )}
      </div>
      {environment.slurm && <SlurmBadge options={slurmOptions} />}

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-3 rounded-md bg-zinc-800 p-4 transition-colors duration-100 hover:bg-zinc-700">
          <TimerIcon className="h-5 w-5 flex-shrink-0 text-zinc-400" />
          <div className="flex flex-col">
            <span className="text-xs text-zinc-400">Time Limit (s)</span>
            <span className="text-sm font-medium text-white">{environment.time_limit_secs}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md bg-zinc-800 p-4 transition-colors duration-100 hover:bg-zinc-700">
          <MemoryStickIcon className="h-5 w-5 flex-shrink-0 text-zinc-400" />
          <div className="flex flex-col">
            <span className="text-xs text-zinc-400">Memory Limit (MB)</span>
            <span className="text-sm font-medium text-white">{environment.memory_limit_mb}</span>
          </div>
        </div>

        {dependencies.length > 0 && (
          <div className="flex items-center gap-3 rounded-md bg-zinc-800 p-4 transition-colors duration-100 hover:bg-zinc-700">
            <PackageIcon className="h-5 w-5 flex-shrink-0 text-zinc-400" />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Dependencies</span>
              <div className="flex flex-wrap gap-2">
                {dependencies.map((req) => (
                  <Badge key={req} className="py-1 font-mono text-xs font-medium" variant="outline">
                    {req}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SlurmBadge = ({ options }: { options?: string[] }) => (
  <div className="flex">
    <Badge className="flex overflow-hidden bg-transparent p-0 text-sm" variant="outline">
      <div className="flex h-full items-center gap-1 bg-sky-400 px-2 py-1 text-slate-800">
        <ServerIcon className="h-4 w-4" />
        <span className="font-medium">Slurm</span>
      </div>
      {options && options.length > 0 && (
        <div className="flex h-full items-center gap-2 break-all px-2 py-1 font-mono font-medium">
          {options.join(" ")}
        </div>
      )}
    </Badge>
  </div>
);
