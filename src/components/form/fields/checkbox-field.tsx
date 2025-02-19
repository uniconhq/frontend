import { useFormContext } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
interface CheckboxFieldProps {
  name: string;
  label?: string;
  description?: string;
  className?: string;
}

function CheckboxField({ name, label, description, className }: CheckboxFieldProps) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <div className="justify-left flex w-fit items-center gap-x-2">
            <FormControl>
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
              />
            </FormControl>
            {label && <FormLabel className="!text-current">{label}</FormLabel>}
          </div>
          <FormMessage />
          {description && <FormDescription>{description}</FormDescription>}
        </FormItem>
      )}
    />
  );
}

export default CheckboxField;
