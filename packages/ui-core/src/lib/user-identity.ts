export function formatUserIdentity(name: string, email: string): string {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim();

  if (normalizedName && normalizedEmail && normalizedName !== normalizedEmail) {
    return `${normalizedName} (${normalizedEmail})`;
  }

  return normalizedName || normalizedEmail || "Unknown user";
}
