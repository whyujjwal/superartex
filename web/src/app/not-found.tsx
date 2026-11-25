import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <h1 className="font-semibold text-2xl">Page not found</h1>
      <p className="text-muted-foreground">Check the address or return to the task list.</p>
      <Link className={buttonVariants({ variant: "outline" })} prefetch={false} replace href="/function/tasks">
        Go to tasks
      </Link>
    </main>
  );
}
