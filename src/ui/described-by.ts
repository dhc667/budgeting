export function describedBy(...ids: (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined && id !== "");
  return present.length > 0 ? present.join(" ") : undefined;
}
