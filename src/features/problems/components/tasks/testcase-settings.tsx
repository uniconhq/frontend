import { DialogClose } from "@radix-ui/react-dialog";
import { Settings } from "lucide-react";
import { useState } from "react";

import ConfirmationDialog from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OwnProps = {
  settings: { name?: string; isPrivate?: boolean };
  onDelete: () => void;
  onSettingsChange: (change: { name?: string; isPrivate?: boolean }) => void;
};

const TestcaseSettings: React.FC<OwnProps> = ({ onDelete, settings, onSettingsChange }) => {
  const [name, setName] = useState(settings.name ?? "");
  const [isPrivate, setIsPrivate] = useState(!!settings.isPrivate);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" type="button">
          <Settings />
          Testcase Settings
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[425px]"
        onCloseAutoFocus={() => {
          setName(settings.name ?? "");
          setIsPrivate(!!settings.isPrivate);
        }}
      >
        <DialogHeader>
          <DialogTitle>Testcase Settings</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              maxLength={30}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Private?
            </Label>
            <Checkbox
              id="private"
              checked={isPrivate}
              onCheckedChange={() => setIsPrivate((isPrivate) => !isPrivate)}
            />
          </div>
        </div>
        <DialogFooter className="flex sm:justify-between">
          <DialogClose asChild>
            <ConfirmationDialog description="Are you sure you want to delete this testcase?" onConfirm={onDelete}>
              <Button variant="destructive">Delete testcase</Button>
            </ConfirmationDialog>
          </DialogClose>
          <DialogClose asChild>
            <Button
              type="submit"
              onClick={() =>
                onSettingsChange({
                  name,
                  isPrivate,
                })
              }
            >
              Save changes
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TestcaseSettings;
