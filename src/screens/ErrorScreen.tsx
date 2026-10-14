import { useRouteError } from "react-router";
import { useInstance } from "../instance/instance-context";
import { Button } from "../ui/Button";
import { CenteredMessage } from "../ui/CenteredMessage";

export function ErrorScreen() {
  const error = useRouteError();
  const { instance, disconnect } = useInstance();

  return (
    <CenteredMessage title="Something went wrong">
      <p>{error instanceof Error ? error.message : "The app hit an unexpected error."}</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
      {instance && (
        <Button variant="secondary" onClick={disconnect}>
          Disconnect this device
        </Button>
      )}
    </CenteredMessage>
  );
}
