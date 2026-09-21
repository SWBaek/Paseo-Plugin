# 지원 경계

이 문서는 “화면에서 보이게 만들 수 있다”와 “Paseo가 그 위치를 정식 Plugin slot으로 공개했다”를 구분한다. 기준은 **Paseo 0.9.0-beta.2** 공식 문서와 exact SDK declaration이다. 플러그인별 소스 버전은 [호환성 기록](../COMPATIBILITY.md)을 따르며, 이 표는 앱 실행 인증이 아니다.

## 판정 기준

| 판정 | 의미 |
| --- | --- |
| 직접 지원 | Paseo가 등록·수명주기·배치까지 소유하는 공개 Plugin API가 있다. |
| 조합 가능 | 공개 surface/panel/modal 안에서 React Native UI나 backend RPC를 조합해 구현한다. App의 새 slot이 생기는 것은 아니다. |
| 제한적 지원 | 비슷한 정식 slot은 있으나 위치·형태·동작이 Paseo 계약으로 제한된다. |
| 공개 API 없음 | 생성된 선언에 해당 contribution이나 host capability가 없다. 내부 구현에 의존하지 않는다. |

## UI 위치와 동작 판정표

| 요구 사항 | 판정 | 구현 또는 대안 |
| --- | --- | --- |
| 좌측 Sidebar에 메뉴 추가 | 직접 지원 | `addSurface` + `addSidebarItem` |
| Sidebar에서 여는 전용 전체 화면 | 직접 지원 | `addSurface` |
| Sidebar submenu, group, 순서, badge | 공개 API 없음 | Sidebar contribution에는 `id`, `title`, `icon`, `surface`만 있다. 사용자는 Appearance에서 top-level 항목을 재정렬·숨길 수 있다. |
| Workspace 탭 추가 | 직접 지원 | workspace-context `addWorkspacePanel` |
| 특정 Agent 탭 추가 | 직접 지원 | agent-context `addWorkspacePanel` |
| Explorer에 panel 추가 | 직접 지원 | panel의 `locations`에 `"explorer"` 선언 |
| Command palette action | 직접 지원 | global/workspace/agent `addCommandCenterItem` |
| 사용자 지정 keyboard shortcut | 공개 API 없음 | Command Center 검색 action으로 제공 |
| 채팅 입력창 위 버튼 | 제한적 지원 | client entry의 `addComposerPill`; Composer track bar의 표준 pill로만 추가 |
| 입력창 내부 또는 전송 버튼 옆 임의 control | 공개 API 없음 | Composer pill 또는 별도 panel/modal 사용 |
| 외부 이슈·문서 검색 첨부 | 직접 지원 | `addAttachmentSource` + search RPC |
| 기존 대화/Tool call을 custom card로 표시 | 직접 지원 | timeline transformer + renderer |
| 기존 timeline 항목 숨김 | 직접 지원 | transformer에서 `{ items: [] }` 반환 |
| 기존 항목 하나를 여러 card로 분리 | 직접 지원 | transformer에서 여러 Plugin item 반환 |
| 새 plugin-owned timeline row 삽입·갱신 | 직접 지원 | server `agent.timeline.append`; plugin-local ID로 갱신, data 최대 64 KiB |
| provider turn 없는 Composer slash command | 직접 지원 | client `addSlashCommand`; workspace/agent 문맥 |
| 기존 사용자·assistant canonical 대화 임의 수정 | 공개 API 없음 | 기존 row의 projection 변환과 자기 plugin row append를 구분 |
| Modal/dialog/bottom sheet | 직접 지원 | mounted client component에서 controlled `Modal` 사용 |
| 화면이 하나도 열리지 않은 상태에서 전역 Modal 강제 표시 | 공개 API 없음 | Surface/panel/pill callback을 통해 사용자가 연 UI에서 Modal 표시 |
| Toast | 직접 지원 | mounted client component에서 `useToast` |
| OS push/system notification | 공개 API 없음 | Plugin UI의 Toast 또는 상태 표시 사용 |
| App Theme 추가 | 직접 지원 | `addTheme`; Appearance 설정에 light/dark theme 추가 |
| Plugin 전용 Settings page 등록 | 직접 지원 | `addSettingsScreen`, `openSettings`, `/client/ui` 컴포넌트 |
| Workspace header button 추가 | 직접 지원 | `addHeaderButton({ id, workspaceId, button })`; host 지정 위치·compact/overflow 정책 적용 |
| 임의 context menu 항목 추가 | 공개 API 없음 | Surface/panel 안의 자체 menu 또는 button 사용 |
| 선택 host의 Agent 또는 Workspace 열기 | 직접 지원 | Surface/panel의 optional `navigation.openAgent` 또는 `navigation.openWorkspace`; capability가 없으면 관련 action을 숨김 |
| 그 밖의 Paseo native route로 임의 navigation | 공개 API 없음 | 같은 Plugin의 `openSurface`·`openPanel`·`openSettings` 또는 공개된 Agent/Workspace navigation만 사용 |
| 외부 웹페이지 열기 | 조합 가능 | Plugin component에서 React Native `Linking` 사용; native Paseo route 이동과는 다름 |
| Lucide icon 사용 | 직접 지원 | host `Icon` 또는 contribution의 icon 이름 사용 |
| DOM 기반 UI/웹 전용 component | 지원하지 않음 | React Native UI 사용. 필요한 browser API만 `client/web.ts`에서 Platform 분기와 native 대안 제공 |
| Modal body·scroll·keyboard 제어 | 직접 지원 | `Modal.Content`, host `ScrollView`/`FlatList`/`TextInput` |
| 현재 client clipboard 복사 | 직접 지원 | `copyText`; 권한 거부·사용 불가 실패 처리 |

