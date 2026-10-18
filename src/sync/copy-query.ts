import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { LocalCopy } from "./copy";
import { copyQueryKey, useLocalCopy, useRequestPull } from "./local-copy-context";

// Pending while there is no copy. The result is worked out from the copy during the render that
// first sees it, so a screen never shows the previous copy's result once it has the new one.
export function useCopyQuery<Result>(
  key: readonly unknown[],
  read: (copy: LocalCopy) => Result,
): UseQueryResult<Result> {
  const copy = useLocalCopy();
  return useQuery({
    queryKey: copyQueryKey(...key, copy && generationOf(copy)),
    enabled: copy !== null,
    staleTime: Number.POSITIVE_INFINITY,
    initialData: () => (copy ? read(copy) : undefined),
    queryFn() {
      if (!copy) throw new Error("A query on the local copy ran before the copy was loaded");
      return read(copy);
    },
  });
}

export function useCopyMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const requestPull = useRequestPull();
  return useMutation({
    mutationFn,
    async onSuccess() {
      await requestPull();
    },
  });
}

// A pull can change rows without moving the version, so the version can't tell copies apart.
function generationOf(copy: LocalCopy): number {
  const known = generations.get(copy);
  if (known !== undefined) return known;
  generations.set(copy, nextGeneration);
  return nextGeneration++;
}

const generations = new WeakMap<LocalCopy, number>();
let nextGeneration = 1;
