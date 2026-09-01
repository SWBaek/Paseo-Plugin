import type { PluginClientContext } from "@getpaseo/plugin";
import { createSkillsModalController } from "./skills-modal";
import { createSkillsPill } from "./skills-pill.client";
import { registerSkillsPills } from "./skills-registration";

export function contributeClient(client: PluginClientContext) {
  const modal = createSkillsModalController();
  const removePills = registerSkillsPills(
    client,
    createSkillsPill(modal),
    modal.request,
  );

  return () => {
    removePills();
    modal.dispose();
  };
}
