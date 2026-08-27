# AGENTS.md

이 저장소는 여러 개의 독립적인 로컬 Paseo 플러그인을 개발하는 npm workspace다. 각 `plugins/*` 디렉터리는 자체 manifest와 진입점을 가진 별도의 설치 단위다.

작업을 시작할 때:

- 먼저 변경 대상 플러그인을 `plugins/`에서 고른다.
- 해당 디렉터리의 `paseo-plugin.json`에서 런타임 ID를 확인한다.
- 기여 등록은 같은 디렉터리의 `index.ts`, 클라이언트 UI는 `*.client.tsx`에서 시작한다.
- 한 플러그인만 바꿨으면 해당 workspace를, 구조나 공통 설치 상태를 바꿨으면 루트 workspace 전체를 검증한다.

플러그인 API는 실험 단계이므로 계약을 바꾸거나 새 기여 유형을 추가하기 전에 현재 [Plugin quickstart](https://paseo.sh/docs/plugins)와 [Plugin reference](https://paseo.sh/docs/plugins/reference)를 확인한다.

## Common Commands

루트에서 의존성을 설치하고 모든 플러그인을 검사한다.

```powershell
npm install
npm run typecheck
```

현재 플러그인 하나만 검사할 때는 package 이름을 workspace 선택자로 사용한다.

```powershell
npm run typecheck --workspace paseo-plugin
```

## Adding a Plugin

1. `plugins/<plugin-id>` 아래의 새 빈 디렉터리를 대상으로 `paseo plugin init <absolute-directory> --id <plugin-id>`를 실행한다.
2. 생성된 `package.json`의 `name`과 `paseo-plugin.json`의 `id`가 이 저장소 안에서 고유한지 확인한다.
3. 루트에서 `npm install`을 실행해 workspace 설치 상태를 갱신한다.
4. 아래 Workspace Map에 실제 경로와 역할을 추가한다.
5. 새 플러그인의 workspace 타입 검사와 루트 전체 타입 검사를 실행한다.

기존 플러그인을 복사해 새 플러그인을 만들지 않는다. 현재 Paseo CLI가 생성하는 스캐폴드를 사용해야 플러그인 계약과 `paseo-plugin.d.ts`가 설치된 CLI 버전에 맞는다.

## Workspace Map

- `plugins/paseo-plugin/`
  Audience: **Public integration**
  Role: 현재 기본 플러그인 스캐폴드. `index.ts`가 `main.client.tsx`의 전역 surface를 등록한다.

## Per-Plugin Change Routing

- `index.ts`: 기여 등록과 생명주기를 소유한다. 기본 내보내기 함수는 정리 함수를 반환하고, 플러그인이 만든 타이머·감시자·소켓은 그 함수에서 정리한다.
- `*.client.tsx`: UI, 훅, React Native 스타일을 소유한다. 모든 `Text` 색상은 `theme.colors`에서 가져오고, 루트 배경에는 `theme.colors.surface0`, 좁은 화면 대응에는 `layout.compact`를 사용한다.
- `*.server.ts`: 파일 시스템, 프로세스, 자격 증명, 외부 API처럼 데몬 측에서 실행해야 하는 동작을 소유한다.
- `*.shared.ts`: 클라이언트와 서버가 함께 쓰는 Zod RPC 계약과 순수 값을 소유한다. Node 또는 React Native 런타임 코드를 넣지 않는다.
- `paseo-plugin.json`: 설치 기본 ID를 소유한다. 디렉터리명이나 package 이름으로 런타임 ID를 추측하지 않는다.
- `paseo-plugin.d.ts`: CLI가 생성한 로컬 타입 검사 계약이다. 일반 소스처럼 임의 확장하지 않는다.

클라이언트 모듈에서 `*.server.ts`를 가져오거나 서버 모듈에서 `*.client.tsx`를 가져오지 않는다. 화면 안에서 별도 Paseo 클라이언트를 만들지 않고 제공된 Paseo API를 사용한다.

## Synchronization Rules

- 기여 ID, surface ID 또는 등록 방식이 바뀌면 같은 플러그인의 `index.ts`와 해당 `*.client.tsx`를 함께 갱신한다.
- RPC 입력·출력이 바뀌면 같은 플러그인의 `*.shared.ts` 계약, `*.server.ts` 처리기, `*.client.tsx` 호출부를 함께 갱신한다.
- 플러그인 디렉터리를 추가·삭제·이름 변경하면 이 파일의 Workspace Map과 루트 workspace 검증을 같은 변경에서 맞춘다.
- Paseo 플러그인 계약이 바뀌면 현재 CLI가 생성하는 새 스캐폴드와 공식 참조 문서를 대조하고, 영향받는 각 플러그인의 생성 타입 계약을 확인한다.

## Validation and Runtime Safety

- 한 플러그인의 소스 변경은 먼저 `npm run typecheck --workspace <package-name>`으로 검사한다.
- workspace 구조, 설치 상태 또는 여러 플러그인에 걸친 변경은 루트에서 `npm run typecheck`로 검사한다.
- 설치 또는 재로딩까지 요청된 경우에만 대상 데몬, 플러그인 디렉터리, manifest의 런타임 ID를 확인하고 `paseo plugin install` 또는 `paseo plugin reload`를 실행한다. 이어서 `paseo plugin ls`에서 상태와 오류를 확인한다.
- 플러그인은 신뢰된 비격리 코드다. 데몬의 전역 플러그인 스위치가 꺼져 있거나 없으면 사용자의 명시적 허가 없이 켜지 않는다.
- 소스 변경을 반영하려고 데몬을 재시작하지 않는다. `paseo plugin reload <runtime-id>`를 사용한다.
- 백엔드 오류는 `paseo plugin logs <runtime-id>`로 확인하고, 로그에 자격 증명이나 토큰을 남기지 않는다.
- UI 변경은 가능하면 넓은 화면과 compact 레이아웃, 밝은/어두운 테마에서 확인한다.
