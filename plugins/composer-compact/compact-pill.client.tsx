import type { ComponentType } from "react";
import type { PluginComposerPillProps } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { CompactConfirmationController } from "./compact-confirmation";

export function createCompactPill(
  confirmation: CompactConfirmationController,
): ComponentType<PluginComposerPillProps> {
  return function CompactPill({ theme, layout, agentId }: PluginComposerPillProps) {
    const [open, setOpen] = useState(false);
    const styles = useMemo(
      () => ({
        content: {
          gap: 16,
          padding: layout.compact ? 16 : 24,
        },
        description: {
          color: theme.colors.foreground,
          fontSize: 14,
          lineHeight: 20,
        },
        detail: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        actions: {
          flexDirection: "row" as const,
          justifyContent: "flex-end" as const,
          gap: 8,
        },
        button: {
          minHeight: 44,
          minWidth: layout.compact ? 96 : 112,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          borderRadius: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        cancelButton: {
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.border,
          borderWidth: 1,
        },
        confirmButton: {
          backgroundColor: theme.colors.accent,
        },
        cancelText: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "500" as const,
        },
        confirmText: {
          color: theme.colors.accentForeground,
          fontSize: 14,
          fontWeight: "500" as const,
        },
      }),
      [layout.compact, theme],
    );

    useEffect(() => confirmation.subscribe(agentId, setOpen), [agentId, confirmation]);

    function dismiss() {
      confirmation.resolve(agentId, false);
    }

    function confirm() {
      confirmation.resolve(agentId, true);
    }

    return (
      <>
        <Icon name="Minimize2" size={14} color={theme.colors.foregroundMuted} />
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.foregroundMuted, flexShrink: 1 }}
        >
          Compact
        </Text>

        <Modal
          title="Compact agent context?"
          icon={<Icon name="Minimize2" size={18} color={theme.colors.foreground} />}
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) dismiss();
          }}
        >
          <Modal.Content>
            <View style={styles.content}>
              <Text style={styles.description}>
                This sends /compact to the current Agent and starts context compaction immediately.
              </Text>
              <Text style={styles.detail}>Continue only if you intended to compact this Agent.</Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel context compaction"
                  onPress={dismiss}
                  style={({ pressed }) => [
                    styles.button,
                    styles.cancelButton,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Confirm context compaction"
                  onPress={confirm}
                  style={({ pressed }) => [
                    styles.button,
                    styles.confirmButton,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.confirmText}>Compact</Text>
                </Pressable>
              </View>
            </View>
          </Modal.Content>
        </Modal>
      </>
    );
  };
}
