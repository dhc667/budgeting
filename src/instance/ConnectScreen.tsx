import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useSignOut } from "../sync/sign-out";
import { Button } from "../ui/Button";
import { CenteredMessage } from "../ui/CenteredMessage";
import { type ConnectRequest, type Instance, parseConnectParams } from "./connect-link";
import { useInstance } from "./instance-context";

export function ConnectScreen() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const request = useMemo(() => parseConnectParams(params), [params]);
  const { instance } = useInstance();

  if (!request) {
    return (
      <CenteredMessage title={t("connect.incomplete.title")}>
        {t("connect.incomplete.body")}
      </CenteredMessage>
    );
  }
  if (instance && instance.supabaseUrl !== request.instance.supabaseUrl) {
    return <ConfirmSwitch current={instance} request={request} />;
  }
  return <Connect request={request} />;
}

function Connect({ request }: { request: ConnectRequest }) {
  const { connect } = useInstance();
  const navigate = useNavigate();

  useEffect(() => {
    connect(request.instance);
    if (request.inviteCode) {
      void navigate("/sign-up", { replace: true, state: { inviteCode: request.inviteCode } });
    } else {
      void navigate("/sign-in", { replace: true });
    }
  }, [request, connect, navigate]);

  return null;
}

// Once connected to the new instance, ConnectScreen renders Connect, which carries on to sign-in.
function ConfirmSwitch({ current, request }: { current: Instance; request: ConnectRequest }) {
  const { t } = useTranslation();
  const { connect } = useInstance();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const switchInstance = useMutation({
    async mutationFn() {
      await signOut();
      connect(request.instance);
    },
  });

  return (
    <CenteredMessage title={t("connect.switch.title")}>
      <p>
        {t("connect.switch.body", { current: hostOf(current), next: hostOf(request.instance) })}
      </p>
      <p>{t("connect.switch.trust")}</p>
      <Button onClick={() => switchInstance.mutate()} disabled={switchInstance.isPending}>
        {t("connect.switch.confirm")}
      </Button>
      <Button variant="secondary" onClick={() => void navigate("/", { replace: true })}>
        {t("connect.switch.stay", { host: hostOf(current) })}
      </Button>
    </CenteredMessage>
  );
}

function hostOf(instance: Instance): string {
  return new URL(instance.supabaseUrl).host;
}
