import { Link } from "react-router-dom";

import { useProjectId } from "../../hooks/use-id";

type OwnProps = {
  submissionId: number;
};

const ViewResultButton = ({ submissionId }: OwnProps) => {
  const projectId = useProjectId();
  return (
    <Link to={`/projects/${projectId}/submissions/${submissionId}`} className="hover:text-purple-300 hover:underline">
      View results
    </Link>
  );
};

export default ViewResultButton;
