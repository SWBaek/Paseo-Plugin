# Paseo Plugin Capabilities

이 문서는 **Paseo `0.9.0-beta.2`**의 공개 플러그인 계약을 정리한다. 플러그인별 소스 이관 상태와 기존 배포 태그의 대상 버전은 [호환성 기록](../COMPATIBILITY.md)을 따른다. 이 기능표는 0.9 실행 검증 결과나 배포 플러그인 목록이 아니다. 유지보수 대상은 [Branch Garden과 Provider Usage](../../README.md#plugins) 두 개이며, 0.9 이관은 [#121](https://github.com/NaruForge/Paseo-Plugin/issues/121)에서 추적한다.

- 대조일: 2026-09-21 (Asia/Seoul)
- 문서: [quickstart](https://paseo.sh/docs/plugins), [reference](https://paseo.sh/docs/plugins/reference), [0.9 이관](../MIGRATION_0.9.md), [provider guide](https://paseo.sh/docs/plugins/providers)
- 정적 계약: npm에 배포된 exact `@getpaseo/plugin`, `@getpaseo/client`, `@getpaseo/protocol` **0.9.0-beta.2**의 선언
- 검증 한계: 이번 조사는 문서·package 정적 대조다. 기능표 자체는 실행 인증이 아니다. CLI init·compiler 및 플러그인 검증은 [0.9 기록](../verification/paseo-0.9.0-beta.2.md)에서 구분한다.

공식 문서도 후속 버전에서 바뀔 수 있다. 실제 구현에서는 대상 CLI가 생성한 fresh scaffold와 같은 exact SDK 선언을 다시 대조한다. 현재 0.7 소스를 유지보수할 때는 [v0.7 reference](https://paseo.sh/docs/plugins/v0.7/reference)를 사용한다.

## 0.7에서 먼저 바뀌는 계약

| 항목 | 0.8 계약 |
| --- | --- |
| 진입점 | `index.client.tsx`와 `index.server.ts`; 필요한 쪽만 생성하되 최소 하나 필요. `.ts`/`.tsx` 허용 |
| 모듈 위치 | `client/`, `server/`, `shared/`가 compiler 경계. 예전 파일 suffix만으로 구분하지 않음 |
| Client API | `@getpaseo/plugin/client`의 `PluginClientContext`, 훅과 UI contribution 타입 |
| Server API | `@getpaseo/plugin/server`의 `PluginServerContext`, handler·lifecycle 타입 |
| 공유 API | `@getpaseo/plugin`의 `defineRpc`, `defineSettings`, `defineAttachmentSource`, `RpcInput`, `RpcOutput` |
| Host UI | `/client/react-native`와 `/client/ui`; 예전 `/react-native`, `/ui` 경로 제거 |
| Headless client | 별도 `addClientSide` 없이 client entry에서 등록·구독하고 cleanup 반환 |
| 호환성 선언 | `requirements.paseo` 누락은 `<0.8.0`으로 해석되어 0.8에서 거부됨 |

모든 이동·등록 변경과 저장소별 순서는 [0.8 이관 안내](../MIGRATION_0.8.md)를 따른다. Manifest 필드나 SDK 버전만 바꾸는 것으로 이관이 완료되지는 않는다.

## 전체 기능표

| 영역 | 만들 수 있는 것 | 공개 API·실행 측 |
| --- | --- | --- |
| 전역 화면·Sidebar | host를 선택해 여는 플러그인 화면 | client `addSurface`, `addSidebarItem` |
| Workspace·Agent panel | Workspace 탭과 Explorer panel | client `addWorkspacePanel` |
| Command Center | global/workspace/agent 검색형 명령 | client `addCommandCenterItem` |
| Composer pill | 특정 Agent track bar의 상태·버튼 | client `addComposerPill` |
| Header button | Workspace header의 지정 위치 | client `addHeaderButton` |
| Slash command | provider turn 없이 실행하는 Composer 명령 | client `addSlashCommand` |
| Composer 첨부 | 외부 resource 검색과 완전한 text snapshot | 공유 `defineAttachmentSource`, client `addAttachmentSource`, server RPC |
| Live timeline | 기존 항목의 streaming/complete 변환과 custom renderer | client `addTimelineTransformer`, `addTimelineRenderer`, `useRevealedText` |
| Durable timeline | 새 plugin-owned row를 영속 저장·갱신 | server handler의 `paseo.agents.ref(id).timeline.append` |
| Settings 화면 | Settings → Plugins 아래 설치별 화면 | client `addSettingsScreen`, `openSettings`, 공개 Settings 컴포넌트 |
| Settings 저장 | 같은 host의 client들이 공유하는 schema 기반 설정 | 공유 `defineSettings`, server `registerSettings`, client `useSettings` |
| Modal·clipboard | body 전체 layout, sheet scroll·input, 클립보드 복사 | `/client/react-native`의 `Modal`, `ScrollView`, `FlatList`, `TextInput`, `copyText` |
| Toast·Icon | 상태 피드백과 host Lucide icon | `/client/react-native`의 `useToast`, `Icon` |
| App theme | Appearance에 light/dark palette 추가 | client `addTheme` |
| 완전한 Provider | 자체 provider 또는 ACP adapter | server `registerProvider`, `/server/provider`, `/server/acp` |
| Lifecycle 관찰 | Agent 생성·turn·permission·archive, Workspace 생성·archive | server `on` |
| 생성·session 변환 | Agent config/env, session env, Workspace 생성 요청 조정 | server `before` |
| Paseo SDK | Project 구독, Workspace·Agent·Provider·config, Terminal 제어 | `usePaseo` 또는 주입된 `paseo` |
| Provider 계획 사용량 | host가 정규화한 subscription window·balance·detail | `paseo.providers.listUsage()`; 지원 host 필요 |
| Host navigation | 선택 host의 Agent·Workspace 열기 | Surface/panel의 optional `navigation` |
| 플러그인 backend | 파일·프로세스·자격 증명·외부 API | server handler + 공유 RPC 계약 |

설정 화면이나 Provider 등록이 추가됐어도 Workspace header에는 `addHeaderButton`이 있다. 임의 toolbar, context menu, Composer 내부 좌표를 지정하는 API는 없다. 기여 위치와 제약은 [지원 경계](limitations.md)를 확인한다.

## Entry context 등록 목록

exact 0.9.0-beta.2 선언에서 확인한 등록 메서드다. 대부분의 client `add*`는 idempotent 제거 함수를 반환한다. `addComposerPill`과 `addHeaderButton`은 `{ update, remove }` handle을 반환한다.

| Context | 등록 메서드 |
| --- | --- |
| `PluginClientContext` | `addSettingsScreen`, `addSurface`, `addSidebarItem`, `addWorkspacePanel`, `addCommandCenterItem`, `addSlashCommand`, `addComposerPill`, `addHeaderButton`, `addAttachmentSource`, `addTheme`, `addTimelineTransformer`, `addTimelineRenderer` |
| `PluginServerContext` | `handle`, `registerSettings`, `registerProvider`, `on`, `before` |

Client context에는 `paseo`, typed `rpc`, `openSurface`, `openSettings`, 명시적인 workspace/agent 문맥을 받는 `openPanel`도 있다. `useHosts`와 `getPaseoClient(serverId)`, `openExternalUrl`은 0.9에서 추가된 client helper다. Server의 `handle`·`registerProvider`는 `void`, `registerSettings`는 `{ read, subscribe }` handle, `on`·`before`는 제거 함수를 반환한다. 두 entry는 각각 cleanup을 반환한다.

## 문서 구성

- [실전 사용 예시](examples.md): 새 계약에 맞춘 예제와 기존 이슈 재검토 후보
- [UI 기여 지점](ui-contributions.md): 화면·panel·pill·slash·timeline·settings·modal
- [Backend와 Paseo SDK](backend-and-sdk.md): 런타임, RPC, 설정 저장, provider, lifecycle, SDK
- [지원 경계](limitations.md): 지원 범위와 여전히 없는 기여 위치
- [0.9 이관 안내](../MIGRATION_0.9.md): 현재 소스의 이관 순서와 검증·배포 조건
- [0.8 이관 안내](../MIGRATION_0.8.md): 0.8 runtime entry와 pill 계약 보존 기록

## 근거와 재대조

[0.9.0-beta.2 릴리스](https://github.com/getpaseo/paseo/releases/tag/v0.9.0-beta.2), [SDK 소스](https://github.com/getpaseo/paseo/tree/v0.9.0-beta.2/packages/plugin), [공식 예제](https://github.com/getpaseo/paseo/tree/v0.9.0-beta.2/plugin-examples)를 함께 사용한다. SDK root의 `PluginTheme` 같은 공유 타입과 client 전용 타입을 구분하며 type import에도 런타임 경계를 적용한다. `/client/host`는 앱 내부용이다.

후속 버전으로 올릴 때는 CLI·daemon·app 버전을 각각 기록하고 fresh scaffold, exact 선언, 공식 문서를 다시 비교한다. 타입 검사만으로 host compiler 경계나 runtime 호환성을 인증하지 않는다. 실제 증거는 [Compatibility](../COMPATIBILITY.md)에 연결한다.
