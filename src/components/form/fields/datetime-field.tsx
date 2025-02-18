// Referenced from: https://time.rdsx.dev/
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  name: string;
  label?: string;
  description?: string;
  className?: string;
}

export function DateTimeField({ name, label, description }: DateFieldProps) {
  const { control, setValue, getValues } = useFormContext();
  function handleDateSelect(date: Date | undefined) {
    if (date) {
      setValue(name, date);
    }
  }

  function handleTimeChange(type: "hour" | "minute" | "ampm", value: string) {
    const currentDate = getValues(name) || new Date();
    const newDate = new Date(currentDate);

    if (type === "hour") {
      const hour = parseInt(value, 10);
      newDate.setHours(newDate.getHours() >= 12 ? hour + 12 : hour);
    } else if (type === "minute") {
      newDate.setMinutes(parseInt(value, 10));
    } else if (type === "ampm") {
      const hours = newDate.getHours();
      if (value === "AM" && hours >= 12) {
        newDate.setHours(hours - 12);
      } else if (value === "PM" && hours < 12) {
        newDate.setHours(hours + 12);
      }
    }
    setValue(name, newDate);
  }
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          {label && <FormLabel className="!text-current">{label}</FormLabel>}
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !field.value && "text-muted-foreground",
                  )}
                >
                  {field.value ? (
                    format(field.value, "dd/MM/yyyy hh:mm aa")
                  ) : (
                    <span>DD/MM/YYYY hh:mm aa</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <div className="sm:flex">
                <Calendar
                  mode="single"
                  selected={field.value ? new Date(field.value) : undefined}
                  onSelect={handleDateSelect}
                  defaultMonth={
                    field.value ? new Date(field.value) : new Date()
                  }
                  initialFocus
                />
                <div className="flex flex-col divide-y sm:h-[300px] sm:flex-row sm:divide-x sm:divide-y-0">
                  <ScrollArea className="w-64 sm:w-auto">
                    <div className="flex p-2 sm:flex-col">
                      {Array.from({ length: 12 }, (_, i) => i + 1)
                        .reverse()
                        .map((hour) => (
                          <Button
                            key={hour}
                            size="icon"
                            variant={
                              field.value &&
                              new Date(field.value).getHours() % 12 ===
                                hour % 12
                                ? "default"
                                : "ghost"
                            }
                            className="aspect-square shrink-0 sm:w-full"
                            onClick={() =>
                              handleTimeChange("hour", hour.toString())
                            }
                          >
                            {hour}
                          </Button>
                        ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="sm:hidden" />
                  </ScrollArea>
                  <ScrollArea className="w-64 sm:w-auto">
                    <div className="flex p-2 sm:flex-col">
                      {Array.from({ length: 12 }, (_, i) => i * 5)
                        .concat([59])
                        .map((minute) => (
                          <Button
                            key={minute}
                            size="icon"
                            variant={
                              field.value &&
                              new Date(field.value).getMinutes() === minute
                                ? "default"
                                : "ghost"
                            }
                            className="aspect-square shrink-0 sm:w-full"
                            onClick={() =>
                              handleTimeChange("minute", minute.toString())
                            }
                          >
                            {minute.toString().padStart(2, "0")}
                          </Button>
                        ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="sm:hidden" />
                  </ScrollArea>
                  <ScrollArea className="">
                    <div className="flex p-2 sm:flex-col">
                      {["AM", "PM"].map((ampm) => (
                        <Button
                          key={ampm}
                          size="icon"
                          variant={
                            field.value &&
                            ((ampm === "AM" &&
                              new Date(field.value).getHours() < 12) ||
                              (ampm === "PM" &&
                                new Date(field.value).getHours() >= 12))
                              ? "default"
                              : "ghost"
                          }
                          className="aspect-square shrink-0 sm:w-full"
                          onClick={() => handleTimeChange("ampm", ampm)}
                        >
                          {ampm}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <FormDescription>
            {description && <FormDescription>{description}</FormDescription>}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
