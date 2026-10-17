import { createHashRouter } from "react-router";
import { AccountHistoryScreen } from "./accounts/AccountHistoryScreen";
import { AccountScreen } from "./accounts/AccountScreen";
import { AccountTransactionsScreen } from "./accounts/AccountTransactionsScreen";
import { NewAccountScreen } from "./accounts/NewAccountScreen";
import { RequireSession, SessionGate } from "./auth/SessionGate";
import { SignInScreen } from "./auth/SignInScreen";
import { SignUpScreen } from "./auth/SignUpScreen";
import { CategoryHistoryScreen } from "./categories/CategoryHistoryScreen";
import { CategoryScreen } from "./categories/CategoryScreen";
import { CategoryTransactionsScreen } from "./categories/CategoryTransactionsScreen";
import { NewCategoryScreen } from "./categories/NewCategoryScreen";
import { DashboardScreen } from "./dashboard/DashboardScreen";
import { ConnectScreen } from "./instance/ConnectScreen";
import { InstanceGate } from "./instance/InstanceGate";
import { connectPath } from "./instance/connect-link";
import { AppShell } from "./layout/AppShell";
import { ProfileScreen } from "./profile/ProfileScreen";
import { ComingSoonScreen } from "./screens/ComingSoonScreen";
import { ErrorScreen } from "./screens/ErrorScreen";
import { NewSpaceScreen } from "./spaces/NewSpaceScreen";
import { SpaceActivityScreen } from "./spaces/SpaceActivityScreen";
import { SpaceScreen } from "./spaces/SpaceScreen";
import { SpacesScreen } from "./spaces/SpacesScreen";
import { NewTransactionScreen } from "./transactions/NewTransactionScreen";
import { TransactionScreen } from "./transactions/TransactionScreen";
import { TransactionsScreen } from "./transactions/TransactionsScreen";

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
                        { path: "transactions", element: <TransactionsScreen /> },
                        { path: "transactions/new", element: <NewTransactionScreen /> },
                        { path: "transactions/:transactionId", element: <TransactionScreen /> },
                        {
                          path: "budgets",
                          element: <ComingSoonScreen title={(t) => t("nav.budgets")} />,
                        },
                        {
                          path: "reports",
                          element: <ComingSoonScreen title={(t) => t("nav.reports")} />,
                        },
                        { path: "profile", element: <ProfileScreen /> },
                        { path: "spaces", element: <SpacesScreen /> },
                        { path: "spaces/new", element: <NewSpaceScreen /> },
                        { path: "spaces/:spaceId", element: <SpaceScreen /> },
                        { path: "spaces/:spaceId/activity", element: <SpaceActivityScreen /> },
                        {
                          path: "spaces/:spaceId/categories/new",
                          element: <NewCategoryScreen />,
                        },
                        { path: "categories/:categoryId", element: <CategoryScreen /> },
                        {
                          path: "categories/:categoryId/transactions",
                          element: <CategoryTransactionsScreen />,
                        },
                        {
                          path: "categories/:categoryId/history",
                          element: <CategoryHistoryScreen />,
                        },
                        { path: "accounts/new", element: <NewAccountScreen /> },
                        { path: "accounts/:accountId", element: <AccountScreen /> },
                        {
                          path: "accounts/:accountId/transactions",
                          element: <AccountTransactionsScreen />,
                        },
                        { path: "accounts/:accountId/history", element: <AccountHistoryScreen /> },
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
