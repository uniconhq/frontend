type OwnProps = {
  content: string;
};

const TaskSectionHeader: React.FC<OwnProps> = ({ content }) => {
  return <span className="font-medium text-zinc-400">{content}</span>;
};

export default TaskSectionHeader;
