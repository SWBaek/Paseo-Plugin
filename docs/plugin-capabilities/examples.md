# 실전 사용 예시

이 문서는 Paseo `0.7.0-beta.2` Plugin API로 **실제로 무엇을 만들 수 있는지** 빠르게 보여주는 아이디어 모음이다. 예제는 핵심 계약만 보여주며, 실제 Plugin에는 import, loading·empty·error 상태, 접근성 label과 cleanup을 함께 추가한다.

## 30초 아이디어 지도

| 만들고 싶은 것 | 사용자에게 보이는 위치 | 조합할 기능 |
| --- | --- | --- |
| Git·서버·Tailscale 상태 대시보드 | 좌측 Sidebar의 전용 화면 | Surface + Sidebar + RPC |
| 현재 Workspace 품질 현황 | Workspace 탭 또는 Explorer | Workspace panel + `useWorkspace` + RPC |
| 현재 Agent 리뷰 체크리스트 | Agent 탭 | Agent panel + `useAgent` |
| “리뷰 새로고침” 빠른 명령 | Ctrl+K/⌘K | Command Center + RPC + Panel |
| 채팅창 위 “리뷰 열기” 버튼 | Composer track bar | Headless client + Composer pill |
| GitHub Issue·Notion 문서 첨부 | Composer 첨부 메뉴 | Attachment source + search RPC |
| Tool call 결과를 읽기 좋은 카드로 표시 | Agent timeline | Timeline transformer + renderer |
| 삭제·배포 전 확인창 | Plugin 화면 위 | Modal + Toast + Icon |
| PR 전용 Workspace와 Agent 생성 | Plugin 버튼 | `usePaseo` SDK |
| 사내 브랜드 또는 눈이 편한 색상 | Settings → Appearance | Theme contribution |
| Plugin 자체 설정 화면 | Sidebar/Panel 내부 | Surface + Modal + daemon-side file/DB |

## 1. Sidebar 운영 대시보드

**만들 수 있는 것:** Branch Garden, GitHub Project board, 서버 상태판처럼 항상 접근 가능한 독립 화면.

```tsx
function OpsDashboard({ theme, host }: PluginSurfaceProps) {
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foreground }}>Operations</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>{host.label}</Text>
    </View>
  );
}

export default function contribute(plugin: PluginContext) {
  plugin.addSurface("ops", OpsDashboard);
  plugin.addSidebarItem({
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
function ReviewPanel({ theme, workspaceId, agentId }: PluginAgentPanelProps) {
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.name);
  const agentTitle = useAgent(agentId, (agent) => agent.title ?? agent.id);

  return (
    <View style={{ padding: 24, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foreground }}>{workspaceName}</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>{agentTitle}</Text>
    </View>
  );
}

plugin.addWorkspacePanel({
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
plugin.addCommandCenterItem({
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
plugin.addCommandCenterItem({
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

```tsx
function ReviewPill({ theme }: PluginComposerPillProps) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <Icon name="ScanSearch" size={14} color={theme.colors.foregroundMuted} />
      <Text style={{ color: theme.colors.foregroundMuted }}>Review</Text>
    </View>
  );
}

export function contributeClient(client: PluginClientContext) {
  const removers = new Map<string, () => void>();
  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind !== "upsert" || !update.agent.workspaceId) return;
    const { id: agentId, workspaceId } = update.agent;

    removers.get(agentId)?.();
    removers.set(
      agentId,
      client.addComposerPill({
        id: "review",
        title: "Open review",
        workspaceId,
        agentId,
        Component: ReviewPill,
        onPress() {
          client.openPanel("review", { workspaceId, agentId });
        },
      }),
    );
  });

  return () => {
    unsubscribe();
    for (const remove of removers.values()) remove();
  };
}

plugin.addClientSide(contributeClient);
```

Paseo가 버튼 외형, pending/error 상태와 위치를 소유한다. Plugin은 언제 pill을 만들지, 안에 무엇을 보여줄지, 눌렀을 때 무엇을 할지만 정한다.

이 저장소의 [`composer-compact`](../../plugins/composer-compact/)는 이 패턴을 실제로 사용한다. `Compact` pill을 누르면 확인 Modal을 열고, 사용자가 `Compact`를 선택한 경우에만 현재 Agent에 `/compact`를 전송한다. 취소, backdrop, Escape, back action, compact sheet dismiss와 Plugin unload는 모두 명령을 보내지 않고 종료된다.

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

plugin.handle(searchTickets, ({ query }) => findTickets(query));
plugin.addAttachmentSource(tickets);
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

plugin.addTimelineTransformer({
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

plugin.addTimelineRenderer({
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
plugin.addTheme({
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

`git.shared.ts`:

```ts
export const readBranch = defineRpc({
  name: "git.read-branch",
  input: z.object({ directory: z.string() }),
  output: z.object({ branch: z.string() }),
});
```

`git.server.ts`:

```ts
export async function readCurrentBranch({ directory }: { directory: string }) {
  const { stdout } = await execFileAsync("git", ["-C", directory, "branch", "--show-current"]);
  return { branch: stdout.trim() };
}
```

`index.ts`와 client component:

```tsx
plugin.handle(readBranch, readCurrentBranch);

function BranchButton() {
  const getBranch = useRpc(readBranch);
  // await getBranch({ directory }) → { branch: "feature/example" }
  return null;
}
```

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

  return <Pressable accessibilityRole="button" onPress={() => void startReview()} />;
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

## 12. 외부 Dashboard 열기

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

## 13. Timer·Watcher·Subscription 정리

**만들 수 있는 것:** 주기적 cache refresh, filesystem watcher, socket subscription처럼 Plugin이 실행되는 동안 유지되는 기능.

```ts
export default function contribute(plugin: PluginContext) {
  const timer = setInterval(() => refreshCache(), 30_000);
  const stopWatching = watchRepository();

  plugin.addSurface("cache", CacheSurface);

  return () => {
    clearInterval(timer);
    stopWatching();
  };
}
```

Reload, disable, remove와 daemon shutdown 때 cleanup이 실행된다. Plugin이 만든 timer, watcher, socket과 subscription만 직접 정리하면 등록된 surface, panel, RPC 등은 Paseo가 제거한다.

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

## 다음에 읽을 문서

- [전체 기능표](README.md)
- [UI 기여 지점 상세](ui-contributions.md)
- [Backend와 Paseo SDK 상세](backend-and-sdk.md)
- [지원 경계와 불가능한 위치](limitations.md)
