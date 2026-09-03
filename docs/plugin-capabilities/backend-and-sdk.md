# Backend와 Paseo SDK

Paseo Plugin은 하나의 `index.ts`에서 등록하지만 실제로는 client bundle과 daemon-side subprocess로 나뉜다. 정상적인 Paseo 조작은 host가 제공한 `PaseoApi`를 사용하고, Plugin 고유의 로컬 동작만 typed RPC로 연결한다.

## Runtime 경계

| 파일 | 실행 위치 | 넣을 내용 |
| --- | --- | --- |
| `index.ts` | contribution wiring | 등록, handler 연결, cleanup 반환 |
| `*.client.tsx` | 연결된 Paseo app | React, React Native, hook, style, surface/panel/pill component와 callback |
| `*.server.ts` | daemon subprocess | Node API, filesystem, process, 자격 증명, 외부 API, RPC handler |
| `*.shared.ts` | 양쪽 bundle | Zod RPC 계약과 JSON-safe 순수 값 |

Client module에서 `*.server.ts`를 import하거나 server module에서 `*.client.tsx`를 import하면 build가 실패한다. Shared module에는 Node 또는 React Native runtime 호출을 넣지 않는다. `StyleSheet.create` 같은 top-level client 호출도 `index.ts`가 아니라 `*.client.tsx`에 둔다.

## Host가 제공하는 Client module

Paseo는 Git source의 lockfile을 보고 package manager나 install script를 자동 실행하지 않는다. Manifest에 명시적인 `build`가 있으면 staged plugin directory에서 해당 argv 명령만 실행한다. 다음 module은 Paseo가 client runtime에 제공한다.

| Module | 용도 |
| --- | --- |
| `@getpaseo/plugin` | contribution type, data hook, Paseo/RPC hook |
| `@getpaseo/plugin/react-native` | `Modal`, `Icon`, `useToast` |
| `@getpaseo/plugin/server` | shared RPC와 attachment 계약 |
| `@tanstack/react-query` | async request state, cache, mutation |
| `react`, `react/jsx-runtime` | component와 hook |
| `react-native` | cross-platform UI와 host가 제공하는 React Native API |
| `zod` | shared input/output schema |

이 목록에 없는 client runtime import는 load 시 거부될 수 있다. 특히 DOM library, `lucide-react-native`, `react-native-svg`를 직접 import하지 않는다. Browser global은 `layout.platform === "web"`일 때만 존재하며 iOS/Android에서는 사용할 수 없다.

Server code에는 `@getpaseo/plugin`, `@getpaseo/plugin/server`, `zod`가 host module로 제공된다. Plugin 내부 상대 import와 Node 기본 module을 사용할 수 있고, directory source라면 설치된 dependency도 사용할 수 있다. Git source 배포에서는 host 제공 module·Node 기본 module·Plugin 내부 source만으로 실행 가능하게 만드는 것이 안전하다.

## Paseo 상태를 읽는 Hook

| Hook | 목적 | 특징 |
| --- | --- | --- |
| `usePaseo()` | 선택 host의 기존 `PaseoApi` 사용 | 새 client를 만들지 않으며 host 전환을 따른다. |
| `useRpc(contract)` | 현재 설치의 daemon-side Plugin handler 호출 | Zod input/output type을 보존한다. |
| `useWorkspace(id, selector)` | cached workspace snapshot 선택 | selector 필수, shallow equality, 없으면 `null` |
| `useAgent(id, selector)` | cached agent snapshot 선택 | selector 필수, shallow equality, 없으면 `null` |

Workspace와 Agent의 현재 문맥을 찾기 위한 별도 Plugin RPC를 만들지 않는다. Panel/Pill props가 안정적인 ID를 주고, hook이 app cache를 읽는다.

## Paseo API를 받을 수 있는 위치

같은 host-owned `PaseoApi`가 여러 context에 주입된다.

