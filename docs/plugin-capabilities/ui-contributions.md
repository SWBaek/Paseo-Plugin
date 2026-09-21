# UI 기여 지점

이 문서는 **Paseo `0.9.0-beta.2`**가 Plugin에 열어 둔 UI 위치를 다룬다. 아래 내용은 [0.9 이관](../MIGRATION_0.9.md)에 적용할 계약이며, 실제 플러그인별 이관·검증 상태는 [호환성 기록](../COMPATIBILITY.md)을 따른다. Plugin UI는 React Native component이며 desktop, browser, iOS, Android에서 같은 기여 계약을 사용한다.

등록 예제의 `client`는 `index.client.tsx`의 `PluginClientContext`다. Context·props·훅은 `@getpaseo/plugin/client`, `PluginTheme` 같은 공유 타입은 `@getpaseo/plugin`, host UI는 `/client/react-native`에서 가져온다. 별도 파일의 코드 조각은 각 런타임 entry에 배치한다.

## 공통 렌더링 계약

Surface, settings screen, panel, Composer pill, timeline renderer는 공통으로 다음 host 정보를 받는다.

| Prop | 내용 |
| --- | --- |
| `theme` | 활성 Paseo theme를 Plugin용 semantic color로 매핑한 값 |
| `host` | 선택된 daemon의 `id`, 표시용 `label` |
| `layout.compact` | mobile 또는 좁은 창인지 여부 |
| `layout.platform` | `"ios"`, `"android"`, `"web"` 중 하나 |

Surface·settings screen과 workspace/agent panel에는 선택 host의 Agent 또는 Workspace를 여는 optional `navigation`도 주입된다. Composer pill과 timeline renderer에는 이 capability가 없다.

모든 `Text`는 `theme.colors.foreground` 또는 `foregroundMuted`를 사용하고, root 배경은 `surface0`에서 가져온다. 버튼·카드·상태 표현도 hardcoded color 대신 theme token을 사용한다. `layout.compact`에 따라 padding과 stacking을 조정한다.

Paseo가 route, host picker, screen header, close action, query client와 render error boundary를 소유한다. Plugin은 Paseo가 제공한 위치의 본문만 소유한다.

## 1. 전역 Surface와 좌측 Sidebar

`addSurface`는 Plugin 전용 전역 화면을 등록한다. `addSidebarItem`은 좌측 Sidebar 항목을 그 화면에 연결한다.

