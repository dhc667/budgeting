import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router/dom";
import { InstanceProvider } from "./instance/InstanceProvider";
import { createAppRouter } from "./router";

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  const [router] = useState(createAppRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <InstanceProvider>
        <RouterProvider router={router} />
      </InstanceProvider>
    </QueryClientProvider>
  );
}
