import { skipToken, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import { Button } from "../ui/Button";
import { CenteredMessage } from "../ui/CenteredMessage";
import { useInstance } from "./instance-context";

export function InstanceGate() {
  const { t } = useTranslation();
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
      <CenteredMessage title={t("instance.welcome.title")}>
        {t("instance.welcome.body")}
      </CenteredMessage>
    );
  }
  if (schemaVersion.isPending) return null;
  if (schemaVersion.isError) {
    return (
      <CenteredMessage title={t("instance.unreachable.title")}>
        <p>{t("instance.unreachable.body")}</p>
        <Button onClick={() => void schemaVersion.refetch()}>
          {t("instance.unreachable.retry")}
        </Button>
      </CenteredMessage>
    );
  }
  if (schemaVersion.data < __SCHEMA_VERSION__) {
    return (
      <CenteredMessage title={t("instance.outdated.title")}>
        {t("instance.outdated.body")}
      </CenteredMessage>
    );
  }
  return <Outlet />;
}