```ts
client.addSurface("ops", OpsSurface);
client.addSidebarItem({
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

한 Plugin이 여러 surface와 Sidebar 항목을 등록할 수 있다. 다만 nested menu, section 지정, 순서나 badge를 제어하는 필드는 없다. 0.8에서는 사용자가 Paseo Layout 설정에서 top-level Sidebar 항목을 재정렬·숨길 수 있지만 플러그인의 순서 제어 필드는 아니다. 같은 contribution이 여러 host에 설치되면 Paseo가 하나의 Sidebar 항목과 host picker로 합친다.

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
client.addWorkspacePanel({
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
client.addCommandCenterItem({
  id: "open-review",
  title: "Open review",
  icon: "ScanSearch",
  keywords: ["inspect", "audit"],
  context: "agent",
  async onSelect({ agent, rpc, openPanel }) {
    await rpc(refreshReview, { agentId: agent.id });
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
- 같은 Plugin의 등록된 Settings 화면을 여는 `openSettings(id)`

`keywords`는 검색 보조어일 뿐 별도 UI를 만들지 않는다. 사용자 정의 keyboard shortcut을 등록하는 필드는 없다.

## 4. Composer pill과 Header button

정식 0.8.0의 두 기여는 `button` descriptor를 공유한다. 아래 예제는 같은 entry에서 등록한 `review` panel을 연다.

```ts
const registration = client.addComposerPill({
  id: "review", workspaceId, agentId,
  button: {
    title: "Open review", label: "Review", icon: "ScanSearch",
    behavior: { kind: "action", onPress() {
      client.openPanel("review", { workspaceId, agentId });
    } },
  },
});
registration.update({ label: "Review · 3", disabled: false });
// helper cleanup:
registration.remove();
```

`addHeaderButton({ id, workspaceId, button })`는 Workspace header의 지정 위치에 기여한다. 임의 toolbar/좌표를 지정하지 않는다. Header는 label을 생략할 수 있고 compact에서 icon만 표시한다. Composer는 icon과 label(생략하면 title)을 표시하며 chevron이 없다.

| 계약 | 역할 |
| --- | --- |
| `button.title` | 접근성 이름·설명 |
| `button.icon` | icon 이름 또는 `PluginButtonIconProps` component |
| `button.label` | 보이는 텍스트; 변화는 `update`로 반영 |
| `button.visible`, `disabled` | 표시·사용 가능 상태 |
| `button.behavior` | `action`의 onPress, `menu`의 items, `popover`의 Content |
| 반환 handle | `update(Partial<PluginButton>)`, idempotent `remove()` |

Custom icon에서 훅을 사용할 수 있다. Label을 icon 내부 Text로 그리지 않으며, render 도중 update하지 않고 effect나 model 구독으로 반영한다. `PluginButtonIconProps`의 context는 workspace/agent union이므로 agentId 접근 전에 좁힌다. Popover Content는 close capability를 받는다.

여러 Agent는 초기 목록과 live 구독을 조합하고 archive/remove/provider 변경에 따라 정리한다. 늦은 응답이 최신 상태를 덮지 않도록 하며 entry cleanup에서 구독·타이머·handle을 해제한다. 제거 후 update는 no-op이다. Host가 chrome·pending/error 상태·배치와 남은 기여의 teardown을 소유한다.

## 5. Modal, Toast, Icon

Paseo 소유 UI는 `client/`의 UI 모듈에서 `@getpaseo/plugin/client/react-native`로 가져온다.

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

### Body, scrolling, keyboard와 clipboard

`Modal.Content`는 `style`, `contentContainerStyle`, `scrollable`을 받는다. 기본 padding 24와 gap 16을 `contentContainerStyle`로 조정할 수 있으며 safe area는 host가 소유한다. 기본 `scrollable: true`를 유지하거나, 높이가 제한된 body에 자체 scroll/list를 넣을 때 `false`로 바꾼다.

`@getpaseo/plugin/client/react-native`의 `ScrollView`, `FlatList`, `TextInput`은 sheet gesture와 keyboard 위치 처리를 연결한다. 긴 목록·수평 tab·input이 있는 modal에서는 이 컴포넌트를 사용하고 같은 축의 중복 scroll을 피한다. Body layout을 바꾸면 compact sheet의 drag·keyboard·safe area와 wide dialog에서 영향을 받은 동작을 확인한다.

`copyText(text): Promise<void>`는 **현재 client**의 clipboard에 복사한다. 사용할 수 없거나 권한이 거부되면 reject하므로 pending과 성공·실패 피드백을 처리한다. Daemon clipboard API나 UI 안의 직접 `navigator.clipboard` 호출로 대체하지 않는다.

### Toast

`useToast()`는 다음 두 메서드를 제공한다.

- `show(message, { variant?, durationMs? })`: 기본 2,200ms
- `error(message)`: error variant로 기본 3,200ms

`variant`는 `default`, `info`, `success`, `warning`, `error`다. 새 toast를 표시하면 현재 toast를 교체하며 빈 message는 무시된다.

### Icon

`Icon`은 Paseo가 가진 Lucide set에서 `name`, `size?`, `color?`로 icon을 렌더링한다. Plugin client가 `lucide-react-native`나 `react-native-svg`를 직접 import하지 않는다. 알 수 없는 이름은 아무것도 렌더링하지 않는다.

## 6. Timeline 항목 변환과 렌더링

Client timeline transformer는 daemon의 canonical 대화를 수정하지 않고, app이 projected history를 화면 모델로 바꾸는 단계에서 기존 한 항목을 Plugin 항목 0개 이상으로 교체한다.

1. `addTimelineTransformer`가 `query.itemType`으로 coarse match한다.
2. synchronous `transform({ item, phase })`이 상세 내용을 판별한다. `phase`는 `streaming` 또는 `complete`이며 live update에도 적용된다.
3. `addTimelineRenderer`가 `kind`, `version`, Zod `schema`가 맞는 Plugin 항목을 그린다.

`query.itemType`은 exact protocol의 `AgentTimelineItem["type"]`에서 선택한다. Tool call 인식 등 세부 판정은 callback 안에서 수행한다.

Transformer 반환값의 의미는 다음과 같다.

| 반환 | 결과 |
| --- | --- |
| `undefined` | 원래 timeline 항목 유지 |
| `{ items: [] }` | 화면 projection에서 원래 항목 숨김 |
| `{ items: [pluginItem] }` | Plugin renderer 한 개로 교체 |
| `{ items: [a, b, ...] }` | 여러 Plugin renderer로 교체 |

Plugin item의 `data`는 JSON-compatible이어야 한다. Transformer는 reconciliation 중 반복 실행되므로 synchronous, deterministic이어야 한다. 여러 transformer가 match하면 처음으로 결과를 반환한 transformer가 그 원본 항목을 소유한다.

Replacement에는 optional plugin-local `id`를 줄 수 있다. Renderer는 `agentId`, `item`, `timestamp`, `theme`, `host`, `layout`을 받는다. Streaming text의 속도를 맞추려면 `/client/react-native`의 `useRevealedText(text, phase)`를 사용한다.

### Durable timeline row

0.8에서는 server handler가 `paseo.agents.ref(agentId).timeline.append({ type: "plugin", id, kind, version, data })`로 **새 plugin-owned canonical row**를 기록할 수 있다. 이는 기존 항목의 화면 변환과 별도 경로다.

- `id`는 필수 plugin-local 식별자다. 같은 plugin과 ID를 다시 쓰면 최신 값으로 교체된다.
- `kind`, 양의 정수 `version`과 JSON `data`는 client renderer의 계약과 맞아야 한다. 직렬화한 `data`는 최대 64 KiB다.
- Plugin server session만 호출할 수 있고 daemon이 호출자의 `pluginId`를 부여한다. 일반 client session에서 직접 호출하지 않는다.
- Row는 live로 보이고 refetch 후에도 유지된다. Renderer가 없으면 unavailable row로 표시된다.
- 기존 사용자·assistant 대화를 임의로 수정하거나 다른 플러그인의 row를 위조하는 API는 아니다.

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

// client entry (source는 shared/에서 import)
client.addAttachmentSource(source);
```

