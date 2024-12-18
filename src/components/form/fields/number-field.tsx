import { useFormContext } from "react-hook-form";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface NumberFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  description?: string;
  className?: string;
}

function NumberField({
  name,
  label,
  placeholder,
  description,
  className,
}: NumberFieldProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel className="!text-current">{label}</FormLabel>}
          <FormControl>
            <Input
              type="number"
              placeholder={placeholder}
              {...field}
              className={className}
            />
          </FormControl>
          <FormMessage />
          {description && <FormDescription>{description}</FormDescription>}
        </FormItem>
      )}
    />
  );
}

export default NumberField;
