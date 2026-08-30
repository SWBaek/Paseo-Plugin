import type { PluginClientContext } from "@getpaseo/plugin";
import { createCompactConfirmationController } from "./compact-confirmation";
import { createCompactPill } from "./compact-pill.client";
import { registerCompactPills } from "./compact-registration";

export function contributeClient(client: PluginClientContext) {
  const confirmation = createCompactConfirmationController();
  const removePills = registerCompactPills(
    client,
    createCompactPill(confirmation),
    confirmation.request,
  );

  return () => {
    removePills();
    confirmation.dispose();
  };
}
