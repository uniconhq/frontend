import React from "react";
import { Link, UIMatch, useLocation, useMatches } from "react-router-dom";

import {
  Breadcrumb as ShadcnBreadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { Separator } from "../ui/separator";

type Handle = {
  crumb?: (match: UIMatch) => BreadcrumbPart;
};

export type BreadcrumbPart = {
  href?: string;
  label: string;
};

const Breadcrumb = () => {
  const matches = useMatches() as unknown as UIMatch<unknown, Handle>[];
  const matchesWithBreadcrumbs = matches.filter((match) => !!match.handle?.crumb);
  const pathname = useLocation().pathname;
  return (
    <>
      {matchesWithBreadcrumbs.length > 0 && <Separator orientation="vertical" className="mr-2 h-4" />}
      <ShadcnBreadcrumb>
        <BreadcrumbList>
          {matchesWithBreadcrumbs.map((match: UIMatch<unknown, Handle>, index) => {
            // Never happens, since filtered above.
            if (!match.handle.crumb) {
              return;
            }
            const part = match.handle.crumb(match);
            return (
              <React.Fragment key={match.id}>
                {index !== 0 && <BreadcrumbSeparator />}
                {index !== matchesWithBreadcrumbs.length - 1 && (
                  <BreadcrumbItem>
                    {part.href && part.href !== pathname ? (
                      <BreadcrumbLink asChild>
                        <Link to={part.href}>{part.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <span>{part.label}</span>
                    )}
                  </BreadcrumbItem>
                )}
                {index === matchesWithBreadcrumbs.length - 1 && (
                  <BreadcrumbItem>
                    <BreadcrumbPage>{part.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </ShadcnBreadcrumb>
    </>
  );
};

export default Breadcrumb;
