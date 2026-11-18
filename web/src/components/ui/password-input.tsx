import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "id" | "type"> & {
  id: string;
  passwordLabel?: string;
};

export function PasswordInput({ className, disabled, id, passwordLabel = "password", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cn("pr-9 [&::-ms-reveal]:hidden", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute inset-y-0 right-0.5 my-auto text-muted-foreground"
        aria-controls={id}
        aria-label={visible ? `Hide ${passwordLabel}` : `Show ${passwordLabel}`}
        disabled={disabled}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
