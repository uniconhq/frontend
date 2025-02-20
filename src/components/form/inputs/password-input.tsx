import { EyeClosedIcon, EyeIcon } from "lucide-react";
import { forwardRef, useState } from "react";

import { Box } from "@/components/ui/box";
import { Input, InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PasswordInputOnlyProps {
  showForgetPassword?: boolean;
  helperText?: string;
}

interface PasswordInputProps extends InputProps, PasswordInputOnlyProps {}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ helperText, className, ...props }, ref) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);
  return (
    <Box className="flex flex-col gap-5">
      <div className="group relative">
        <Input
          className={cn("hide-password-toggle peer pr-10", className)}
          ref={ref}
          type={isPasswordVisible ? "text" : "password"}
          {...props}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 hidden items-center p-3 group-focus-within:flex"
          onClick={() => setIsPasswordVisible(!isPasswordVisible)}
        >
          {isPasswordVisible ? <EyeClosedIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
        </button>
      </div>
      {helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </Box>
  );
});

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
