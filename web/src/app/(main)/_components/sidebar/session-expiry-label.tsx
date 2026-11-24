import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { auth } from "@/lib/auth";

export function SessionExpiryLabel() {
  const expiry = auth.getSessionExpiry();
  if (!expiry) return null;

  return (
    <DropdownMenuLabel className="grid gap-0.5">
      <span>Sign-in expiry</span>
      <time className="text-foreground" dateTime={expiry.toISOString()}>
        {expiry.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })}
      </time>
    </DropdownMenuLabel>
  );
}
