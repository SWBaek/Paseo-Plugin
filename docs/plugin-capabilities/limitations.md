# 지원 경계

이 문서는 “화면에서 보이게 만들 수 있다”와 “Paseo가 그 위치를 정식 Plugin slot으로 공개했다”를 구분한다. 기준은 Paseo `0.7.0` CLI가 새로 생성한 공개 type contract다.

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
| Sidebar submenu, group, 순서, badge | 공개 API 없음 | Sidebar contribution에는 `id`, `title`, `icon`, `surface`만 있다. |
| Workspace 탭 추가 | 직접 지원 | workspace-context `addWorkspacePanel` |
| 특정 Agent 탭 추가 | 직접 지원 | agent-context `addWorkspacePanel` |
| Explorer에 panel 추가 | 직접 지원 | panel의 `locations`에 `"explorer"` 선언 |
| Command palette action | 직접 지원 | global/workspace/agent `addCommandCenterItem` |
| 사용자 지정 keyboard shortcut | 공개 API 없음 | Command Center 검색 action으로 제공 |
| 채팅 입력창 위 버튼 | 제한적 지원 | `addClientSide` + `addComposerPill`; Composer track bar의 표준 pill로만 추가 |
| 입력창 내부 또는 전송 버튼 옆 임의 control | 공개 API 없음 | Composer pill 또는 별도 panel/modal 사용 |
| 외부 이슈·문서 검색 첨부 | 직접 지원 | `addAttachmentSource` + search RPC |
| 기존 대화/Tool call을 custom card로 표시 | 직접 지원 | timeline transformer + renderer |
| 기존 timeline 항목 숨김 | 직접 지원 | transformer에서 `{ items: [] }` 반환 |
| 기존 항목 하나를 여러 card로 분리 | 직접 지원 | transformer에서 여러 Plugin item 반환 |
| 원본 대화와 무관한 새 timeline row 삽입 | 공개 API 없음 | Timeline API는 기존 projected item의 교체만 지원 |
| daemon의 canonical chat history 수정 | 공개 API 없음 | UI projection만 변환하고 원본 row는 보존 |
| Modal/dialog/bottom sheet | 직접 지원 | mounted client component에서 controlled `Modal` 사용 |
| 화면이 하나도 열리지 않은 상태에서 전역 Modal 강제 표시 | 공개 API 없음 | Surface/panel/pill callback을 통해 사용자가 연 UI에서 Modal 표시 |
| Toast | 직접 지원 | mounted client component에서 `useToast` |
| OS push/system notification | 공개 API 없음 | Plugin UI의 Toast 또는 상태 표시 사용 |
| App Theme 추가 | 직접 지원 | `addTheme`; Appearance 설정에 light/dark theme 추가 |
| Plugin 전용 Settings page 삽입 | 공개 API 없음 | Plugin surface/panel 안에 자체 설정 UI 작성 |
| App top bar/header button 추가 | 공개 API 없음 | Paseo가 header를 소유한다. Command Center나 Composer pill 사용 |
| 임의 context menu 항목 추가 | 공개 API 없음 | Surface/panel 안의 자체 menu 또는 button 사용 |
| 선택 host의 Agent 또는 Workspace 열기 | 직접 지원 | Surface/panel의 optional `navigation.openAgent` 또는 `navigation.openWorkspace`; capability가 없으면 관련 action을 숨김 |
| 그 밖의 Paseo native route로 임의 navigation | 공개 API 없음 | 같은 Plugin의 `openSurface`·`openPanel` 또는 공개된 Agent/Workspace navigation만 사용 |
| 외부 웹페이지 열기 | 조합 가능 | Plugin component에서 React Native `Linking` 사용; native Paseo route 이동과는 다름 |
| Lucide icon 사용 | 직접 지원 | host `Icon` 또는 contribution의 icon 이름 사용 |
| DOM 기반 UI/웹 전용 component | 공개 API 없음 | React Native primitive로 구현하고 web global은 platform guard 뒤에서만 사용 |

## Data와 Backend 판정표

| 요구 사항 | 판정 | 구현 또는 대안 |
| --- | --- | --- |
| 선택 host의 Project 조회 | 직접 지원 | `PaseoApi.projects` |
| Workspace 생성·조회·archive·title 변경 | 직접 지원 | `PaseoApi.workspaces` |
| Agent 생성·prompt 전송·상태/Timeline 구독 | 직접 지원 | `PaseoApi.agents` |
| Provider/model/mode/feature 조회 | 직접 지원 | `PaseoApi.providers` |
| daemon config 조회·수정 | 직접 지원 | `PaseoApi.config`; host 전체 영향에 주의 |
| 별도 Paseo connection 생성 | 지원하지 않음 | `usePaseo` 또는 주입된 `paseo`를 사용 |
| 현재 workspace/agent 문맥 조회용 RPC | 불필요하며 권장하지 않음 | Panel/Pill props의 ID와 `useWorkspace`/`useAgent` 사용 |
| daemon filesystem 접근 | 직접 지원 | `*.server.ts` RPC handler에서 Node API 사용 |
| child process/CLI 실행 | 직접 지원 | daemon RPC handler에서 실행하고 allowlist·timeout·abort·출력 제한 설계 |
| 자격 증명이나 token 사용 | 조합 가능 | secret은 daemon-side handler에 두고 client/log로 보내지 않음 |
| 외부 REST/GraphQL API 호출 | 조합 가능 | daemon-side RPC 권장; client에는 필요한 결과만 반환 |
| Plugin 전용 persistent storage | 공개 API 없음 | daemon-side file/DB를 직접 설계 |
| 모든 Paseo client가 공유하는 browser storage | 공개 API 없음 | `localStorage`는 web 전용이며 client 간 공유되지 않음 |
| Plugin 간 직접 호출·화면 열기 | 공개 API 없음 | 같은 Plugin의 surface/panel/RPC만 대상으로 사용 |
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
| Timeline canonical row와 projection lifecycle | 특정 원본 항목의 변환 결과와 renderer |
| Plugin query client와 error boundary | Query key/data와 loading/empty/error UI |

이 경계를 넘는 내부 app store, router, non-public module import는 현재 동작하더라도 Plugin 계약으로 보지 않는다.

## Version drift 주의

현재 배포된 [Plugin reference](https://paseo.sh/docs/plugins/reference)는 설치된 Paseo와 다른 시점의 기능을 설명할 수 있다. 대상 버전의 tag 문서와 fresh scaffold에 없는 field나 hook은 사용하지 않는다.

이 저장소의 `plugins/*/paseo-plugin.d.ts`는 `0.7.0` fresh scaffold와 동기화되어 있다. 이후 Paseo를 업데이트할 때도 기존 선언만 보고 기능 범위를 판단하거나 생성 파일을 손으로 임의 확장하지 말고, 새 CLI가 생성한 계약과 다시 비교한다.

`v0.7.0` tag의 Plugin reference에는 general host navigation이 없다는 이전 문장이 남아 있다. 같은 문서의 Surface 계약, Plugin guide와 fresh scaffold를 함께 보면 이는 임의 route용 범용 API가 없다는 제한이며, `openAgent`와 `openWorkspace`는 공개된 예외다.

## 관련 문서

- [실전 사용 예시](examples.md)
- [전체 기능표](README.md)
- [UI 기여 지점](ui-contributions.md)
- [Backend와 Paseo SDK](backend-and-sdk.md)
- [`v0.7.0` Plugin reference](https://github.com/getpaseo/paseo/blob/v0.7.0/public-docs/plugins/reference.md)
