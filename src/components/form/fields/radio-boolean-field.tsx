import { useFormContext } from "react-hook-form";

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface RadioBooleanField {
  name: string;
  label?: string;
  description?: string;
  trueLabel: string;
  falseLabel: string;
}

function RadioBooleanField({ name, label, description, trueLabel, falseLabel }: RadioBooleanField) {
  const { control, setValue, getValues } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          {label && <FormLabel className="!text-current">{label}</FormLabel>}
          <FormControl>
            <RadioGroup
              value={getValues(name) ? "true" : "false"}
              onValueChange={(value) => setValue(name, value === "true")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="true" id="true" />
                <Label htmlFor="true">{trueLabel}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="false" id="false" />
                <Label htmlFor="false">{falseLabel}</Label>
              </div>
            </RadioGroup>
          </FormControl>
          <FormMessage />
          {description && <FormDescription>{description}</FormDescription>}
        </FormItem>
      )}
    />
  );
}

export default RadioBooleanField;
