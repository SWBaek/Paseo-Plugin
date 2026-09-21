# Backend와 Paseo SDK

기준은 **Paseo 0.9.0-beta.2**이다. 플러그인별 소스 상태는 [호환성 기록](../COMPATIBILITY.md), 파일 이동과 검증 순서는 [이관 안내](../MIGRATION_0.9.md)를 따른다. 이 문서는 [공식 reference](https://paseo.sh/docs/plugins/reference)와 exact SDK 선언을 정적으로 대조한 참조 자료다.

## Runtime 경계

| 위치 | 책임 |
| --- | --- |
| `index.client.tsx` | surface/sidebar/panel/pill/command/settings/timeline 등 client 등록과 cleanup |
| `index.server.ts` | RPC handler, settings persistence, provider, lifecycle 등록과 cleanup |
| `client/` | React Native UI, 훅, 구독·query·controller |
| `server/` | Node, filesystem, process, credentials, 외부 API |
| `shared/` | Zod 계약과 런타임 중립 값·타입 |

진입점 외의 소스 모듈은 세 디렉터리 중 하나에 둔다. 예전 `*.client.tsx` 같은 suffix는 경계를 만들지 않는다. Client에서 server/Node를, server에서 client/React를 참조하면 compile 오류다. Shared는 shared만 참조하고 Node·React·런타임 전용 SDK 및 해당 타입을 가져오지 않는다. 이 규칙은 type import와 전이 의존성에도 적용된다.

## Host 제공 모듈

| Import | 허용 런타임·용도 |
| --- | --- |
| `@getpaseo/plugin` | 양쪽: `defineRpc`, `defineSettings`, `defineAttachmentSource`, 공유 타입 |
| `@getpaseo/plugin/client` | client: context, props, `usePaseo`, `useRpc`, `useSettings`, `useAgent`, `useWorkspace` |
| `@getpaseo/plugin/client/react-native` | client: host UI, clipboard, modal scroll/input |
| `@getpaseo/plugin/client/ui` | client: 공개 Settings 컴포넌트 |
| `react`, `react/jsx-runtime`, `react-native`, `@tanstack/react-query` | client |
| `@getpaseo/plugin/server` | server: context, handler·lifecycle 타입 |
| `@getpaseo/plugin/server/provider`, `@getpaseo/plugin/server/acp` | server: provider 구현과 ACP shim |
| `zod` | 양쪽: schema |

`/client/host`는 private이다. Client에서 DOM library, `lucide-react-native`, `react-native-svg`를 직접 가져오지 않는다. Browser global이 필요한 경우 `client/web.ts`에 좁은 타입과 `Platform.OS` 분기를 두고 native 대안을 제공한다. `tsconfig`에 DOM lib를 추가해 우회하지 않는다.

Server는 Node 기본 모듈과 설치된 dependency도 사용할 수 있다. Git source는 package manager를 자동 실행하지 않으므로 외부 dependency가 필요하면 manifest의 명시적 `build`를 설계해야 한다. 현재 네 플러그인은 `build` 없이 host/Node/내부 상대 import만 사용하는 배포 방식을 유지한다. 자세한 내용은 [Git 설치](../GIT_INSTALLATION.md)를 따른다.

## Hook과 주입 API

`usePaseo()`는 선택 host의 연결을 빌린다. `useWorkspace(id, selector)`와 `useAgent(id, selector)`는 cached snapshot을 읽고, selector 결과를 shallow equality로 비교하며 record가 없으면 `null`을 반환한다. 전체 snapshot을 선택하거나 현재 문맥을 찾기 위한 RPC를 추가하지 않는다.

Command/Slash callback, client entry, server RPC handler와 lifecycle hook에도 같은 host의 `paseo`가 주입된다. Connection 생성·reconnect·close는 Paseo가 소유한다. Surface의 선택 host가 offline이어도 다른 host로 fallback하지 않는다.

## Typed RPC

정상적인 Paseo 조작은 SDK를 사용하고, 벤더 API·파일 조사·Git 실행 같은 플러그인 고유 동작에 RPC를 사용한다.

```ts
// shared/inspect.ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const inspect = defineRpc({
  name: "repo.inspect",
  input: z.object({ directory: z.string() }),
  output: z.object({ branch: z.string(), dirty: z.boolean() }),
});
```

Server entry에서 `server.handle(inspect, inspectRepository)`를 등록한다. Handler 구현은 `server/`에 두고 입력/출력 타입은 root의 `RpcInput<typeof inspect>`, `RpcOutput<typeof inspect>`로 표현한다. Client component는 `useRpc(inspect)`, command/client entry는 `rpc(inspect, input)`을 사용한다. 입력과 출력은 양쪽에서 schema 검증을 받는다.

Handler context는 `{ paseo }`다. Lifecycle context의 `signal`을 일반 RPC handler에도 있다고 가정하지 않는다. HTTP·프로세스의 timeout, 출력 제한과 오류 처리는 각 구현이 책임진다. 비동기 UI 상태는 TanStack Query로 관리한다.

## Paseo SDK 범위

| 영역 | 대표 기능 |
| --- | --- |
| `projects` | `list`, 신규 `subscribe`로 Project 변경 관찰 |
| `workspaces` | 목록·생성·열기·archive·구독, handle에서 Agent와 Terminal 접근 |
| `agents` | 생성·참조·목록·구독, handle의 `send`, `run`, `waitForFinish`, timeline 조회·구독 |
| Agent permission | handle의 `respondToPermission`으로 pending request 응답 |
| Agent timeline | plugin server session에서 `timeline.append`로 durable row 기록 |
| `providers` | catalog·model·mode·feature·diagnostic·구독, `listUsage`로 계획 사용량 조회 |
| `terminals` | workspace ID로 생성·목록·입력·키 전송·capture·종료 |
| `config` | host 전체 config 조회·patch |

정확한 인자와 반환값은 [SDK reference](https://paseo.sh/docs/sdk/reference) 및 대상 `@getpaseo/client` 선언을 확인한다. `projects.subscribe()`는 향후 upsert/remove만 전달하므로 초기 `list()`와 buffer를 조합한다. Git filesystem watcher가 아니므로 Branch Garden의 dirty/branch 상태를 모두 실시간으로 보장하지 않는다. Agent/Workspace 구독도 현재 연결에 directory 구독 요청이 설정돼 있어야 하므로 초기 `list({ subscribe })`와 listener cleanup 계약을 확인한다.

### Provider 사용량 SDK

Beta.1에는 **`paseo.providers.listUsage(options?)`가 공개돼 있다**. Options는 optional `requestId`, 반환 payload는 `requestId`, `fetchedAt`, `providers`를 포함한다. Provider별 `status`·`planLabel`·사용량 `windows`, optional `balances`·`details`·`error`를 제공한다. `agent.lastUsage`의 직전 turn 토큰·비용·context 값과 구분한다.

SDK는 host가 `providerUsageList` feature를 지원하지 않으면 update-host 오류로 reject한다. `providers.subscribe`는 catalog 구독이며 usage polling을 대체하지 않는다. 사용량 API를 호출하기 위해 새 Paseo client를 만들지 않고 제공된 `paseo`를 사용한다. 근거는 [공식 SDK reference](https://paseo.sh/docs/sdk/reference#clientproviders)와 exact client/protocol 0.9.0-beta.2 선언이다.

Provider Usage 현재 소스는 이 SDK를 사용하고 `providers.snapshot()`의 `enabled` 연결만 표시한다. 직접 자격 증명·HTTP 코드는 제거했다. Beta.1의 5분 host cache와 force-refresh 부재, 인증·오류 정책 비교 및 실제 runtime 미검증 범위는 [검증 기록](../verification/provider-usage-0.8-source.md)을 따른다.

Terminal write/kill, permission 응답, Agent 생성과 config patch는 상태를 바꾸는 API다. 현재 플러그인의 읽기 전용 범위에 자동 편입하지 않는다. `config.patch`를 개별 플러그인 설정 저장소로 사용하지 않는다.

## Host 단위 설정 저장

공유 `defineSettings({ id, scope: "host", version, schema, migrate? })`로 문서를 정의하고 `server.registerSettings(definition)`을 등록한다. 0.9의 반환 handle은 `read()`와 `subscribe()`를 제공한다. Client는 `useSettings(definition)`을 사용한다. Schema는 `{}`를 완전한 기본 설정으로 parse할 수 있도록 defaults를 제공한다. `version`은 양의 정수 schema 버전이며 저장 revision과 별개다.

| Hook 상태/동작 | 의미 |
| --- | --- |
| `loading`, `error` | 읽기 중 또는 연결·읽기 오류 |
| `ready` | typed `values`와 opaque `revision` 제공 |
| `invalid` | 저장 값·migration·새 버전이 유효하지 않음; 원본 값 보존 |
| `save(values, revision)` | 전체 문서 저장. 검증·충돌·전송 실패 시 throw 대신 `false`, `saveError` 반환 |
| `reset()` | 현재 revision을 사용해 기본값으로 명시적 복구 |
| `reload()` | 저장 오류를 지우고 재조회. UI draft는 자동 삭제하지 않음 |

Draft editor는 열 때 값과 revision을 함께 보관한다. 오래된 revision으로 저장하면 충돌로 거부되므로 새 저장 값과 사용자의 draft를 덮어쓰지 않는다. `saving`, `saveError`를 표시하고 중복 저장을 막는다.

설정은 같은 host·설치의 authorized client들에 동기화된다. 원자적으로 저장되며 restart/reload/disable/update 후에도 유지되지만 **설치를 remove하면 삭제되고 재설치 시 기본값으로 시작한다**. `scope`는 host만 지원하며 device/user/cross-host 저장소가 아니다. 일반 JSON이므로 credential vault로 사용하지 않는다. 내장 저장을 쓰려면 server entry가 필요하다. 설정 UI만 제공하는 client-only 플러그인은 가능하다.

## Lifecycle hooks

Server entry에서 `server.on(name, handler)` 또는 `server.before(name, handler)`를 등록한다. App 연결이 없어도 활성 플러그인의 daemon hook은 동작한다.

| `on` 이벤트 | 주요 내용 |
| --- | --- |
| `agent.created`, `agent.archived` | Agent 생성·archive |
| `agent.turn_started` | Agent와 turn ID |
| `agent.turn_ended` | Agent, turn ID, completed/failed/canceled outcome, 이전 대화를 포함한 timeline snapshot |
| `agent.permission_requested`, `agent.permission_resolved` | pending permission/question과 응답/해소 |
| `workspace.created`, `workspace.archived` | Workspace 생성·archive |

| `before` 요청 | 수정 가능한 범위 |
| --- | --- |
| `agent.create` | 공개 Agent config 중 `cwd`·daemon 내부 필드 제외, optional env |
| `agent.session_open` | `env`만. create/resume/refresh/import와 interactive/history 목적을 구분 |
| `workspace.create` | 명시적 생성 요청의 source/title/firstAgentContext. 기존 directory lookup/import 전체를 가로채지는 않음 |

`before`는 변경된 request를 반환하고 `undefined`면 그대로 유지한다. Plugin ID 순서, 같은 플러그인 내부 등록 순서로 적용되며 자동 deep merge는 없다. 잘못된 반환값이나 예외는 작업을 실패시키고 뒤 hook을 실행하지 않는다. `agent.create`에서 provider를 바꿀 때 model/mode/options의 호환성도 함께 맞춘다.

Context는 `{ paseo, signal }`이다. 호출 timeout은 30초이며 플러그인 정지 때도 signal이 abort된다. Before 실패는 원래 작업을 실패시키지만 event-handler 실패는 로그에 기록하고 원래 작업은 계속된다. 이벤트는 live best effort로 전달되며 replay·영속 큐·자동 retry가 없고 서로 다른 이벤트는 겹쳐 실행될 수 있다. 후속 메시지나 permission 자동화에는 중복·재진입·무한 follow-up 방지를 별도로 설계한다.

## Provider contributions

`server.registerProvider()`는 완전한 Provider를 등록한다. `ProviderRegistration`은 `/server/provider`, ACP adapter의 `runAcpProvider()`는 `/server/acp`에서 가져온다. Provider guide의 [구현·테스트 계약](https://paseo.sh/docs/plugins/providers)을 따른다.

- Connection의 `send()`는 입력 수락을 의미하고 turn 완료를 뜻하지 않는다. `onEvent()`로 상태 snapshot과 결과를 전달한다.
- Message·structured command·steering은 `session.prompt`로 처리한다. Client message ID와 prompt result의 대응, permission, persistence, provider-created child session 관계를 지켜야 한다.
- Session 설정은 providerOptions, 공개 toggle/select descriptor와 MCP 설정을 구분한다. Session open 시 외부 상태를 다시 읽는다.
- Provider icon은 plugin 내부의 self-contained SVG 상대 경로이며 최대 64 KiB다. 일반 UI contribution의 Lucide 이름과 다르다.

Provider Usage는 기존 Provider의 계획 사용량을 읽는 플러그인이다. 0.9 이관을 위해 새 Provider를 등록할 필요는 없다.

## Cleanup, multi-host와 진단

두 entry는 각각 sync/async cleanup을 반환하고 직접 만든 timer/watcher/socket/subscription을 해제한다. 모든 client `add*`와 server `on`/`before`의 제거 함수는 idempotent다. Entry cleanup 뒤 Paseo가 남은 등록, UI와 세션 등 자신이 소유한 자원을 정리한다. Client entry는 각 연결 앱의 설치마다 실행되므로 backend의 유일한 background worker처럼 취급하지 않는다. Server entry가 없으면 subprocess도 없다.

Sidebar 병합 화면의 선택 host가 bundle/API/RPC/query cache를 제공한다. Attachment source는 Composer host에 묶인다. 플러그인은 임의로 다른 host로 우회하지 않는다.

```powershell
paseo --host <target> plugin ls
paseo --host <target> plugin logs <runtime-id> --json
```

0.8의 `--host`는 global 옵션이다. `ls`는 remote update 조회 없이 runtime 상태·source·설치 commit·load error를 보고한다. 원격 ref 확인은 `plugin status`다. Backend stdout/stderr는 log tail에 남으며 credential을 기록하지 않는다. `logs`는 실시간 follow가 아닌 snapshot이다. Reload/disable/실패 후에도 tail이 남지만 remove와 daemon restart에는 보존되지 않는다.

## 관련 문서

[UI 기여 지점](ui-contributions.md) · [지원 경계](limitations.md) · [예제](examples.md) · [전체 기능표](README.md) · [공식 backend·lifecycle reference](https://paseo.sh/docs/plugins/v0.8/reference)