Server entry에는 `server.handle(searchTickets, searchTicketsOnServer)`를 별도로 등록한다. `defineAttachmentSource`와 `defineRpc`는 `@getpaseo/plugin`에서 가져온다.

검색 RPC의 각 item은 `id`, `identifier`, `title`, optional `subtitle`, `url`, `text`, `resourceType`을 반환한다. Paseo가 Composer menu, picker, selected pill, draft와 submission을 소유하고, Plugin은 검색과 snapshot 내용을 소유한다.

같은 source가 여러 host에 있어도 Sidebar처럼 합쳐지지 않는다. Composer가 속한 host 범위에서만 보인다.

## 8. App Theme

`addTheme`은 Settings → Appearance에 light 또는 dark theme를 추가한다.

```ts
client.addTheme({
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

## 9. Settings 화면과 공개 컴포넌트

`client.addSettingsScreen({ id, title, icon, Component })`는 Settings → Plugins → 해당 플러그인 아래에 화면을 등록한다. Component는 `PluginSurfaceProps`를 받으며 header·뒤로가기·safe area·scroll·중앙 column은 Paseo가 소유한다. Compact에서는 전체 화면 detail, wide에서는 settings sidebar를 유지한다. `client.openSettings(id)` 또는 Command Center의 `openSettings(id)`로 같은 설치의 화면을 연다. 기존 native 설정 → 사용량으로 이동하는 범용 API는 아니다.

`@getpaseo/plugin/client/ui`에서 다음 공개 컴포넌트를 사용할 수 있다.

| 컴포넌트 | 역할 |
| --- | --- |
| `SettingsGroup`, `SettingsSection` | 제목·설명·trailing 영역과 섹션 간격 |
| `SettingsCard` | 카드 surface와 직접 자식 행 사이 divider |
| `SettingsRow` | label·hint·error와 custom control |
| `SettingsSwitch` | boolean 값과 `onValueChange` |
| `SettingsSelect` | string 값·options와 `onValueChange` |
| `SettingsInput` | `initialValue`, `onChangeText`, optional ref로 draft input |
| `SettingsAction` | `actionLabel`, `onPress`, optional disabled |

`SettingsInput`은 입력 중인 text를 자체 소유한다. `initialValue`는 mount 시 초기값이며 controlled `value` prop은 없다. Ref의 `focus`, `blur`, `getText`, `replaceText`를 필요한 경우 사용한다. Draft와 저장 값은 분리한다.

UI 컴포넌트는 내장 저장과 독립적이다. Host 동기화가 필요하면 `defineSettings` → `server.registerSettings` → `useSettings`를 연결하고 loading/invalid/error/충돌을 처리한다. 저장·reset·remove의 조건은 [설정 저장 계약](backend-and-sdk.md#host-단위-설정-저장)을 따른다. 새 설정 화면은 [Design](../DESIGN.md)의 D 등급 검수를 적용한다.

## 10. Client slash command

`client.addSlashCommand({ name, description, argumentHint, context, onSubmit })`는 Composer의 `/name args`를 client에서 실행한다. `context`는 workspace 또는 agent이며 global은 없다. Callback은 같은 문맥의 Command Center capability와 `args`를 받는다. Slash 명령 자체는 provider turn을 만들거나 입력 text를 Agent에게 전송하지 않는다.

Paseo가 autocomplete·입력 지우기·error toast를 처리한다. Callback 완료 대기나 pending UI는 제공하지 않으므로 긴 작업은 panel/pill에 상태를 표시한다. Attachment가 있는 Composer에서는 실행되지 않는다. Built-in 명령·alias, plugin, provider 순으로 우선하며 plugin 간 충돌은 stable catalog 순서의 첫 등록이 우선한다. `name`에 `/`를 붙이지 않고 인자 parsing은 플러그인이 맡는다.

## 등록 ID와 Icon

Plugin, surface, Sidebar item, panel, Command Center item, attachment source와 slash command ID는 소문자로 시작하고 소문자·숫자·하이픈으로 구성한다. Contribution의 `icon` 필드는 Lucide icon 이름을 사용한다.

## 관련 문서

- [실전 사용 예시](examples.md)
- [전체 기능표](README.md)
- [Backend와 Paseo SDK](backend-and-sdk.md)
- [지원 경계](limitations.md)
- [v0.8 공식 Plugin reference](https://paseo.sh/docs/plugins/v0.8/reference)