## Data와 Backend 판정표

| 요구 사항 | 판정 | 구현 또는 대안 |
| --- | --- | --- |
| 선택 host의 Project 조회·구독 | 직접 지원 | `PaseoApi.projects.list`·`subscribe`; Git 파일 변경 watcher는 아님 |
| Workspace 생성·조회·archive·title 변경 | 직접 지원 | `PaseoApi.workspaces` |
| Agent 생성·prompt 전송·상태/Timeline 구독 | 직접 지원 | `PaseoApi.agents` |
| Provider/model/mode/feature 조회 | 직접 지원 | `PaseoApi.providers` |
| Provider 계획 사용량 window·balance 조회 | 직접 지원 | `paseo.providers.listUsage()`; 지원 host 필요, 실제 provider 범위와 refresh 정책은 검증 |
| daemon config 조회·수정 | 직접 지원 | `PaseoApi.config`; host 전체 영향에 주의 |
| 별도 Paseo connection 생성 | 지원하지 않음 | `usePaseo` 또는 주입된 `paseo`를 사용 |
| 현재 workspace/agent 문맥 조회용 RPC | 불필요하며 권장하지 않음 | Panel/Pill props의 ID와 `useWorkspace`/`useAgent` 사용 |
| daemon filesystem 접근 | 직접 지원 | `server/` RPC handler에서 Node API 사용 |
| child process/CLI 실행 | 직접 지원 | daemon RPC handler에서 실행하고 allowlist·timeout·abort·출력 제한 설계 |
| 자격 증명이나 token 사용 | 조합 가능 | secret은 daemon-side handler에 두고 client/log로 보내지 않음 |
| 외부 REST/GraphQL API 호출 | 조합 가능 | daemon-side RPC 권장; client에는 필요한 결과만 반환 |
| Host 단위 typed 설정 저장 | 직접 지원 | `defineSettings`·`registerSettings`·`useSettings`; revision 충돌 처리 |
| 범용 DB·영속 작업 큐·secret vault | 직접 API 없음 | 필요 시 별도 server 저장 설계. 내장 Settings는 일반 JSON |
| Provider 등록·ACP 연동 | 직접 지원 | server `registerProvider`, `/server/provider`, `/server/acp` |
| Agent/Workspace lifecycle 관찰·생성 변환 | 직접 지원 | server `on`, `before`; live 이벤트, replay·자동 retry 없음 |
| Pending permission 응답 | 직접 지원 | `agent.respondToPermission`; 정책·중복 응답 처리 필요 |
| Terminal 생성·입력·capture·종료 | 직접 지원 | `paseo.terminals`와 workspace terminal handle |
| 모든 Paseo client가 공유하는 browser storage | 공개 API 없음 | `localStorage`는 web 전용이며 client 간 공유되지 않음 |
| Plugin 간 직접 호출·화면 열기 | 공개 API 없음 | 같은 Plugin의 surface/panel/settings/RPC만 대상으로 사용 |
| 다른 연결 host에 직접 명령 | 공개 API 없음 | 현재 선택/Composer host에만 API와 RPC가 묶임 |
| Plugin 수명 동안 timer/watcher/socket | 조합 가능 | daemon 또는 headless client에서 만들고 cleanup에서 해제 |
| Paseo schedule API 사용 | Plugin `PaseoApi`에 없음 | 별도 backend timer 또는 사용자가 관리하는 Paseo schedule과 역할 분리 |

