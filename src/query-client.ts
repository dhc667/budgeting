import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
}

// Unlike callbacks passed to mutate, this runs even when the mutation removed the component that
// started it, as deleting what a screen shows does. A failure shows through the mutation's error.
export function afterSuccess(mutation: Promise<unknown>, then: () => unknown) {
  mutation.then(then, () => undefined);
}
