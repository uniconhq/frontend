import { OutputStep, Status, Testcase, TestcaseResult as TestcaseResultType } from "@/api";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import SocketResultTable from "./table/socket-result-table";

type OwnProps = {
  index: number;
  result: TestcaseResultType;
  testcase: Testcase;
  hideDetails?: boolean;
};

const getTestcaseResultBadge = (status: Status) => {
  switch (status) {
    case "OK":
      return <Badge className="bg-green-300 hover:bg-green-300">OK</Badge>;
    case "WA":
      return <Badge className="bg-red-300 hover:bg-red-300">WA</Badge>;
    case "TLE":
      return <Badge className="bg-red-300 hover:bg-red-300">TLE</Badge>;
    case "MLE":
      return <Badge className="bg-red-300 hover:bg-red-300">MLE</Badge>;
    case "RTE":
      return <Badge className="bg-red-300 hover:bg-red-300">RTE</Badge>;
  }
};

const TestcaseResult: React.FC<OwnProps> = ({ result, index, testcase, hideDetails = false }) => {
  const outputStep = testcase.nodes.filter((node) => node.type == "OUTPUT_STEP")[0] as OutputStep;

  const combinedResults = result.results?.map((socketResult) => {
    const testcaseSocketMetadata = outputStep.inputs.filter((input) => input.id === socketResult.id);
    return {
      ...socketResult,
      value: socketResult.value,
      socketMetadata: testcaseSocketMetadata[0],
      testcase,
    };
  });

  return (
    <div>
      <div className={cn("flex gap-4")}>
        <span>Testcase {index + 1}</span>
        {getTestcaseResultBadge(result.status)}
      </div>
      {!hideDetails && (
        <Accordion type="multiple" className="mt-2" defaultValue={[`result-${index}`]}>
          {/* TODO: hide stdout/stderr for unpriviledged users */}

          <AccordionItem value={`stderr-${index}`}>
            <AccordionTrigger>stderr</AccordionTrigger>
            <AccordionContent>
              <pre>{result.stderr}</pre>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value={`stdout-${index}`}>
            <AccordionTrigger>stdout</AccordionTrigger>
            <AccordionContent>
              <pre>{result.stdout}</pre>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value={`result-${index}`}>
            <AccordionTrigger>output</AccordionTrigger>
            <AccordionContent>
              <SocketResultTable data={combinedResults || []} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {hideDetails && (
        <div className="mt-2">
          <SocketResultTable data={combinedResults || []} />
        </div>
      )}
    </div>
  );
};

export default TestcaseResult;