## “버튼 추가”를 해석하는 방법

버튼의 목적보다 **Paseo가 공개한 위치**를 먼저 고른다.

| 사용자에게 언제 보여야 하는가 | 권장 위치 |
| --- | --- |
| App 어디서든 검색해 실행 | global Command Center item |
| 현재 Workspace에서만 실행 | workspace Command Center item 또는 workspace panel |
| 현재 Agent에서만 실행 | agent Command Center item 또는 agent panel |
| prompt를 쓰는 동안 항상 가까이 노출 | Composer pill |
| 여러 control과 결과 화면이 필요 | Sidebar surface 또는 workspace/agent panel |
| 입력 명령으로 바로 실행 | Composer slash command |
| 여러 client가 공유하는 Plugin 설정 | Settings screen + host settings |
| 짧은 확인/입력 flow | 위 위치에서 여는 Modal |
| 완료·오류만 알림 | Toast |

## Plugin이 소유하는 것과 Paseo가 소유하는 것

| Paseo 소유 | Plugin 소유 |
| --- | --- |
| Route, header, close action, host picker | Surface/panel 본문 |
| Sidebar placement와 multi-host 병합 | 항목의 ID, title, icon, 연결할 surface |
| Workspace tab focus, split, persistence | Panel component와 표시 데이터 |
| Composer pill pressable, chrome, pending/error, placement | Pill 생성 조건, icon/text, callback |
| Attachment menu, picker, draft, selected pill, submission | 검색 backend와 text snapshot |
| Modal frame, header, dismissal interaction | Controlled open state와 content |
| Timeline canonical row 저장·projection lifecycle | 기존 항목 변환, 자기 plugin row ID·payload·renderer |
| Settings route·host 저장·revision 검증 | Schema·migration·draft·충돌 UX |
| Plugin query client와 error boundary | Query key/data와 loading/empty/error UI |

이 경계를 넘는 내부 app store, router, non-public module import는 현재 동작하더라도 Plugin 계약으로 보지 않는다.

## Version drift와 유지되는 경계

0.8의 새 기능은 현재 플러그인에 자동 등록되지 않는다. Provider Usage의 공식 usage SDK 조회·표시 Settings, Branch Garden의 읽기 전용 Git allowlist는 별도 제품 계약이다. Lifecycle·Terminal·permission·provider API가 생겼다는 이유로 쓰기 동작을 추가하지 않는다.

Settings는 host·설치 범위이며 remove 시 삭제된다. User/device/cross-host 동기화나 secret vault를 제공하지 않는다. Durable timeline도 일반 이벤트 bus가 아니고 lifecycle hook도 영속 작업 큐가 아니다.

`requirements.paseo`는 daemon과 app에서 각각 검사한다. Beta 버전은 stable core에 맞는 범위를 만족할 수 있다. Manifest의 권장 범위 `^0.9.0`은 0.9.0-beta를 포함하며, SDK dependency는 exact 0.9.0-beta.2로 고정해 대조한다. `^0.8.0`은 0.9에서 거부된다. 현재 source dependency는 플러그인별 catalog와 package에 기록한다. Manifest만 추가하거나 ambient declaration으로 신 API를 만들어내지 않는다. [이관 안내](../MIGRATION_0.9.md)와 [호환성 기록](../COMPATIBILITY.md)을 확인한다.

## 관련 문서

- [실전 사용 예시](examples.md)
- [전체 기능표](README.md)
- [UI 기여 지점](ui-contributions.md)
- [Backend와 Paseo SDK](backend-and-sdk.md)
- [Plugin reference](https://paseo.sh/docs/plugins/reference)
