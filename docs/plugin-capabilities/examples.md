# 실전 사용 예시

이 문서는 Paseo **0.9.0-beta.2** Plugin API로 **실제로 무엇을 만들 수 있는지** 빠르게 보여주는 아이디어 모음이다. 예제는 핵심 계약만 보여주며, 실제 Plugin에는 import, loading·empty·error 상태, 접근성 label과 cleanup을 함께 추가한다.

아래 예시는 현재 설치 가능한 제품 목록이나 실행 검증 결과가 아니다. 현재 구현의 버전과 검증 상태는 [호환성 기록](../COMPATIBILITY.md)과 [0.9 이관](../MIGRATION_0.9.md)을 따른다. 이 저장소의 배포 대상은 [Branch Garden과 Provider Usage](../../README.md#plugins)이며, 그 밖의 예시는 API 활용 아이디어다.

등록 코드의 `client`는 `index.client.tsx`의 `PluginClientContext`, `server`는 `index.server.ts`의 `PluginServerContext`다. Context·props·훅은 `/client`, server context는 `/server`, `defineRpc`·`defineSettings`·`defineAttachmentSource`·`PluginTheme`·`PluginCleanup`은 SDK root에서 가져온다. `Icon`·`Modal`·`useToast`·`copyText` 등 UI는 `/client/react-native`에서 가져온다. 예제의 미정의 업무 함수는 해당 `client/` 또는 `server/`에서 구현해 연결한다.

## 30초 아이디어 지도

| 만들고 싶은 것 | 사용자에게 보이는 위치 | 조합할 기능 |
| --- | --- | --- |
| Git·서버·Tailscale 상태 대시보드 | 좌측 Sidebar의 전용 화면 | Surface + Sidebar + RPC |
| 현재 Workspace 품질 현황 | Workspace 탭 또는 Explorer | Workspace panel + `useWorkspace` + RPC |
| 현재 Agent 리뷰 체크리스트 | Agent 탭 | Agent panel + `useAgent` |
| “리뷰 새로고침” 빠른 명령 | Ctrl+K/⌘K | Command Center + RPC + Panel |
| 채팅창 위 “리뷰 열기” 버튼 | Composer track bar | Headless client + Composer pill |
| 현재 세션 Skill 고르기 | Composer track bar | Headless client + Composer pill + Modal + `agent.commands()` |
| GitHub Issue·Notion 문서 첨부 | Composer 첨부 메뉴 | Attachment source + search RPC |
| Tool call 결과를 읽기 좋은 카드로 표시 | Agent timeline | Timeline transformer + renderer |
| 삭제·배포 전 확인창 | Plugin 화면 위 | Modal + Toast + Icon |
| PR 전용 Workspace와 Agent 생성 | Plugin 버튼 | `usePaseo` SDK |
| 검색 결과에서 기존 Agent·Workspace 열기 | Surface 또는 Panel 버튼 | optional host `navigation` |
| 사내 브랜드 또는 눈이 편한 색상 | Settings → Appearance | Theme contribution |
| Plugin 자체 설정 화면 | Settings → Plugins | Settings screen + host settings |
| `/usage` 같은 명령 | Composer autocomplete | Client slash command |
| Provider 계획 사용량 조회 | Surface·Composer pill | 제공된 `paseo.providers.listUsage` + query |
| 장기 작업 완료 결과 | Agent timeline | Server timeline append + renderer |
| Agent 종료 후 후속 처리 | App 없이 daemon에서 실행 | Lifecycle hook + SDK |
| 사내 Provider/ACP CLI 연결 | Provider 선택과 채팅 | Provider registration + adapter |

## 1. Sidebar 운영 대시보드

**만들 수 있는 것:** Branch Garden, GitHub Project board, 서버 상태판처럼 항상 접근 가능한 독립 화면.

```tsx
function OpsDashboard({ theme, host, layout }: PluginSurfaceProps) {
  return (
    <View style={{ flex: 1, padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foreground }}>Operations</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>{host.label}</Text>
    </View>
  );
}

export default function contribute(client: PluginClientContext) {
  client.addSurface("ops", OpsDashboard);
  client.addSidebarItem({
    id: "ops",
    title: "Operations",
    icon: "Gauge",
    surface: "ops",
  });
  return () => {};
}
```

`addSurface`가 화면 본문을 만들고, `addSidebarItem`이 좌측 메뉴에서 그 화면을 열어 준다. 실제 데이터가 로컬 machine에 있다면 [Plugin RPC](#9-로컬-git-정보를-읽는-plugin-rpc)를 함께 사용한다.

## 2. Workspace 또는 Agent 전용 Panel

**만들 수 있는 것:** 현재 작업 폴더의 테스트 현황, 현재 Agent의 리뷰 결과, 배포 체크리스트.

```tsx
function ReviewPanel({ theme, layout, workspaceId, agentId }: PluginAgentPanelProps) {
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.name);
  const agentTitle = useAgent(agentId, (agent) => agent.title ?? agent.id);

  return (
    <View style={{ padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foreground }}>{workspaceName}</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>{agentTitle}</Text>
    </View>
  );
}

client.addWorkspacePanel({
  id: "review",
  title: "Review",
  icon: "ScanSearch",
  context: "agent",
  locations: ["workspace", "explorer"],
  Component: ReviewPanel,
});
```

`context: "workspace"`로 바꾸면 Agent와 무관한 Workspace 도구가 된다. `locations`를 생략하면 일반 Workspace 탭에만 열리고, `"explorer"`를 추가하면 Explorer에도 배치할 수 있다.

## 3. Command Center 빠른 명령

**만들 수 있는 것:** 현재 Agent의 리뷰를 새로고침하고 결과 panel을 여는 Ctrl+K/⌘K 명령.

```ts
client.addCommandCenterItem({
  id: "refresh-review",
  title: "Refresh agent review",
  icon: "RefreshCw",
  keywords: ["audit", "inspect"],
  context: "agent",
  async onSelect({ agent, rpc, openPanel }) {
    await rpc(refreshReview, { agentId: agent.id });
    openPanel("review");
  },
});
```

`context`를 `global`, `workspace`, `agent` 중에서 고르면 명령이 나타날 조건이 정해진다. Callback에서는 같은 Plugin의 surface/panel을 열거나 Paseo SDK와 Plugin RPC를 호출할 수 있다.

전역 명령에서 Sidebar와 같은 화면을 바로 열 수도 있다.

```ts
client.addCommandCenterItem({
  id: "open-operations",
  title: "Open operations dashboard",
  icon: "Gauge",
  context: "global",
  onSelect({ openSurface }) {
    openSurface("ops");
  },
});
```

## 4. 채팅창 위 Composer Pill

**만들 수 있는 것:** “리뷰 열기”, “현재 티켓 보기”, “배포 체크리스트”처럼 Agent와 가까운 표준 버튼.

```ts
export function contributeClient(client: PluginClientContext) {
  const registrations = new Map<string, PluginButtonRegistration>();
  const unsubscribe = client.paseo.agents.subscribe((update) => {
    const id = update.kind === "remove" ? update.agentId : update.agent.id;
    registrations.get(id)?.remove();
    registrations.delete(id);
    if (update.kind === "remove" || !update.agent.workspaceId || update.agent.archivedAt) return;
    const { id: agentId, workspaceId } = update.agent;
    registrations.set(agentId, client.addComposerPill({
      id: "review", workspaceId, agentId,
      button: { title: "Open review", label: "Review", icon: "ScanSearch",
        behavior: { kind: "action", onPress() {
          client.openPanel("review", { workspaceId, agentId });
        } } },
    }));
  });
  return () => {
    unsubscribe();
    for (const registration of registrations.values()) registration.remove();
  };
}
```

`PluginClientContext`와 `PluginButtonRegistration`은 `@getpaseo/plugin/client`에서 가져온다. 이 조각은 live 변경 경로만 보여준다. 실제 제품은 최초 목록·페이지·구독 경합도 처리한다. 등록된 label은 `registration.update({ label })`로 갱신한다. `index.client.tsx`는 review panel을 등록하고 helper cleanup을 반환한다. Header의 지정 slot에는 같은 descriptor로 `addHeaderButton`을 사용할 수 있다.


## 5. 확인 Modal과 결과 Toast

**만들 수 있는 것:** 삭제·배포·설정 저장 전에 확인하고 성공이나 오류를 알려 주는 flow.

```tsx
function DeployAction({ theme }: PluginSurfaceProps) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  async function deploy() {
    await runDeploy();
    setOpen(false);
    toast.show("Deployment started", { variant: "success" });
  }

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={{ color: theme.colors.foreground }}>Deploy</Text>
      </Pressable>
      <Modal
        title="Start deployment?"
        icon={<Icon name="Rocket" size={18} color={theme.colors.foreground} />}
        open={open}
        onOpenChange={setOpen}
      >
        <Modal.Content>
          <Pressable accessibilityRole="button" onPress={() => void deploy()}>
            <Text style={{ color: theme.colors.foreground }}>Confirm</Text>
          </Pressable>
        </Modal.Content>
      </Modal>
    </>
  );
}
```

같은 코드가 넓은 화면에서는 dialog, compact 화면에서는 bottom sheet로 표시된다.

## 6. GitHub Issue나 문서를 Composer에 첨부

**만들 수 있는 것:** 외부 resource를 검색하고 Agent prompt에 변하지 않는 text snapshot으로 전달하는 picker.

```ts
const searchTickets = defineRpc({
  name: "tickets.search",
  input: z.object({ query: z.string() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        subtitle: z.string().optional(),
        url: z.string().url(),
        text: z.string(),
        resourceType: z.string(),
      }),
    ),
  }),
});

const tickets = defineAttachmentSource({
  id: "tickets",
  title: "Ticket",
  icon: "TicketCheck",
  pickerTitle: "Attach ticket",
  searchPlaceholder: "Search by ID or title",
  search: searchTickets,
});

// 위 계약은 shared/tickets.ts에 둔다.
```

```ts
// index.server.ts의 contribute 본문
server.handle(searchTickets, ({ query }) => findTickets(query));
```

```ts
// index.client.tsx의 contribute 본문
client.addAttachmentSource(tickets);
```

`findTickets`는 daemon-side code에서 credential을 사용해 vendor API를 호출하고 `{ items }`를 반환한다. 각 item의 `text`가 Agent에게 실제로 전달될 전체 내용이다.

## 7. Tool Call을 읽기 좋은 Timeline Card로 표시

**만들 수 있는 것:** 긴 command output을 “배포 성공”, “테스트 실패 3건” 같은 전용 카드로 교체.

```tsx
const deployCardSchema = z.object({
  label: z.string(),
  success: z.boolean(),
});

function DeployCard({ item, theme }: PluginTimelineItemProps<z.output<typeof deployCardSchema>>) {
  return (
    <Text style={{ color: item.data.success ? theme.colors.statusSuccess : theme.colors.statusDanger }}>
      {item.data.label}
    </Text>
  );
}

client.addTimelineTransformer({
  id: "deploy-card",
  query: { itemType: "tool_call" },
  transform({ item }) {
    if (item.name !== "deploy" || item.status === "running") return;
    return {
      items: [{
        type: "plugin",
        kind: "deploy-card",
        version: 1,
        data: { label: "Deployment finished", success: item.status === "completed" },
      }],
    };
  },
});

client.addTimelineRenderer({
  kind: "deploy-card",
  version: 1,
  schema: deployCardSchema,
  Component: DeployCard,
});
```

Transformer에서 `undefined`를 반환하면 원본을 유지하고, `{ items: [] }`를 반환하면 화면에서 숨긴다. Canonical 대화 기록 자체는 수정하지 않는다.

## 8. App Theme 추가

**만들 수 있는 것:** 회사 브랜드 theme, OLED용 dark theme, 눈이 편한 저대비 theme.

```ts
client.addTheme({
  id: "midnight",
  name: "Midnight",
  appearance: "dark",
  colors: {
    background: "#111318",
    foreground: "#eef1f6",
    raised: "#1b1f27",
    control: "#252b35",
    border: "#343c49",
    accent: "#7c9cff",
    mutedForeground: "#9ba7b7",
    ring: "#65748a",
  },
});
```

등록된 theme는 Settings → Appearance에 나타난다. Paseo가 이 작은 palette를 diff, syntax, terminal과 status color까지 확장한다.

## 9. 로컬 Git 정보를 읽는 Plugin RPC

**만들 수 있는 것:** 현재 branch, dirty file 수, test 결과, 로컬 service 상태처럼 client에서 직접 읽을 수 없는 정보.

`shared/git.ts` (`defineRpc`는 SDK root에서 import):

```ts
export const readBranch = defineRpc({
  name: "git.read-branch",
  input: z.object({ directory: z.string() }),
  output: z.object({ branch: z.string() }),
});
```

`server/git.ts` (`execFileAsync`는 Node execFile을 promisify한 함수):

```ts
export async function readCurrentBranch({ directory }: { directory: string }) {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "core.fsmonitor=false", "-C", directory, "branch", "--show-current"],
    { timeout: 5_000, maxBuffer: 64 * 1024, windowsHide: true },
  );
  return { branch: stdout.trim() };
}
```

`index.server.ts`의 contribute 본문:

```ts
server.handle(readBranch, readCurrentBranch);
```

`client/branch.tsx`:

```tsx

function BranchButton() {
  const getBranch = useRpc(readBranch);
  // await getBranch({ directory }) → { branch: "feature/example" }
  return null;
}
```

위 Git 조각은 현재 Branch Garden 코드가 아니라 이관 후 예시다. 실제 제품에는 입력 경로와 read-only argv allowlist, 환경·오류 처리 및 Git 상태 무변경 검증을 함께 적용한다.

Filesystem, process, credential과 vendor API 접근은 daemon-side handler에 둔다. Input과 output은 Zod schema로 양쪽에서 검사된다.

## 10. Paseo SDK로 Workspace와 Agent 만들기

**만들 수 있는 것:** “PR 리뷰 시작”, “버그 수정 Agent 실행”, “새 worktree에서 테스트” 같은 orchestration 버튼.

```tsx
function StartReviewButton({ directory }: { directory: string }) {
  const paseo = usePaseo();

  async function startReview() {
    const workspace = await paseo.workspaces.open(directory);
    await workspace.agents.create({
      config: { provider: "codex/gpt-5.5" },
      title: "Review current changes",
      prompt: "Review the current diff and report correctness risks.",
    });
  }

  // 실제 client UI에서 pending·error를 처리하는 버튼에 연결한다.
  return null;
}
```

같은 `PaseoApi`로 Project 조회, Workspace 생성·archive, Agent message/run, Provider 조회와 daemon config 관리도 할 수 있다. Plugin 안에서 별도 Paseo client를 만들지 않는다.

## 11. Cached Workspace·Agent 상태 표시

**만들 수 있는 것:** Agent 실행 상태 badge, Workspace diff 통계, 현재 model과 attention 상태.

```tsx
function AgentStatus({ agentId, theme }: { agentId: string; theme: PluginTheme }) {
  const status = useAgent(agentId, (agent) => ({
    state: agent.status,
    needsAttention: agent.requiresAttention,
  }));

  return (
    <Text style={{ color: status?.needsAttention ? theme.colors.statusWarning : theme.colors.foreground }}>
      {status?.state ?? "Unavailable"}
    </Text>
  );
}
```

`useWorkspace`도 같은 방식으로 `name`, `status`, `diffStat` 등 필요한 field만 선택한다. 현재 문맥을 알아내기 위한 별도 RPC는 만들 필요가 없다.

## 12. 선택 Host의 Agent·Workspace 열기

**만들 수 있는 것:** 검색 결과, 운영 현황이나 관계 그래프에서 기존 Agent 또는 Workspace를 Paseo 화면으로 바로 열기.

```tsx
function AgentShortcut({ agentId, navigation, theme }: PluginSurfaceProps & { agentId: string }) {
  if (!navigation) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.openAgent({ agentId })}
    >
      <Text style={{ color: theme.colors.foreground }}>Open agent</Text>
    </Pressable>
  );
}
```

Surface와 workspace/agent panel의 `navigation`은 `openAgent({ agentId })`와 `openWorkspace({ workspaceId })`를 제공한다. 렌더링 중인 host에서만 대상을 열며, 이전 Paseo client에서는 `undefined`일 수 있으므로 관련 action을 표시하기 전에 확인한다. 임의 native route를 열거나 다른 host를 지정하는 API는 아니다.

## 13. 외부 Dashboard 열기

**만들 수 있는 것:** Plugin은 핵심 요약만 보여 주고 Grafana, GitHub, TailscaleOps 같은 전체 dashboard는 시스템 browser로 열기.

```tsx
<Pressable
  accessibilityRole="link"
  onPress={() => void Linking.openURL("https://dashboard.example.com")}
>
  <Text style={{ color: theme.colors.accent }}>Open full dashboard</Text>
</Pressable>
```

이 방식은 외부 URL을 여는 것이며 Paseo 내부 native route로 이동하는 API는 아니다.

## 14. Timer·Watcher·Subscription 정리

Node 기반 cache와 watcher는 `index.server.ts`에서 시작하고 같은 entry에서 정리한다. 화면 등록은 별도의 `index.client.tsx`에 둔다.

```ts
// index.server.ts
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { refreshCache, watchRepository } from "./server/cache";

export default function contribute(server: PluginServerContext) {
  const timer = setInterval(() => void refreshCache(), 30_000);
  const stopWatching = watchRepository();
  return () => {
    clearInterval(timer);
    stopWatching();
  };
}
```

`refreshCache`는 겹친 실행과 rejection을 자체 처리하도록 구현한다. Client 구독은 client entry cleanup에서 해제한다. Paseo는 각 entry cleanup 뒤 남은 등록을 제거한다.

## 15. Settings 화면과 host 저장

아래 세 조각은 서로 다른 파일에 둔다. Schema의 default는 `{}`를 유효한 설정으로 만든다.

```ts
// shared/preferences.ts
import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const preferences = defineSettings({
  id: "display",
  scope: "host",
  version: 1,
  schema: z.object({ showMetadata: z.boolean().default(true) }),
});
```

```ts
// index.server.ts의 contribute 본문
server.registerSettings(preferences);
```

```tsx
// client/settings.tsx
import { useSettings } from "@getpaseo/plugin/client";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsSection, SettingsCard, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { preferences } from "../shared/preferences";

export function DisplaySettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  if (settings.status !== "ready") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>
      {settings.status === "loading" ? "Loading settings" : settings.error}
    </Text>;
  }
  return (
    <SettingsSection title="Display">
      <SettingsCard>
        <SettingsSwitch
          label="Show metadata"
          value={settings.values.showMetadata}
          disabled={settings.saving}
          error={settings.saveError}
          onValueChange={(showMetadata) => {
            void settings.save({ ...settings.values, showMetadata }, settings.revision);
          }}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
```

Client entry에서 `client.addSettingsScreen({ id: "display", title: "Display", icon: "Settings", Component: DisplaySettings })`를 등록한다. 실제 제품에는 읽기 재시도와 invalid/reset 복구 UI도 연결한다. Schema version과 revision은 다르며 충돌 시 사용자 draft를 유지한다. 이 저장소의 Provider Usage는 host-scoped 표시 Settings를 구현하며, 네 스위치의 즉시 저장·실패·invalid 복구를 제공한다.

## 16. Slash command로 사용량 화면 열기

```ts
// index.client.tsx의 contribute 본문; main surface를 먼저 등록한다.
client.addSlashCommand({
  name: "usage",
  description: "Open provider usage",
  argumentHint: "",
  context: "agent",
  onSubmit({ openSurface }) {
    openSurface("main");
  },
});
```

명령 text는 provider에 전송되지 않는다. Attachment가 있으면 실행되지 않으며 host가 긴 작업의 pending 상태를 제공하지 않으므로, RPC를 추가한다면 별도 UI 상태도 설계한다.

## 17. 작업 결과를 durable timeline에 남기기

```ts
// server/publish.ts: plugin handler 또는 hook에서 주입받은 context를 사용한다.
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

export async function publishReview(agentId: string, { paseo }: PluginHandlerContext) {
  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: "latest-review",
    kind: "review-result",
    version: 1,
    data: { verdict: "ready" },
  });
}
```

Client entry에는 동일 `kind`·`version`과 payload schema를 가진 renderer가 필요하다. 같은 ID로 다시 기록하면 이전 plugin row를 갱신한다. 기존 대화를 덮어쓰지 않으며 JSON payload는 최대 64 KiB다.

## 18. Agent lifecycle 관찰

```ts
// index.server.ts
import type { PluginServerContext } from "@getpaseo/plugin/server";

export default function contribute(server: PluginServerContext) {
  const remove = server.on("agent.turn_ended", (event) => {
    console.log("Turn ended", event.outcome.kind);
  });
  return remove;
}
```

이벤트는 live best effort이며 재전송·자동 retry가 없다. App을 닫아도 server hook은 실행되지만 daemon 중단을 넘어 workflow가 자동 복구되는 것은 아니다. Follow-up이나 permission 응답은 [lifecycle 조건](backend-and-sdk.md#lifecycle-hooks)을 먼저 설계한다.

## 19. Host가 제공하는 계획 사용량 읽기

```ts
// client query의 queryFn 또는 주입된 paseo를 받은 server handler 내부
const snapshot = await paseo.providers.listUsage();
const codex = snapshot.providers.find((provider) => provider.providerId === "codex");
```

Client에서는 `usePaseo()`로 API를 얻고 TanStack Query의 loading/error/cache를 연결한다. `status`, window 잔여율·reset, balance의 nullable/optional 값을 처리하며 `agent.lastUsage`를 계획 잔여량으로 표시하지 않는다. Host 미지원 시 reject된다. 이 저장소의 Provider Usage는 이 공식 SDK를 사용하며, global Provider catalog의 enabled 연결만 표시한다. 소스 검증과 실제 앱 runtime 검증은 구분한다.

## 기능을 조합한 Plugin 아이디어

### PR Review Companion

- Agent panel에 리뷰 결과와 체크리스트 표시
- Command Center에서 리뷰 RPC 재실행
- Composer pill로 panel을 즉시 열기
- Timeline transformer로 test/tool result를 카드로 표시

### Local DevOps Console

- Sidebar surface에 service 상태 요약
- RPC로 Docker, Git, Tailscale 같은 read-only CLI 조회
- 위험한 action은 Modal로 확인
- 완료와 오류는 Toast로 표시
- 전체 vendor dashboard는 `Linking`으로 열기

### Issue-driven Agent Launcher

- Attachment source로 GitHub/Linear issue 검색
- 선택한 issue text를 prompt에 첨부
- `usePaseo`로 별도 worktree Workspace와 Agent 생성
- Agent panel에서 진행 상태와 결과 표시

### Personal Paseo Theme Pack

- light/dark theme 등록
- Sidebar surface에 palette preview와 사용 안내 제공
- Plugin이 제거되면 Paseo가 기본 theme로 자동 복귀

### 0.8에서 재검토할 기존 아이디어

- [Provider Usage #84](https://github.com/NaruForge/Paseo-Plugin/issues/84): `providers.listUsage()`와 활성 연결 필터로 조회하고 host settings로 표시 옵션을 저장한다. 갱신 주기 설정은 이번 범위에 포함하지 않는다. Native header 고정 숫자 slot이 생긴 것은 아니다.
- [Agent Graph #38](https://github.com/NaruForge/Paseo-Plugin/issues/38): lifecycle hook, permission 응답, durable timeline을 활용할 수 있다. Graph state·checkpoint·retry engine은 별도 설계가 필요하다.
- Provider plugin은 [공식 provider 예제](https://paseo.sh/docs/plugins/v0.8/providers)의 session·prompt result·permission·persistence 계약부터 검증한다.

## 다음에 읽을 문서

- [전체 기능표](README.md)
- [UI 기여 지점 상세](ui-contributions.md)
- [Backend와 Paseo SDK 상세](backend-and-sdk.md)
- [지원 경계와 불가능한 위치](limitations.md)
