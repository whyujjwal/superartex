import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "id" | "type"> & {
  id: string;
  passwordLabel?: string;
};

export function PasswordInput({
  className,
  disabled,
  id,
  passwordLabel = "password",
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  return (
    <div>
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
          onKeyDown={(event) => {
            setCapsLock(event.getModifierState("CapsLock"));
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            setCapsLock(event.getModifierState("CapsLock"));
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
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
      <p role="status" className={cn("text-muted-foreground text-xs", capsLock && "mt-1")}>
        {capsLock ? "Caps Lock is on" : ""}
      </p>
    </div>
  );
}
