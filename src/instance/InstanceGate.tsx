import { skipToken, useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router";
import { Button } from "../ui/Button";
import { CenteredMessage } from "../ui/CenteredMessage";
import { useInstance } from "./instance-context";

export function InstanceGate() {
  const { instance, supabase } = useInstance();
  const schemaVersion = useQuery({
    queryKey: ["schema-version", instance?.supabaseUrl],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: supabase
      ? async () => {
          const { data, error } = await supabase.rpc("schema_version");
          if (error) throw error;
          return data;
        }
      : skipToken,
  });

  if (!instance) {
    return (
      <CenteredMessage title="Welcome">
        To get started, scan the invite QR code from the person who runs your family's budget, or
        open the link they sent you.
      </CenteredMessage>
    );
  }
  if (schemaVersion.isPending) return null;
  if (schemaVersion.isError) {
    return (
      <CenteredMessage title="Can't reach your budget">
        <p>Check your connection and try again.</p>
        <Button onClick={() => void schemaVersion.refetch()}>Try again</Button>
      </CenteredMessage>
    );
  }
  if (schemaVersion.data < __SCHEMA_VERSION__) {
    return (
      <CenteredMessage title="Your budget needs an update">
        This version of the app expects a newer database. Ask the person who runs your family's
        budget to update it.
      </CenteredMessage>
    );
  }
  return <Outlet />;
}
