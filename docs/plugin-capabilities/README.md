# Paseo Plugin Capabilities

이 문서는 **Paseo CLI와 daemon `0.7.2`**에서 공개 Plugin API로 구현할 수 있는 기능과 그 경계를 정리한 버전 스냅샷이다.

- 조사일: 2026-09-04 (Asia/Seoul)
- 확인한 CLI: `paseo --version` → `0.7.2`
- 확인한 daemon: `paseo daemon status --json` → `daemonVersion: 0.7.2`
- 계약 기준: 현재 CLI의 fresh scaffold와 exact `@getpaseo/plugin@0.7.2` package declaration
- 문서 기준: Paseo upstream의 [`v0.7.2` Plugin reference](https://github.com/getpaseo/paseo/blob/v0.7.2/public-docs/plugins/reference.md)와 [`v0.7.2` Plugin guide](https://github.com/getpaseo/paseo/blob/v0.7.2/public-docs/plugins/index.md)

Plugin API는 실험 단계다. 이 문서와 현재 배포된 공식 문서가 다르면, **대상 daemon과 같은 exact 버전의 fresh scaffold와 `@getpaseo/plugin` package declaration**을 컴파일 가능 여부의 최종 기준으로 삼는다.

## 결론부터 보기

대표 기능은 다음 범위에서 지원된다.

| 원하는 기능 | `0.7.2` 지원 | 공개 API와 실제 범위 |
| --- | --- | --- |
| 좌측 Sidebar에 메뉴 추가 | 지원 | `addSurface`로 화면을 등록하고 `addSidebarItem`으로 연결한다. 여러 host에 같은 기여가 있으면 한 항목과 host picker로 합쳐진다. |
| Modal 표시 | 지원 | 클라이언트 컴포넌트에서 `@getpaseo/plugin/react-native`의 controlled `Modal`을 사용한다. compact에서는 bottom sheet, 그 외에는 중앙 dialog로 표시된다. |
| 채팅 입력창 위에 버튼 추가 | 제한적으로 지원 | `addClientSide`와 `addComposerPill`로 특정 workspace/agent의 Composer track bar에 pill 형태 버튼을 추가한다. 임의 위치·임의 chrome의 Composer 버튼을 삽입하는 API는 아니다. |
| Plugin 화면에서 Agent·Workspace 열기 | 지원 | Surface와 workspace/agent panel의 optional `navigation`으로 선택 host의 Agent 또는 Workspace를 연다. 이전 client에서는 capability가 없으므로 관련 action을 숨긴다. |

> 먼저 아이디어를 보고 싶다면 [실전 사용 예시](examples.md)에서 대시보드, 리뷰 도구, Composer 버튼, Issue 첨부, Timeline 카드 같은 결과물을 확인한다.

## 전체 기능표

| 영역 | 만들 수 있는 것 | 핵심 API | 분류 |
| --- | --- | --- | --- |
| 전역 화면 | Plugin이 본문 전체를 소유하는 cross-platform 화면 | `addSurface` | 공식 기여 지점 |
| 좌측 Sidebar | 전역 화면으로 이동하는 Sidebar 항목 | `addSidebarItem` | 공식 기여 지점 |
| Workspace 탭 | Workspace 단위의 탭 또는 Explorer 패널 | `addWorkspacePanel({ context: "workspace" })` | 공식 기여 지점 |
| Agent 탭 | 특정 Agent에 결합된 탭 또는 Explorer 패널 | `addWorkspacePanel({ context: "agent" })` | 공식 기여 지점 |
| Command Center | global/workspace/agent 문맥의 검색형 명령 | `addCommandCenterItem` | 공식 기여 지점 |
| Composer 버튼 | 특정 Agent의 Composer track bar에 pill 버튼 | `addClientSide`, `addComposerPill` | 공식 기여 지점 |
| Composer 첨부 | 외부 이슈·문서 등을 검색해 prompt에 text snapshot으로 첨부 | `defineAttachmentSource`, `addAttachmentSource` | 공식 기여 지점 |
| 대화 Timeline | 기존 timeline 항목을 감추거나 하나 이상의 Plugin 카드로 교체 | `addTimelineTransformer`, `addTimelineRenderer` | 공식 기여 지점 |
| Modal | Plugin UI 위의 dialog 또는 compact bottom sheet | `Modal` | Host 제공 UI |
| Toast | default/info/success/warning/error 피드백 | `useToast` | Host 제공 UI |
| Icon | Paseo에 설치된 Lucide icon 렌더링 | `Icon` | Host 제공 UI |
| App Theme | Settings → Appearance에 light/dark theme 추가 | `addTheme` | 공식 기여 지점 |
| Paseo 조작 | Project 조회, Workspace·Agent 제어, Provider 조회, daemon config 조회·수정 | `usePaseo`, callback/handler의 `paseo` | Host SDK |
| Host navigation | 선택 host의 Agent 또는 Workspace 열기 | Surface/panel props의 optional `navigation.openAgent`, `navigation.openWorkspace` | Host 제공 UI capability |
| Plugin backend | 파일·프로세스·자격 증명·외부 API·로컬 DB 같은 daemon 측 동작 | `defineRpc`, `handle`, `useRpc` | 공식 backend 경로 |
| Headless client | 화면을 열지 않아도 app 연결 동안 구독·상태·Composer pill 수명주기 관리 | `addClientSide` | 공식 기여 지점 |
| 외부 URL | Plugin 컴포넌트 안에서 React Native API로 시스템 브라우저 호출 | `react-native`의 `Linking` 등 | 기여 UI 안에서 조합 |
| 임의 App UI 삽입 | Header, Toolbar, Settings 화면, Context menu, 임의 Composer 위치 | 해당 API 없음 | 직접 지원하지 않음 |

## `PluginContext` 공개 계약 전수 목록

현재 CLI가 새로 생성한 선언의 `PluginContext`에는 아래 메서드만 있다.

| 메서드 | 실행 측 | 역할 |
| --- | --- | --- |
| `handle(contract, handler)` | daemon subprocess | Zod RPC 계약에 backend handler를 연결한다. |
| `addSurface(id, Component)` | client | 전역 Plugin 화면을 등록한다. |
| `addSidebarItem(contribution)` | client | 등록된 surface로 이동하는 Sidebar 항목을 등록한다. |
| `addWorkspacePanel(contribution)` | client | workspace 또는 agent 문맥의 탭/Explorer 패널을 등록한다. |
| `addCommandCenterItem(contribution)` | client | global/workspace/agent 문맥의 명령을 등록한다. |
| `addClientSide(contribution)` | client | app 연결 수명주기를 따르는 headless client entrypoint를 등록한다. |
| `addAttachmentSource(contribution)` | client + RPC | Composer의 외부 resource 검색·첨부 source를 등록한다. |
| `addTheme(contribution)` | client | light 또는 dark app theme를 등록한다. |
| `addTimelineTransformer(contribution)` | client | 기존 projected timeline 항목을 Plugin 항목으로 변환한다. |
| `addTimelineRenderer(contribution)` | client | 변환된 Plugin timeline 항목의 React Native renderer를 등록한다. |

`PluginContext` 밖에서 사용할 수 있는 공개 도구는 `defineRpc`, `defineAttachmentSource`, `Icon`, `Modal`, `useToast`, `useRpc`, `usePaseo`, `useWorkspace`, `useAgent`와 `PluginClientContext.addComposerPill`이다.

## 문서 구성

- [실전 사용 예시](examples.md): 무엇을 만들 수 있는지 보여주는 아이디어와 최소 코드 조각
- [UI 기여 지점](ui-contributions.md): 각 UI 위치, 등록 필드, 열기 방식과 렌더링 책임
- [Backend와 Paseo SDK](backend-and-sdk.md): RPC, Node 접근, SDK 동작, hook, runtime과 lifecycle
- [지원 경계](limitations.md): 직접 지원·조합 가능·공개 API 없음의 구분과 대안

## 버전 및 package contract 주의사항

이 저장소의 모든 workspace는 exact `@getpaseo/plugin@0.7.2` package declaration으로 타입 검사한다. 이 계약은 host UI, Composer pill과 host navigation을 포함하며, `0.7.2` fresh scaffold는 별도 ambient declaration 파일을 생성하지 않는다.

- `@getpaseo/plugin/react-native`의 `Modal`, `Icon`, `useToast`
- `PluginClientContext`와 `PluginComposerPillContribution`
- `PluginContext.addClientSide`
- `PluginSurfaceProps`, `PluginWorkspacePanelProps`, `PluginAgentPanelProps`의 optional `navigation`

`@getpaseo/plugin@0.7.2`는 호환되는 client와 protocol package를 peer dependency로 선언한다. `branch-garden`만 `@getpaseo/client` type을 직접 import하므로 exact `@getpaseo/client@0.7.2`를 별도로 선언하고, 나머지 workspace는 plugin package의 공개 계약을 사용한다. 앞으로 Paseo 버전을 올릴 때도 ambient type을 임의로 덧붙이지 말고 현재 CLI의 fresh scaffold, exact package declaration과 기존 플러그인을 함께 대조한다.

현재 CLI가 만든 새 `package.json`은 `@getpaseo/plugin`을 CLI와 같은 exact 버전으로 선언한다. 이 저장소도 설치된 CLI·daemon과 정확히 맞추기 위해 모든 workspace에서 `0.7.2`로 고정한다.

`v0.7.2` tag의 Plugin reference에는 “general host navigation API가 없다”는 이전 문장이 남아 있지만, 같은 문서의 surface/panel 계약과 package declaration은 제한된 `navigation` capability를 명시한다. 따라서 이를 임의 native route용 범용 API가 없다는 뜻으로 해석하고, 공개된 `openAgent`와 `openWorkspace`만 지원 기능으로 센다.

## 다시 조사할 때

Paseo를 업데이트한 뒤 다음 순서로 이 문서를 갱신한다.

1. CLI와 daemon 버전을 각각 확인한다.
2. 빈 임시 디렉터리에 `paseo plugin init <absolute-directory> --id capability-probe`를 실행한다.
3. fresh scaffold가 설치한 exact `@getpaseo/plugin` package declaration의 `PluginContext`, `PluginClientContext`, `@getpaseo/plugin/react-native` 공개 심벌을 이전 스냅샷과 비교한다.
4. 같은 버전 tag의 Plugin guide/reference와 현재 배포 문서를 대조한다.
5. 기능표와 [지원 경계](limitations.md)를 함께 갱신한다.

## 참고 자료

- [Paseo `v0.7.2` Plugin reference](https://github.com/getpaseo/paseo/blob/v0.7.2/public-docs/plugins/reference.md)
- [Paseo `v0.7.2` Plugin guide](https://github.com/getpaseo/paseo/blob/v0.7.2/public-docs/plugins/index.md)
- [현재 안정판 Plugin quickstart](https://paseo.sh/docs/plugins/v0.7)
- [현재 안정판 Plugin reference](https://paseo.sh/docs/plugins/v0.7/reference)
- [Paseo TypeScript SDK reference](https://paseo.sh/docs/sdk/reference)
