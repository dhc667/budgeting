export type NonEmpty<Item> = [Item, ...Item[]];

export function isNonEmpty<Item>(items: Item[]): items is NonEmpty<Item> {
  return items.length > 0;
}