| 위치 | 접근 방식 |
| --- | --- |
| Surface, Panel, Modal 내부 component | `usePaseo()` |
| Command Center callback | callback의 `paseo` |
| Headless client entrypoint | 해당 Plugin 설치 host의 `PluginClientContext.paseo` |
| daemon RPC handler | handler context의 `{ paseo }` |

Plugin은 connection 생성, reconnect, close를 소유하지 않는다. 각 API는 surface/command가 선택한 host 또는 headless client/handler가 속한 설치 host에 묶인다. 해당 host가 offline이면 다른 host로 자동 fallback하지 않는다.

## `PaseoApi`로 가능한 동작

`v0.7.2` SDK reference의 Plugin용 API 범위는 `projects`, `workspaces`, `agents`, `providers`, `config`다.

### Projects

- 등록된 Project 전체 조회: `projects.list(options?)`

### Workspaces

- 목록·filter·paging·subscription: `workspaces.list`, `workspaces.subscribe`
- directory를 열거나 기존 활성 Workspace 재사용: `workspaces.open`
- directory/worktree 기반 새 Workspace 생성: `workspaces.create`
- ID 또는 snapshot에서 handle 생성: `workspaces.ref`
- Workspace archive: `workspaces.archive` 또는 handle의 `archive`
- handle의 현재 snapshot, refresh, title 변경, update subscription
- 해당 Workspace에 바로 Agent 생성: `workspace.agents.create`

### Agents

- 목록·filter·paging·subscription: `agents.list`, `agents.subscribe`
- Agent 생성 또는 handle 참조: `agents.create`, `agents.ref`
- prompt 전송: handle의 `send`
- prompt 전송 후 완료/attention까지 대기: `run`
- 이미 진행 중인 turn 대기: `waitForFinish`
- 현재 snapshot 조회·refresh·subscription
- archive 또는 parent 관계 detach
- provider가 노출한 slash command와 skill 조회
- timeline page refetch와 stream subscription

Agent 생성 옵션에는 provider/model, mode, thinking option, feature value, provider-native option, system prompt, MCP server, tool policy, cwd/worktree, prompt, image, attachment, label 등을 조합할 수 있다.

### Providers

- 설치 가능 상태와 catalog snapshot 조회
- provider discovery 완료 대기 또는 강제 refresh
- model, mode, feature 목록 조회
- 설정 diagnostic 조회
- provider catalog update subscription

### Daemon config

- `config.get()`으로 mutable daemon config 조회
- `config.patch(patch)`로 validation과 persistence를 거쳐 host config 수정

`config.patch`는 모든 client와 이후 Agent에 영향을 주는 관리 기능이다. 개별 Plugin 설정 저장소처럼 사용하지 않는다.

Plugin용 `PaseoApi`에는 client connection lifecycle method가 없고 UI route도 소유하지 않는다. 대신 Surface와 workspace/agent panel props의 optional `navigation`이 선택 host의 Agent와 Workspace를 여는 `openAgent`와 `openWorkspace`만 제공한다. Command Center와 headless client는 같은 Plugin의 `openSurface`와 `openPanel`을 사용할 수 있다. 그 밖의 임의 native route를 여는 범용 navigation API는 없다.

## Plugin RPC

Plugin RPC는 Paseo SDK에 없는 Plugin 고유 동작에 사용한다.

- daemon machine의 파일과 directory 읽기
- child process 또는 read-only CLI 실행
- OS credential/token을 사용한 vendor API 호출
- server-side cache, local DB, watcher, socket
- client에 secret을 보내지 않고 결과만 반환하는 작업

Shared 계약은 Zod input/output으로 정의한다.

```ts
export const inspect = defineRpc({
  name: "repo.inspect",
  input: z.object({ directory: z.string() }),
  output: z.object({ branch: z.string(), dirty: z.boolean() }),
});
```

`index.ts`에서 handler를 연결한다.

```ts
plugin.handle(inspect, inspectRepository);
```

