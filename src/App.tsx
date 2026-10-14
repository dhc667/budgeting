import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router/dom";
import { InstanceProvider } from "./instance/InstanceProvider";
import { createQueryClient } from "./query-client";
import { createAppRouter } from "./router";

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <InstanceProvider>
        <RouterProvider router={router} />
      </InstanceProvider>
    </QueryClientProvider>
  );
}
