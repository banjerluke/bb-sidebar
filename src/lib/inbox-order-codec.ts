export function decodeInboxOrder(input: unknown): readonly string[] | null {
  return Array.isArray(input) && input.every((id) => typeof id === "string") ? [...new Set(input)] : null;
}
