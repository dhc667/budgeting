import { createHashRouter } from "react-router";
import { RequireSession, SessionGate } from "./auth/SessionGate";
import { SignInScreen } from "./auth/SignInScreen";
import { SignUpScreen } from "./auth/SignUpScreen";
import { DashboardScreen } from "./dashboard/DashboardScreen";
import { ConnectScreen } from "./instance/ConnectScreen";
import { InstanceGate } from "./instance/InstanceGate";
import { connectPath } from "./instance/connect-link";
import { AppShell } from "./layout/AppShell";
import { ProfileScreen } from "./profile/ProfileScreen";
import { ComingSoonScreen } from "./screens/ComingSoonScreen";
import { ErrorScreen } from "./screens/ErrorScreen";

// Hash routing: GitHub Pages can't rewrite deep links to index.html.
export function createAppRouter() {
  return createHashRouter([
    {
      errorElement: <ErrorScreen />,
      children: [
        { path: connectPath, element: <ConnectScreen /> },
        {
          element: <InstanceGate />,
          children: [
            {
              element: <SessionGate />,
              children: [
                { path: "/sign-in", element: <SignInScreen /> },
                { path: "/sign-up", element: <SignUpScreen /> },
                {
                  element: <RequireSession />,
                  children: [
                    {
                      element: <AppShell />,
                      children: [
                        { index: true, element: <DashboardScreen /> },
                        {
                          path: "transactions",
                          element: <ComingSoonScreen title={(t) => t("nav.transactions")} />,
                        },
                        {
                          path: "budgets",
                          element: <ComingSoonScreen title={(t) => t("nav.budgets")} />,
                        },
                        {
                          path: "reports",
                          element: <ComingSoonScreen title={(t) => t("nav.reports")} />,
                        },
                        { path: "profile", element: <ProfileScreen /> },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
}
