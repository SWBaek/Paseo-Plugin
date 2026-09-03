# UI 기여 지점

이 문서는 Paseo `0.7.2`가 Plugin에 열어 둔 UI 위치를 다룬다. Plugin UI는 React Native component이며 desktop, browser, iOS, Android에서 같은 기여 계약을 사용한다.

## 공통 렌더링 계약

Surface, panel, Composer pill, timeline renderer는 공통으로 다음 host 정보를 받는다.

| Prop | 내용 |
| --- | --- |
| `theme` | 활성 Paseo theme를 Plugin용 semantic color로 매핑한 값 |
| `host` | 선택된 daemon의 `id`, 표시용 `label` |
| `layout.compact` | mobile 또는 좁은 창인지 여부 |
| `layout.platform` | `"ios"`, `"android"`, `"web"` 중 하나 |

Surface와 workspace/agent panel에는 선택 host의 Agent 또는 Workspace를 여는 optional `navigation`도 주입된다. Composer pill과 timeline renderer에는 이 capability가 없다.

모든 `Text`는 `theme.colors.foreground` 또는 `foregroundMuted`를 사용하고, root 배경은 `surface0`에서 가져온다. 버튼·카드·상태 표현도 hardcoded color 대신 theme token을 사용한다. `layout.compact`에 따라 padding과 stacking을 조정한다.

Paseo가 route, host picker, screen header, close action, query client와 render error boundary를 소유한다. Plugin은 Paseo가 제공한 위치의 본문만 소유한다.

## 1. 전역 Surface와 좌측 Sidebar

`addSurface`는 Plugin 전용 전역 화면을 등록한다. `addSidebarItem`은 좌측 Sidebar 항목을 그 화면에 연결한다.

```ts
plugin.addSurface("ops", OpsSurface);
plugin.addSidebarItem({
  id: "ops",
  title: "Operations",
  icon: "Gauge",
  surface: "ops",
});
```

Sidebar contribution 필드는 다음 네 개뿐이다.

| 필드 | 의미 |
| --- | --- |
| `id` | Plugin 내부에서 고유한 Sidebar 항목 ID |
| `title` | Sidebar에 표시할 이름 |
| `icon` | Lucide icon 이름 |
| `surface` | 먼저 등록한 surface ID |

한 Plugin이 여러 surface와 Sidebar 항목을 등록할 수 있다. 다만 nested menu, section 지정, 순서나 badge를 제어하는 필드는 없다. 같은 contribution이 여러 host에 설치되면 Paseo가 하나의 Sidebar 항목과 host picker로 합친다.

Surface component는 `PluginSurfaceProps`의 `theme`, `host`, `layout`, optional `navigation`을 받는다. `navigation`은 다음 두 메서드만 제공한다.

| 메서드 | 동작 |
| --- | --- |
| `openAgent({ agentId })` | 선택된 host에서 해당 Agent를 연다. |
| `openWorkspace({ workspaceId })` | 선택된 host에서 해당 Workspace를 연다. |

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

`navigation`은 이전 Paseo client에서 `undefined`일 수 있으므로 그 기능에 의존하는 action을 표시하기 전에 확인한다. Paseo가 선택 host와 route 구성을 소유하며, Plugin은 다른 host를 지정하거나 임의 native route를 열 수 없다.

## 2. Workspace와 Agent Panel

`addWorkspacePanel`은 일반 Workspace 탭 영역과 Explorer에 Plugin panel을 추가한다. 이름과 달리 두 context를 지원한다.

| `context` | 대상 | Component props |
| --- | --- | --- |
| `"workspace"` | Workspace 전체 | `PluginWorkspacePanelProps`: `workspaceId` 포함 |
| `"agent"` | 특정 Agent | `PluginAgentPanelProps`: `workspaceId`, `agentId` 포함 |

```ts
plugin.addWorkspacePanel({
  id: "review",
  title: "Review",
  icon: "ScanSearch",
  context: "agent",
  locations: ["workspace", "explorer"],
  Component: ReviewPanel,
});
```

| 필드 | 필수 | 의미 |
| --- | --- | --- |
| `id` | 예 | Plugin 내부 panel ID |
| `title` | 예 | 탭 제목 |
| `icon` | 예 | Lucide icon 이름 |
| `context` | 예 | `"workspace"` 또는 `"agent"` |
| `locations` | 아니요 | `"workspace"`, `"explorer"` 또는 둘 다. 생략하면 workspace만 사용 |
| `Component` | 예 | context와 맞는 React Native component |

Workspace와 Agent panel도 공통 `theme`, `host`, `layout` 외에 Surface와 같은 optional `navigation`을 받는다. Panel의 `workspaceId`와 `agentId` 또는 hook으로 읽은 다른 대상 ID를 `openWorkspace`와 `openAgent`에 전달할 수 있다.

