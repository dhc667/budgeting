import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { signOutHere } from "../supabase/client";
import { Button } from "../ui/Button";
import { CenteredMessage } from "../ui/CenteredMessage";
import { type ConnectRequest, type Instance, parseConnectParams } from "./connect-link";
import { useInstance } from "./instance-context";

export function ConnectScreen() {
  const [params] = useSearchParams();
  const request = useMemo(() => parseConnectParams(params), [params]);
  const { instance } = useInstance();

  if (!request) {
    return (
      <CenteredMessage title="This link is incomplete">
        Scan the QR code again, or ask whoever invited you for a new one.
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
  const { supabase, connect } = useInstance();
  const navigate = useNavigate();
  const switchInstance = useMutation({
    async mutationFn() {
      if (supabase) await signOutHere(supabase);
      connect(request.instance);
    },
  });

  return (
    <CenteredMessage title="Switch to a different budget?">
      <p>
        This device is connected to {hostOf(current)}. The link you opened would connect it to{" "}
        {hostOf(request.instance)} instead, and sign you out here.
      </p>
      <p>Only switch if you trust whoever sent you the link.</p>
      <Button onClick={() => switchInstance.mutate()} disabled={switchInstance.isPending}>
        Switch
      </Button>
      <Button variant="secondary" onClick={() => void navigate("/", { replace: true })}>
        Stay connected to {hostOf(current)}
      </Button>
    </CenteredMessage>
  );
}

function hostOf(instance: Instance): string {
  return new URL(instance.supabaseUrl).host;
}
