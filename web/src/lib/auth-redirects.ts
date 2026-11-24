const TASK_DETAIL_PATH = "/function/tasks/detail";
const MAX_TASK_ID = "9223372036854775807";

function reportReturnPath(destination: string): string | null {
  const queryStart = destination.indexOf("?");
  if (queryStart < 0 || destination.includes("#")) return null;

  // Match the local path before parsing so URL normalization cannot widen the allowlist.
  const pathname = destination.slice(0, queryStart);
  if (pathname !== TASK_DETAIL_PATH && pathname !== `${TASK_DETAIL_PATH}/`) return null;

  const query = destination.slice(queryStart + 1);
  if (query.includes("?") || query.split("&").length !== 2) return null;
  const params = new URLSearchParams(query);
  const id = params.get("id");
  if (!id || params.get("tab") !== "report") return null;
  if (id[0] === "0" || /[^0-9]/.test(id) || id.length > MAX_TASK_ID.length) return null;
  if (id.length === MAX_TASK_ID.length && id > MAX_TASK_ID) return null;

  return `${pathname}?id=${id}&tab=report`;
}

export function getLoginPath(destination: string): string {
  const returnTo = reportReturnPath(destination);
  return returnTo ? `/login?${new URLSearchParams({ returnTo })}` : "/login";
}

export function getLoginDestination(search: string): string {
  const params = new URLSearchParams(search);
  const returnTo = params.get("returnTo");
  if (!returnTo || Array.from(params.keys()).length !== 1) return "/function/tasks";
  return reportReturnPath(returnTo) ?? "/function/tasks";
}
