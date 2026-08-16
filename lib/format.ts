// Junta uma lista em texto pt-BR: "A", "A e B", "A, B e C".
export function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