Panel component는 `useWorkspace(workspaceId, selector)`와 `useAgent(agentId, selector)`로 Paseo app이 이미 가진 normalized snapshot을 동기적으로 읽는다. selector는 필수이며, 반환값은 shallow equality로 비교된다. record가 없으면 hook은 `null`을 반환한다.

Panel은 다음 경로로 열 수 있다.

- workspace/agent Command Center callback의 `openPanel(id, options?)`
- headless client의 `openPanel(id, { workspaceId, agentId?, location? })`
- 사용자가 이미 열어 둔 persisted Plugin tab 복원

Workspace command는 workspace-context panel만 열 수 있다. Agent command는 agent-context panel과 workspace-context panel을 모두 열 수 있다. `{ location: "explorer" }`를 지정하려면 panel이 해당 location을 선언해야 한다.

## 3. Command Center 명령

`addCommandCenterItem`은 Ctrl+K/⌘K Command Center에 검색 가능한 action을 추가한다.

```ts
plugin.addCommandCenterItem({
  id: "open-review",
  title: "Open review",
  icon: "ScanSearch",
  keywords: ["inspect", "audit"],
  context: "agent",
  onSelect({ agent, rpc, openPanel }) {
    void rpc(refreshReview, { agentId: agent.id });
    openPanel("review");
  },
});
```

| Context | 표시 조건 | callback에 추가되는 값 |
| --- | --- | --- |
| `"global"` | 해당 설치 host가 선택됨 | 공통 capability만 제공 |
| `"workspace"` | 선택 host에 활성 cached workspace가 있음 | `workspace`, `openPanel` |
| `"agent"` | 활성 탭이 Agent 또는 agent-context Plugin panel임 | `workspace`, `agent`, `openPanel` |

모든 callback은 다음 capability를 받는다.

- 선택 host의 기존 `paseo` API
- Plugin의 typed `rpc(contract, input)`
- 같은 Plugin의 전역 화면을 여는 `openSurface(id)`

`keywords`는 검색 보조어일 뿐 별도 UI를 만들지 않는다. 사용자 정의 keyboard shortcut을 등록하는 필드는 없다.

## 4. Composer track bar의 Pill 버튼

`addClientSide`는 각 연결된 Paseo app에서 Plugin 설치당 한 번 실행되는 headless client entrypoint를 등록한다. 여기서 `addComposerPill`을 호출하면 특정 workspace/agent의 Composer 위 track bar에 버튼형 pill을 추가할 수 있다.

```ts
export function contributeClient(client: PluginClientContext) {
  const remove = client.addComposerPill({
    id: "review",
    title: "Open review",
    workspaceId,
    agentId,
    Component: ReviewPill,
    onPress() {
      client.openPanel("review", { workspaceId, agentId });
    },
  });
  return remove;
}

export default function contribute(plugin: PluginContext) {
  plugin.addClientSide(contributeClient);
  return () => {};
}
```

| 필드 | 역할 |
| --- | --- |
| `id` | 해당 Agent 안에서의 Plugin-local pill ID |
| `title` | 접근 가능한 버튼 label |
| `workspaceId` | pill이 속할 Workspace |
| `agentId` | pill이 속할 Agent |
| `Component` | icon과 text 내부를 그리는 component |
| `onPress` | 누름 동작. Promise를 반환할 수 있음 |

Paseo가 pressable, 공통 chrome, pending/error 상태와 배치를 소유한다. Plugin은 pill의 생성 조건, 내부 icon/text와 callback을 소유한다. `addComposerPill`은 idempotent 제거 함수를 반환하며 app unload, host disconnect, Plugin reload 시 남은 pill도 정리된다.

즉 “채팅창 위에 버튼”은 가능하지만 **Composer track bar의 표준 pill**이어야 한다. 입력창 내부, 전송 버튼 옆, 임의 좌표 같은 별도 slot은 공개되지 않았다.

## 5. Modal, Toast, Icon

Paseo 소유 UI는 `*.client.tsx`에서 `@getpaseo/plugin/react-native`로 가져온다.

### Modal

`Modal`은 Plugin이 `open` 상태를 소유하는 controlled component다.

```tsx
<Modal title="Confirm operation" open={open} onOpenChange={setOpen}>
  <Modal.Content>{/* React Native UI */}</Modal.Content>
</Modal>
```

| Prop | 필수 | 역할 |
| --- | --- | --- |
| `title` | 예 | 보이는 header와 접근성 label |
| `icon` | 아니요 | title 앞의 React node |
| `open` | 예 | 표시 상태 |
| `onOpenChange` | 예 | backdrop, close, Escape, back action, sheet gesture 등에 의한 상태 변경 |
| `children` | 예 | 보통 `Modal.Content` |

compact layout에서는 bottom sheet, 그 외에는 centered dialog로 표시된다. 내부에서는 `usePaseo`, `useRpc`, `useWorkspace`, `useAgent`를 계속 사용할 수 있다.

