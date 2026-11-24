// Match the new-password limits in server/auth.go.
const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_BYTES = 72;

export const NEW_PASSWORD_REQUIREMENTS = `Use at least ${MIN_PASSWORD_CHARACTERS} characters and at most ${MAX_PASSWORD_BYTES} UTF-8 bytes.`;

function getLengthIssue(password: string): string {
  if (!password) return "";
  if ([...password].length < MIN_PASSWORD_CHARACTERS) return "New password is too short.";
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return "New password is too long.";
  return "";
}

export function getNewPasswordFeedback(password: string, confirmation: string) {
  const lengthIssue = getLengthIssue(password);
  const hasConfirmation = confirmation !== "";
  const matches = hasConfirmation && confirmation === password;

  return {
    isValid: matches && !lengthIssue,
    lengthInvalid: Boolean(lengthIssue),
    confirmationMismatch: hasConfirmation && !matches,
    lengthMessage: password ? lengthIssue || "Length requirements met." : "",
    confirmationMessage: confirmation && (matches ? "Passwords match." : "Passwords do not match."),
  };
}
