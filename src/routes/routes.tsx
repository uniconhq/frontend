import "@/index.css";

import { Navigate, UIMatch } from "react-router-dom";

import { GroupPublic, OrganisationPublicWithProjects, Problem as ProblemType, ProjectPublicWithProblems } from "@/api";
import AuthenticatedPage from "@/components/layout/authenticated-page";
import Layout from "@/components/layout/layout.tsx";
import CreateSubmission from "@/pages/create-submission";
import Error from "@/pages/error";
import Login from "@/pages/login";
import CreateOrganisation from "@/pages/organisations/create-organisation";
import Organisation from "@/pages/organisations/organisation";
import OrganisationUsers from "@/pages/organisations/organisation-users";
import Organisations from "@/pages/organisations/organisations";
import CreateProblem from "@/pages/problems/create-problem";
import EditProblem from "@/pages/problems/edit-problem";
import Problem from "@/pages/problems/problem";
import CreateProject from "@/pages/projects/create-project";
import EditProjectGroup from "@/pages/projects/edit-project-group";
import Project from "@/pages/projects/project";
import ProjectGroups from "@/pages/projects/project-groups";
import ProjectRoles from "@/pages/projects/project-roles";
import ProjectUsers from "@/pages/projects/project-users";
import Projects from "@/pages/projects/projects";
import SignUp from "@/pages/signup";
import SubmissionResults from "@/pages/submission-results";
import Submissions from "@/pages/submissions";
import CreateMultipleChoice from "@/pages/tasks/create-multiple-choice";
import CreateMultipleResponse from "@/pages/tasks/create-multiple-response";
import CreateProgramming from "@/pages/tasks/create-programming";
import CreateShortAnswer from "@/pages/tasks/create-short-answer";
import EditTask from "@/pages/tasks/edit-task";

import { groupLoader, organisationLoader, problemLoader, projectLoader } from "./loaders";