Client component에서는 `useRpc(inspect)`, Command Center나 headless client에서는 주입된 `rpc(inspect, input)`을 사용한다. Input과 output은 app과 subprocess 양쪽에서 validation된다.

RPC name은 소문자로 시작하고 소문자·숫자·점·하이픈·밑줄만 사용한다. 비동기 상태, retry, cache가 필요하면 client에서 TanStack Query를 사용한다.

## Headless Client

`addClientSide` callback은 화면을 mount하지 않아도 app 연결 동안 실행된다. `PluginClientContext`는 다음 기능을 제공한다.

- `paseo`: 선택된 host API를 구독하거나 호출
- `rpc`: typed Plugin RPC
- `openSurface`: 같은 Plugin의 전역 surface 열기
- `openPanel`: 명시한 `workspaceId`, optional `agentId`의 panel 열기
- `addComposerPill`: 특정 Agent의 Composer track bar에 pill 등록

Headless client는 subscription과 pill 제거 함수를 cleanup에서 반드시 해제한다. App unload, host disconnect, Plugin reload 때 Paseo도 남은 contribution을 제거한다.

## Lifecycle과 Cleanup

기본 export는 항상 cleanup 함수를 반환한다.

```ts
export default function contribute(plugin: PluginContext) {
  // register contributions
  return async () => {
    // stop timers, watchers, sockets, subprocess-owned resources
  };
}
```

Cleanup은 sync 또는 async다. Reload, disable, remove, disconnect, daemon shutdown에서 실행된다. Paseo는 별도로 registration 제거, surface unmount, pending RPC reject, query state clear, daemon session close와 subprocess 종료를 처리한다.

각 Plugin subprocess는 전용 `plugin:<runtime-id>` session을 사용한다. Plugin은 신뢰된 비격리 코드이므로 backend는 daemon machine의 파일, process, credential, network에 접근할 수 있다.

## Multi-host 동작

- Plugin은 daemon별로 설치된다.
- 합쳐진 Sidebar contribution에서는 현재 screen header의 선택 host가 bundle, RPC, API, query cache를 제공한다.
- Plugin code는 다른 host를 직접 지정할 수 없다.
- 선택 host가 offline이어도 다른 설치로 fallback하지 않는다.
- Attachment source는 합쳐지지 않고 Composer host에 종속된다.
- Workspace panel과 Command Center item은 active host와 exact cached context에 종속된다.
- Surface와 panel의 `navigation.openAgent`·`openWorkspace`도 렌더링 host에 고정되며, 대상이 다른 host에만 있어도 자동 fallback하지 않는다.

## Logging과 진단

Daemon-side `console.log`와 `console.error`는 Plugin log tail에 저장된다. UI runtime log는 daemon Plugin log에 포함되지 않는다.

```powershell
paseo plugin ls
paseo plugin logs <runtime-id>
paseo plugin logs <runtime-id> --json
```

`0.7.2`는 Plugin별 최근 log를 최대 500개, 256 KiB까지 memory에 유지하고 한 line을 16 KiB로 제한한다. Reload·disable·실패 뒤에도 tail이 남지만 Plugin remove는 지우고 daemon restart는 새 tail을 시작한다. Credential과 token은 log에 남기지 않는다.

## 전용 Storage의 부재

이 버전에는 cross-client Plugin storage API가 없다.

- Browser `localStorage`는 web에서만 존재하며 다른 Paseo client와 공유되지 않는다.
- 지속 상태가 필요하면 daemon-side RPC 뒤에 Plugin 소유 file/DB를 두고 schema, locking, migration, secret 보호를 직접 설계한다.
- daemon config는 host 전체 관리 state이므로 Plugin별 임의 storage 대용으로 사용하지 않는다.

## 관련 문서

- [실전 사용 예시](examples.md)
- [전체 기능표](README.md)
- [UI 기여 지점](ui-contributions.md)
- [지원 경계](limitations.md)
- [`v0.7.2` SDK API reference](https://github.com/getpaseo/paseo/blob/v0.7.2/public-docs/sdk/reference.md)
