# Paseo Plugin Capabilities

이 문서는 **Paseo CLI와 daemon `0.7.0-beta.2`**에서 공개 Plugin API로 구현할 수 있는 기능과 그 경계를 정리한 버전 스냅샷이다.

- 조사일: 2026-08-31 (Asia/Seoul)
- 확인한 CLI: `paseo --version` → `0.7.0-beta.2`
- 확인한 daemon: `paseo daemon status --json` → `daemonVersion: 0.7.0-beta.2`
- 계약 기준: 현재 CLI로 새로 실행한 `paseo plugin init`이 생성한 `paseo-plugin.d.ts`
- 문서 기준: Paseo upstream의 [`v0.7.0-beta.2` Plugin reference](https://github.com/getpaseo/paseo/blob/v0.7.0-beta.2/public-docs/plugins/reference.md)와 [`v0.7.0-beta.2` Plugin guide](https://github.com/getpaseo/paseo/blob/v0.7.0-beta.2/docs/plugins.md)

Plugin API는 실험 단계다. 이 문서와 현재 배포된 공식 문서가 다르면, **대상 daemon과 같은 버전의 CLI가 새로 생성한 선언 파일**을 컴파일 가능 여부의 최종 기준으로 삼는다.

## 결론부터 보기

질문에 든 세 가지 예시는 모두 다음 범위에서 지원된다.

| 원하는 기능 | `0.7.0-beta.2` 지원 | 공개 API와 실제 범위 |
| --- | --- | --- |
| 좌측 Sidebar에 메뉴 추가 | 지원 | `addSurface`로 화면을 등록하고 `addSidebarItem`으로 연결한다. 여러 host에 같은 기여가 있으면 한 항목과 host picker로 합쳐진다. |
| Modal 표시 | 지원 | 클라이언트 컴포넌트에서 `@getpaseo/plugin/react-native`의 controlled `Modal`을 사용한다. compact에서는 bottom sheet, 그 외에는 중앙 dialog로 표시된다. |
| 채팅 입력창 위에 버튼 추가 | 제한적으로 지원 | `addClientSide`와 `addComposerPill`로 특정 workspace/agent의 Composer track bar에 pill 형태 버튼을 추가한다. 임의 위치·임의 chrome의 Composer 버튼을 삽입하는 API는 아니다. |

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

- [UI 기여 지점](ui-contributions.md): 각 UI 위치, 등록 필드, 열기 방식과 렌더링 책임
- [Backend와 Paseo SDK](backend-and-sdk.md): RPC, Node 접근, SDK 동작, hook, runtime과 lifecycle
- [지원 경계](limitations.md): 직접 지원·조합 가능·공개 API 없음의 구분과 대안

## 버전 및 선언 파일 주의사항

이 저장소에 추적 중인 네 플러그인의 `paseo-plugin.d.ts`는 서로 같은 이전 스냅샷이며, 현재 `0.7.0-beta.2` CLI가 새로 생성하는 계약보다 오래됐다. 기존 파일에는 다음 항목이 없다.

- `@getpaseo/plugin/react-native`의 `Modal`, `Icon`, `useToast`
- `PluginClientContext`와 `PluginComposerPillContribution`
- `PluginContext.addClientSide`

따라서 기존 플러그인에서 이 기능을 사용하려면 임의로 ambient type을 덧붙이지 말고, 현재 CLI가 생성한 새 scaffold와 기존 플러그인을 대조해 생성 계약을 갱신해야 한다.

또한 현재 CLI가 만든 새 `package.json`의 typecheck용 `@getpaseo/client` 범위는 `^0.4.0`, `@getpaseo/protocol` 범위는 `^0.6.1`이다. 반면 같은 upstream tag의 SDK package는 `0.7.0-beta.2`이며 더 넓은 `PaseoApi`를 선언한다. SDK의 세부 메서드를 구현할 때는 workspace에 실제 설치된 dev dependency type도 확인하고, dependency 계약 정합성 변경은 Plugin source 변경과 별도로 검증한다.

반대로 현재 배포된 웹 문서는 `v0.7.0-beta.2` 이후 기능을 포함할 수 있다. 예를 들어 배포 문서의 일부 `navigation` 설명은 이 버전의 새 생성 선언에 없으므로 이 문서에서는 지원 기능으로 세지 않았다.

## 다시 조사할 때

Paseo를 업데이트한 뒤 다음 순서로 이 문서를 갱신한다.

1. CLI와 daemon 버전을 각각 확인한다.
2. 빈 임시 디렉터리에 `paseo plugin init <absolute-directory> --id capability-probe`를 실행한다.
3. 새 `paseo-plugin.d.ts`의 `PluginContext`, `PluginClientContext`, `@getpaseo/plugin/react-native` 공개 심벌을 이전 스냅샷과 비교한다.
4. 같은 버전 tag의 Plugin guide/reference와 현재 배포 문서를 대조한다.
5. 기능표와 [지원 경계](limitations.md)를 함께 갱신한다.

## 참고 자료

- [Paseo `v0.7.0-beta.2` Plugin reference](https://github.com/getpaseo/paseo/blob/v0.7.0-beta.2/public-docs/plugins/reference.md)
- [Paseo `v0.7.0-beta.2` Plugin guide](https://github.com/getpaseo/paseo/blob/v0.7.0-beta.2/docs/plugins.md)
- [현재 배포된 Plugin quickstart](https://paseo.sh/docs/plugins)
- [현재 배포된 Plugin reference](https://paseo.sh/docs/plugins/reference)
- [Paseo TypeScript SDK reference](https://paseo.sh/docs/sdk/reference)
