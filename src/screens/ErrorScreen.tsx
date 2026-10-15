import { useTranslation } from "react-i18next";
import { useRouteError } from "react-router";
import { useInstance } from "../instance/instance-context";
import { Button } from "../ui/Button";
import { CenteredMessage } from "../ui/CenteredMessage";

export function ErrorScreen() {
  const { t } = useTranslation();
  const error = useRouteError();
  const { instance, disconnect } = useInstance();

  return (
    <CenteredMessage title={t("error.title")}>
      <p>{error instanceof Error ? error.message : t("error.unexpected")}</p>
      <Button onClick={() => window.location.reload()}>{t("error.reload")}</Button>
      {instance && (
        <Button variant="secondary" onClick={disconnect}>
          {t("error.disconnect")}
        </Button>
      )}
    </CenteredMessage>
  );
}