### Toast

`useToast()`는 다음 두 메서드를 제공한다.

- `show(message, { variant?, durationMs? })`: 기본 2,200ms
- `error(message)`: error variant로 기본 3,200ms

`variant`는 `default`, `info`, `success`, `warning`, `error`다. 새 toast를 표시하면 현재 toast를 교체하며 빈 message는 무시된다.

### Icon

`Icon`은 Paseo가 가진 Lucide set에서 `name`, `size?`, `color?`로 icon을 렌더링한다. Plugin client가 `lucide-react-native`나 `react-native-svg`를 직접 import하지 않는다. 알 수 없는 이름은 아무것도 렌더링하지 않는다.

## 6. Timeline 항목 변환과 렌더링

Timeline API는 daemon의 canonical 대화를 수정하지 않고, app이 projected history를 화면 모델로 바꾸는 단계에서 기존 한 항목을 Plugin 항목 0개 이상으로 교체한다.

1. `addTimelineTransformer`가 `query.itemType`으로 coarse match한다.
2. synchronous `transform`이 상세 내용을 판별한다.
3. `addTimelineRenderer`가 `kind`, `version`, Zod `schema`가 맞는 Plugin 항목을 그린다.

현재 protocol declaration의 대상 item type은 다음과 같다.

- `user_message`
- `assistant_message`
- `reasoning`
- `tool_call`
- `todo`
- `error`
- `compaction`

Transformer 반환값의 의미는 다음과 같다.

| 반환 | 결과 |
| --- | --- |
| `undefined` | 원래 timeline 항목 유지 |
| `{ items: [] }` | 화면 projection에서 원래 항목 숨김 |
| `{ items: [pluginItem] }` | Plugin renderer 한 개로 교체 |
| `{ items: [a, b, ...] }` | 여러 Plugin renderer로 교체 |

Plugin item의 `data`는 JSON-compatible이어야 한다. Transformer는 reconciliation 중 반복 실행되므로 synchronous, deterministic이어야 한다. 여러 transformer가 match하면 처음으로 결과를 반환한 transformer가 그 원본 항목을 소유한다.

Timeline API는 임의의 새 대화 항목을 독립적으로 삽입하는 API가 아니다. 항상 기존 projected 항목을 변환하는 방식이다.

## 7. Composer Attachment Source

Attachment source는 외부 이슈, 문서, 티켓 같은 resource를 검색해 Agent prompt에 완전한 text snapshot으로 첨부한다.

```ts
const source = defineAttachmentSource({
  id: "tickets",
  title: "Ticket",
  icon: "TicketCheck",
  pickerTitle: "Attach ticket",
  searchPlaceholder: "Search tickets",
  search: searchTickets,
});

plugin.handle(searchTickets, searchTicketsOnServer);
plugin.addAttachmentSource(source);
```

검색 RPC의 각 item은 `id`, `identifier`, `title`, optional `subtitle`, `url`, `text`, `resourceType`을 반환한다. Paseo가 Composer menu, picker, selected pill, draft와 submission을 소유하고, Plugin은 검색과 snapshot 내용을 소유한다.

같은 source가 여러 host에 있어도 Sidebar처럼 합쳐지지 않는다. Composer가 속한 host 범위에서만 보인다.

## 8. App Theme

`addTheme`은 Settings → Appearance에 light 또는 dark theme를 추가한다.

```ts
plugin.addTheme({
  id: "graphite",
  name: "Graphite",
  appearance: "dark",
  colors: {
    background: "#18181b",
    foreground: "#fafafa",
    raised: "#27272a",
    control: "#3f3f46",
    border: "#52525b",
    accent: "#a78bfa",
    mutedForeground: "#a1a1aa",
    ring: "#71717a",
  },
});
```

모든 색은 hex string이어야 한다. `accent`만 선택 사항이며 생략하면 foreground가 사용된다. Paseo가 작은 palette를 app surface, diff, syntax, status, terminal용 전체 token으로 확장한다.

Plugin이 disable 또는 remove되어 활성 theme를 더 이상 제공하지 않으면 Paseo는 기본 theme로 돌아간다.

## 등록 ID와 Icon

Plugin, surface, Sidebar item, panel, Command Center item, attachment source ID는 소문자로 시작하고 소문자·숫자·하이픈으로 구성한다. Contribution의 `icon` 필드는 Lucide icon 이름을 사용한다.

## 관련 문서

- [실전 사용 예시](examples.md)
- [전체 기능표](README.md)
- [Backend와 Paseo SDK](backend-and-sdk.md)
- [지원 경계](limitations.md)
- [`v0.7.2` 공식 Plugin reference](https://github.com/getpaseo/paseo/blob/v0.7.2/public-docs/plugins/reference.md)
