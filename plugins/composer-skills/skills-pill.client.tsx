import type { ComponentType } from "react";
import { usePaseo, type PluginComposerPillProps } from "@getpaseo/plugin";
import { Icon, Modal, useToast } from "@getpaseo/plugin/react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { copyTextToClipboard } from "./clipboard";
import {
  formatSkillDraft,
  selectSessionSkills,
  type SessionSkill,
  type SkillCatalog,
} from "./skill-catalog";
import type { SkillsModalController } from "./skills-modal";

export function createSkillsPill(
  modal: SkillsModalController,
): ComponentType<PluginComposerPillProps> {
  return function SkillsPill({ theme, layout, host, agentId }: PluginComposerPillProps) {
    const paseo = usePaseo();
    const toast = useToast();
    const [open, setOpen] = useState(false);
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [userText, setUserText] = useState("");
    const [copying, setCopying] = useState(false);

    const styles = useMemo(
      () => ({
        content: {
          gap: 16,
          padding: layout.compact ? 16 : 24,
        },
        status: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        error: {
          color: theme.colors.statusDanger,
          fontSize: 12,
          lineHeight: 18,
        },
        list: {
          maxHeight: layout.compact ? 180 : 240,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
        },
        skillRow: {
          minHeight: 44,
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 4,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
        },
        skillRowSelected: {
          backgroundColor: theme.colors.surface2,
        },
        skillName: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "500" as const,
        },
        skillDescription: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        fieldLabel: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
        },
        input: {
          minHeight: layout.compact ? 72 : 88,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface2,
          fontSize: 14,
          textAlignVertical: "top" as const,
        },
        preview: {
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

    const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => modal.subscribe(agentId, setOpen), [agentId, modal]);

    useEffect(() => {
      if (open) return;
      setSelectedName(null);
      setUserText("");
      setCopying(false);
      setCatalog(null);
      setCatalogError(null);
      setLoading(false);
    }, [open]);

    useEffect(() => {
      if (!open) return;

      let cancelled = false;
      setLoading(true);
      setCatalogError(null);

      void paseo.agents
        .ref(agentId)
        .commands()
        .then((result) => {
          if (cancelled) return;
          setCatalog(selectSessionSkills(result));
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setCatalog(null);
          setCatalogError("Skill 목록을 읽지 못했습니다");
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [agentId, host.id, open, paseo]);

    const skills = catalog?.skills ?? [];
    const selected = skills.find((skill) => skill.name === selectedName) ?? null;
    const draft = selected ? formatSkillDraft(selected, userText) : "";
    const confirmDisabled = !selected || copying;

    function dismiss() {
      modal.resolve(agentId, false);
    }

    async function confirm() {
      if (!selected || copying) return;

      setCopying(true);
      try {
        // Composer draft insertion is not in the 0.7.0 plugin contract. Do not send().
        await copyTextToClipboard(formatSkillDraft(selected, userText), layout.platform);
        toast.show("채팅창에 붙여넣으세요", { variant: "success" });
        modal.resolve(agentId, true);
      } catch {
        toast.error("클립보드에 복사하지 못했습니다");
      } finally {
        setCopying(false);
      }
    }

    return (
      <>
        <Icon name="Sparkles" size={14} color={theme.colors.foregroundMuted} />
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.foregroundMuted, flexShrink: 1 }}
        >
          Skills
        </Text>

        <Modal
          title="세션 Skill"
          icon={<Icon name="Sparkles" size={18} color={theme.colors.foreground} />}
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) dismiss();
          }}
        >
          <Modal.Content>
            <View style={styles.content}>
              <SkillList
                error={catalogError ?? catalog?.error}
                loading={loading}
                selectedName={selectedName}
                skills={skills}
                styles={styles}
                onSelect={setSelectedName}
              />
              <Text style={styles.fieldLabel}>Skill에 전달할 내용</Text>
              <TextInput
                accessibilityLabel="Skill prompt text"
                editable={Boolean(selected)}
                multiline
                onChangeText={setUserText}
                placeholder={selected?.argumentHint || "선택한 Skill과 함께 보낼 내용"}
                placeholderTextColor={theme.colors.foregroundMuted}
                style={styles.input}
                value={userText}
              />
              {selected ? (
                <Text style={styles.preview}>{draft}</Text>
              ) : (
                <Text style={styles.status}>Skill을 고르면 복사할 문장이 여기에 보입니다.</Text>
              )}
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel="Cancel skill prompt"
                  accessibilityRole="button"
                  onPress={dismiss}
                  style={({ pressed }) => [
                    styles.button,
                    styles.cancelButton,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.cancelText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Copy skill prompt to clipboard"
                  accessibilityRole="button"
                  disabled={confirmDisabled}
                  onPress={() => {
                    void confirm();
                  }}
                  style={({ pressed }) => [
                    styles.button,
                    styles.confirmButton,
                    confirmDisabled && { opacity: 0.4 },
                    pressed && !confirmDisabled && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.confirmText}>{copying ? "복사 중" : "클립보드에 복사"}</Text>
                </Pressable>
              </View>
            </View>
          </Modal.Content>
        </Modal>
      </>
    );
  };
}

function SkillList({
  error,
  loading,
  onSelect,
  selectedName,
  skills,
  styles,
}: {
  error: string | null | undefined;
  loading: boolean;
  onSelect(name: string): void;
  selectedName: string | null;
  skills: SessionSkill[];
  styles: {
    error: { color: string; fontSize: number; lineHeight: number };
    list: object;
    skillDescription: object;
    skillName: object;
    skillRow: object;
    skillRowSelected: object;
    status: { color: string; fontSize: number; lineHeight: number };
  };
}) {
  if (loading) {
    return <Text style={styles.status}>세션 Skill을 읽는 중</Text>;
  }

  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (skills.length === 0) {
    return <Text style={styles.status}>이 세션에 로드된 Skill이 없습니다.</Text>;
  }

  return (
    <ScrollView style={styles.list}>
      {skills.map((skill, index) => {
        const selected = skill.name === selectedName;
        return (
          <Pressable
            accessibilityLabel={skill.description ? `${skill.name}. ${skill.description}` : skill.name}
            accessibilityRole="button"
            key={`${skill.name}:${index}`}
            onPress={() => onSelect(skill.name)}
            style={({ pressed }) => [
              styles.skillRow,
              selected ? styles.skillRowSelected : null,
              index === skills.length - 1 ? { borderBottomWidth: 0 } : null,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.skillName}>{skill.name}</Text>
            {skill.description ? (
              <Text numberOfLines={2} style={styles.skillDescription}>
                {skill.description}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
