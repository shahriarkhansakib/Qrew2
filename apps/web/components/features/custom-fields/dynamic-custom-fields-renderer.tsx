"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CustomFieldDefinition = {
  id: string;
  fieldKey: string;
  fieldName: string;
  fieldType: "text" | "number" | "date" | "boolean" | "single_select" | "multi_select";
  isRequired: boolean;
  options: string[] | null;
};

interface Props {
  control: any;
  definitions: CustomFieldDefinition[];
  basePath: string; // e.g. "customFields"
  errors?: Record<string, any>;
}

export function DynamicCustomFieldsRenderer({
  control,
  definitions,
  basePath,
  errors = {},
}: Props) {
  if (!definitions || definitions.length === 0) return null;

  return (
    <div className="space-y-4">
      {definitions.map((def) => {
        const fieldNamePath = `${basePath}.${def.fieldKey}`;
        const hasError = !!errors[def.fieldKey];
        const errorMessage = errors[def.fieldKey]?.message;

        return (
          <div key={def.id} className="space-y-2">
            <Label className={hasError ? "text-destructive" : ""}>
              {def.fieldName} {def.isRequired && "*"}
            </Label>
            <Controller
              control={control}
              name={fieldNamePath}
              render={({ field }) => {
                switch (def.fieldType) {
                  case "text":
                    return (
                      <Input
                        placeholder={`Enter ${def.fieldName}`}
                        {...field}
                        value={field.value || ""}
                      />
                    );

                  case "number":
                    return (
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) =>
                          field.onChange(e.target.value ? Number(e.target.value) : undefined)
                        }
                      />
                    );

                  case "boolean":
                    return (
                      <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <Checkbox checked={field.value || false} onCheckedChange={field.onChange} />
                        <div className="space-y-1 leading-none">
                          <Label
                            className="cursor-pointer"
                            onClick={() => field.onChange(!field.value)}
                          >
                            {def.fieldName}
                          </Label>
                        </div>
                      </div>
                    );

                  case "date":
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(new Date(field.value), "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) =>
                              field.onChange(date ? date.toISOString() : undefined)
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    );

                  case "single_select":
                    return (
                      <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${def.fieldName}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {def.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );

                  case "multi_select":
                    // A simple multi-select fallback using a regular select for now if a custom one isn't built
                    // Ideally you'd use a MultiSelect component here.
                    return (
                      <Select
                        onValueChange={(val) => {
                          const current = Array.isArray(field.value) ? field.value : [];
                          if (!current.includes(val)) {
                            field.onChange([...current, val]);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Add ${def.fieldName}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {def.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );

                  default:
                    return <Input {...field} value={field.value || ""} />;
                }
              }}
            />

            {/* Multi-select badges display */}
            {def.fieldType === "multi_select" && (
              <Controller
                control={control}
                name={fieldNamePath}
                render={({ field }) => {
                  const items = Array.isArray(field.value) ? field.value : [];
                  if (items.length === 0) return <></>;
                  return (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {items.map((item: string) => (
                        <div
                          key={item}
                          className="bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-md flex items-center gap-1"
                        >
                          {item}
                          <button
                            type="button"
                            className="hover:text-destructive text-muted-foreground ml-1"
                            onClick={() => field.onChange(items.filter((i: string) => i !== item))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
            )}
            {hasError && (
              <p className="text-[0.8rem] font-medium text-destructive">{errorMessage}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
