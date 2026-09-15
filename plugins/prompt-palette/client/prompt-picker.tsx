import { type PluginButtonContentProps, usePaseo, useSettings, useAgent } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { promptSettings, type Prompt } from "../shared/prompt-settings";
import type { PromptSender } from "./prompt-send";
import { Action, PromptRow } from "./prompt-ui";

export function PromptPickerContent(props: PluginButtonContentProps & {
  sender: PromptSender; close(): void; openSettings(): void;
}) {
  if (props.context !== "agent") return null;
  return <PromptPicker {...props} />;
}

function PromptPicker({ theme, layout, host, agentId, workspaceId, sender, close, openSettings }: PluginButtonContentProps & { context: "agent"; agentId: string; workspaceId: string } & {
  sender: PromptSender; openSettings(): void;
}) {
  const settings = useSettings(promptSettings);
  const { height: windowHeight } = useWindowDimensions();
  const paseo = usePaseo();
  const agent = useAgent(agentId, value => ({ title: value.title, workspaceId: value.workspaceId }));
  const [selected, setSelected] = useState<Prompt | null>(null);
  const pending = useSyncExternalStore(sender.subscribe, sender.snapshot, sender.snapshot);
  const [error, setError] = useState<string | null>(sender.uncertain ? "Delivery is uncertain. Check the conversation before sending again." : null);
  const [reloading, setReloading] = useState(true);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void settings.reload().catch(() => { if (alive.current) setError("Could not refresh prompts."); })
      .finally(() => { if (alive.current) setReloading(false); });
    return () => { alive.current = false; };
  }, []);
  const unavailable = !agent || agent.workspaceId !== workspaceId;
  async function send() {
    if (!selected || pending || sender.pending || sender.uncertain || unavailable) return;
    const body = selected.body;
    setError(null);
    const handle = paseo.agents.ref(agentId);
    const result = await sender.send(async () => {
      const latest = await handle.refresh();
      return alive.current && !!latest && !latest.agent.archivedAt && latest.agent.workspaceId === workspaceId;
    }, () => handle.send(body));
    if (!alive.current) return;
    if (result === "sent") close();
    else if (result === "unknown") setError("Delivery is uncertain. Check the conversation before sending again.");
    else if (result === "unavailable") setError("Agent unavailable. Check the Host connection and try again.");
  }
  const message = (text: string) => <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{text}</Text>;
  // Popover sheets size themselves to their content. Reserve reading space even
  // while loading or showing one item; let the host own all vertical scrolling.
  // This is a minimum body height, not a sheet snap point or a fixed content cap.
  return <View style={{ gap: 16, minHeight: layout.compact ? Math.round(windowHeight * 0.6) : undefined }}>
      <View style={{ gap: 4 }}>
        <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 20 }}>
          Agent: {agent?.title || agentId}
        </Text>
        {message(`Host: ${host.label}`)}
      </View>
      {unavailable ? message("This Agent is no longer available.") : null}
      {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground, fontSize: 14 }}>{error}</Text> : null}
      {selected ? <>
        <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 20 }}>{selected.name}</Text>
        {sender.uncertain ? <Action theme={theme} label="I checked the conversation — allow another send" disabled={pending}
          onPress={() => { sender.acknowledge(); setError(null); }} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Action theme={theme} label="Back" secondary disabled={pending} onPress={() => { setSelected(null); setError(null); }} />
          <Action theme={theme} label="Copy text" secondary disabled={pending} onPress={() => {
            void copyText(selected.body).then(() => { if (alive.current) setError("Prompt copied."); })
              .catch(() => { if (alive.current) setError("Could not copy the prompt."); });
          }} />
          <Action theme={theme} label={pending ? "Sending…" : "Send"} primary
            disabled={pending || sender.uncertain || unavailable} onPress={() => { void send(); }} />
        </View>
        {message("Review the full text below before sending. Sends a separate message; your Composer draft and attachments stay in place. A running Agent may receive it as a follow-up.")}
        <Text selectable style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 22 }}>{selected.body}</Text>
      </> : reloading || settings.status === "loading" ? message("Loading prompts…") :
        settings.status !== "ready" ? <>
          {message("Saved prompts could not be loaded.")}
          <Action theme={theme} label="Retry" disabled={reloading} onPress={() => {
            setReloading(true);
            void settings.reload().catch(() => { if (alive.current) setError("Could not refresh prompts."); })
              .finally(() => { if (alive.current) setReloading(false); });
          }} />
        </> : <>
          <Action theme={theme} secondary label={settings.values.prompts.length ? "Manage prompts" : "Add prompts"} onPress={() => { close(); openSettings(); }} />
          {settings.values.prompts.length === 0 ? message("No saved prompts yet. Add your first prompt in Settings.") :
            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, overflow: "hidden" }}>
              {settings.values.prompts.map((prompt, index) => <View key={prompt.id}
                style={index ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                <PromptRow theme={theme} prompt={prompt} disabled={unavailable}
                  onPress={() => { setSelected({ ...prompt }); }} />
              </View>)}
            </View>}
        </>}
  </View>;
}