export const routes = [
  {
    path: "/",
    element: <Layout />,
    errorElement: <Error />,
    children: [
      {
        element: <AuthenticatedPage />,
        children: [
          {
            index: true,
            element: <Navigate to="/projects" />,
          },
          {
            path: "organisations",
            children: [
              { index: true, element: <Organisations /> },
              {
                path: "new",
                element: <CreateOrganisation />,
                handle: {
                  crumb: () => ({
                    label: "New organisation",
                    href: "/organisations/new",
                  }),
                },
              },
              {
                path: ":organisationId",
                children: [
                  {
                    index: true,
                    element: <Organisation />,
                    handle: {
                      crumb: () => ({
                        label: "Projects",
                      }),
                    },
                  },
                  {
                    path: "projects/new",
                    element: <CreateProject />,
                    handle: {
                      crumb: () => ({
                        label: "New project",
                      }),
                    },
                  },
                  {
                    path: "users",
                    element: <OrganisationUsers />,
                    handle: {
                      crumb: () => ({
                        label: "Users",
                      }),
                    },
                  },
                ],
                loader: organisationLoader,
                handle: {
                  crumb: (match: UIMatch<OrganisationPublicWithProjects>) => ({
                    label: match.data.name,
                    href: `/organisations/${match.data.id}`,
                  }),
                },
              },
            ],
            // handle: {
            //   crumb: () => ({ label: "Organisations", href: "/organisations" }),
            // },
          },
          {
            path: "projects",
            children: [
              { index: true, element: <Projects /> },
              {
                path: ":projectId",
                handle: {
                  crumb: (match: UIMatch<ProjectPublicWithProblems>) => {
                    return {
                      label: match.data.name,
                      href: "/projects/" + match.data.id,
                    };
                  },
                },
                loader: projectLoader,
                children: [
                  {
                    index: true,
                    element: <Project />,
                    handle: {
                      crumb: () => ({ label: "Problems" }),
                    },
                  },
                  {
                    path: "roles",
                    element: <ProjectRoles />,
                    handle: {
                      crumb: () => ({ label: "Roles" }),
                    },
                  },
                  {
                    path: "users",
                    element: <ProjectUsers />,
                    handle: {
                      crumb: () => ({ label: "Users" }),
                    },
                  },
                  {
                    path: "groups",
                    handle: {
                      crumb: (match: UIMatch) => ({
                        label: "Groups",
                        href: `/projects/${match.params.projectId}/groups`,
                      }),
                    },
                    children: [
                      { index: true, element: <ProjectGroups /> },
                      {
                        path: ":groupId",
                        element: <EditProjectGroup />,
                        loader: groupLoader,
                        handle: {
                          crumb: (match: UIMatch<GroupPublic>) => {
                            return {
                              label: match.data.name,
                              href: `/projects/${match.params.projectId}/groups/${match.params.groupId}`,
                            };
                          },
                        },
                      },
                    ],
                  },
                  {
                    path: "submissions",
                    handle: {
                      crumb: (match: UIMatch) => ({
                        label: "Submissions",
                        href: `/projects/${match.params.projectId}/submissions`,
                      }),
                    },
                    children: [
                      {
                        index: true,
                        element: <Submissions />,
                      },
                      {
                        path: ":id",
                        element: <SubmissionResults />,
                        handle: {
                          crumb: (match: UIMatch) => ({
                            label: match.params.id,
                          }),
                        },
                      },
                    ],
                  },
                  {
                    path: "problems",
                    loader: problemLoader,
                    handle: {
                      crumb: (match: UIMatch<ProblemType>) => {
                        return {
                          label: match.data.name,
                          href: `/projects/${match.params.projectId}/problems/${match.params.problemId}`,
                        };
                      },
                    },
                    children: [
                      { path: "new", element: <CreateProblem /> },
                      {
                        path: ":problemId",
                        children: [
                          { index: true, element: <Problem /> },
                          {
                            path: "edit",

                            handle: {
                              crumb: (match: UIMatch) => ({
                                label: "Edit",
                                href: `/projects/${match.params.projectId}/problems/${match.params.problemId}/edit`,
                              }),
                            },
                            children: [
                              {
                                index: true,
                                element: <EditProblem />,
                              },
                              {
                                path: "tasks/:taskId",
                                element: <EditTask />,
                                loader: problemLoader,
                                handle: {
                                  crumb: (match: UIMatch<ProblemType>) => ({
                                    label: `Task ${
                                      (match.data.tasks.find((task) => task.id === Number(match.params.taskId))
                                        ?.order_index ?? 0) + 1
                                    }`,
                                    href: `/projects/${match.params.projectId}/problems/${match.params.problemId}/edit`,
                                  }),
                                },
                              },
                              {
                                path: "tasks/new",
                                children: [
                                  {
                                    path: "multiple-choice",
                                    element: <CreateMultipleChoice />,
                                    handle: {
                                      crumb: () => ({
                                        label: "New Multiple Choice Task",
                                      }),
                                    },
                                  },
                                  {
                                    path: "multiple-response",
                                    element: <CreateMultipleResponse />,
                                    handle: {
                                      crumb: () => ({
                                        label: "New Multiple Response Task",
                                      }),
                                    },
                                  },
                                  {
                                    path: "short-answer",
                                    element: <CreateShortAnswer />,
                                    handle: {
                                      crumb: () => ({
                                        label: "New Short Answer Task",
                                      }),
                                    },
                                  },
                                  {
                                    path: "programming",
                                    element: <CreateProgramming />,
                                    handle: {
                                      crumb: () => ({
                                        label: "New Programming Task",
                                      }),
                                    },
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            path: "submissions/new",
                            element: <CreateSubmission />,
                            handle: {
                              crumb: () => ({ label: "New Submission" }),
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: "login", element: <Login /> },
      { path: "signup", element: <SignUp /> },
    ],
  },
];
