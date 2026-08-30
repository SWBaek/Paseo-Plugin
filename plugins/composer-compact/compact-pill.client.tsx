import { Icon, type PluginComposerPillProps } from "@getpaseo/plugin";
import { Text } from "react-native";

export function CompactPill({ theme }: PluginComposerPillProps) {
  return (
    <>
      <Icon name="Minimize2" size={14} color={theme.colors.foregroundMuted} />
      <Text
        numberOfLines={1}
        style={{ color: theme.colors.foregroundMuted, flexShrink: 1 }}
      >
        Compact
      </Text>
    </>
  );
}
