# AGENTS.md

이 저장소는 여러 개의 독립적인 로컬 Paseo 플러그인을 개발하는 npm workspace다. 각 `plugins/*` 디렉터리는 자체 manifest와 진입점을 가진 별도의 설치 단위다.

아이디어, 개발 계획과 버그의 이슈 관리는 GitHub Issues를 사용한다. 새 이슈는 `.github/ISSUE_TEMPLATE/`의 양식을 사용하고, 분류·Project 상태·PR 연결 규칙은 `.github/ISSUE_MANAGEMENT.md`를 따른다.

작업을 시작할 때:

- 실제 구현을 시작할 때 해당 이슈의 GitHub Project Status를 `In Progress`로 변경한다.
- 먼저 변경 대상 플러그인을 `plugins/`에서 고른다.
- 해당 디렉터리의 `paseo-plugin.json`에서 기본 설치 ID를 확인한다.
- 기여 등록은 같은 디렉터리의 `index.ts`, 클라이언트 UI는 `*.client.tsx`에서 시작한다.
- 한 플러그인만 바꿨으면 해당 workspace를, 구조나 공통 설치 상태를 바꿨으면 루트 workspace 전체를 검증한다.

플러그인 API는 실험 단계이므로 계약을 바꾸거나 새 기여 유형을 추가하기 전에 현재 [Plugin quickstart](https://paseo.sh/docs/plugins)와 [Plugin reference](https://paseo.sh/docs/plugins/reference)를 확인한다.

## Design Rules

- 플러그인의 클라이언트 UI를 만들거나 변경할 때는 [Paseo Plugin Design Rules](docs/DESIGN.md)를 따른다.
- 디자인 규칙이 공식 Plugin 문서나 대상 플러그인의 생성된 `paseo-plugin.d.ts`와 충돌하면 공식 문서와 생성 타입을 우선하고, 같은 변경에서 `docs/DESIGN.md`를 갱신한다.
- UI 검토에서는 wide/compact layout, 밝은/어두운 theme, loading·empty·error·disabled 상태와 접근성을 함께 확인한다.

## Common Commands

루트에서 의존성을 설치하고 모든 플러그인을 검사한다.

```powershell
npm install
npm run check:git-source-imports
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
4. 아래 Workspace Map에 실제 경로와 역할을 추가하고 `.github/ISSUE_TEMPLATE/*.yml`의 대상 선택지를 갱신한다.
5. 새 플러그인의 workspace 타입 검사와 루트 전체 타입 검사를 실행한다.

기존 플러그인을 복사해 새 플러그인을 만들지 않는다. 현재 Paseo CLI가 생성하는 스캐폴드를 사용해야 플러그인 계약과 `paseo-plugin.d.ts`가 설치된 CLI 버전에 맞는다.

## Workspace Map

- `plugins/paseo-plugin/`
  Audience: **Public integration**
  Role: 현재 기본 플러그인 스캐폴드. `index.ts`가 `main.client.tsx`의 전역 surface를 등록한다.
- `plugins/branch-garden/`
  Audience: **Personal operations**
  Role: 선택된 호스트의 Git Workspace와 로컬 브랜치 상태를 읽기 전용으로 집계하는 전역 사이드바 surface를 제공한다.
- `plugins/github-project-board/`
  Audience: **Personal operations**
  Role: `SWBaek`의 개인 GitHub Project 목록을 GitHub CLI의 기존 인증으로 조회하고, 선택한 Project를 읽기 전용 칸반으로 표시하는 전역 사이드바 surface를 제공한다.
- `plugins/tailscale-dashboard/`
  Audience: **Personal operations**
  Role: 선택된 호스트의 Tailscale Serve 구성을 읽기 전용으로 조사해 검증된 TailscaleOps 핵심 현황을 네이티브 카드로 표시하고, 전체 Dashboard를 선택적으로 시스템 브라우저에서 여는 전역 사이드바 surface를 제공한다.
- `plugins/composer-compact/`
  Audience: **Personal productivity**
  Role: 각 Agent의 Composer track bar에 `Compact` pill을 추가하고 확인 Modal에서 승인한 경우에만 해당 Agent에 `/compact` 명령을 전송한다.
- `plugins/composer-skills/`
  Audience: **Personal productivity**
  Role: 각 Agent의 Composer track bar에 `Skills` pill을 추가하고, 현재 세션이 로드한 Skill을 Modal에서 고른 뒤 최종 문장을 클립보드에 복사한다. Composer 입력창에 직접 넣거나 자동 전송하지 않는다.
- `plugins/file-browser/`
  Audience: **Personal operations**
  Role: 선택된 Windows daemon host의 `C:\Projects` 아래 폴더와 작은 텍스트 파일을 읽기 전용으로 탐색하고, 일반 파일을 Tailnet 전용 일회용 HTTPS URL로 내려받는 전역 사이드바 surface를 제공한다. daemon-side allowlist 밖의 경로와 link·junction 대상은 열지 않는다.

## Per-Plugin Change Routing

- `index.ts`: 기여 등록과 생명주기를 소유한다. 기본 내보내기 함수는 정리 함수를 반환하고, 플러그인이 만든 타이머·감시자·소켓은 그 함수에서 정리한다.
- `*.client.tsx`: UI, 훅, React Native 스타일을 소유한다. 모든 `Text` 색상은 `theme.colors`에서 가져오고, 루트 배경에는 `theme.colors.surface0`, 좁은 화면 대응에는 `layout.compact`를 사용한다.
- `*.server.ts`: 파일 시스템, 프로세스, 자격 증명, 외부 API처럼 데몬 측에서 실행해야 하는 동작을 소유한다.
- `*.shared.ts`: 클라이언트와 서버가 함께 쓰는 Zod RPC 계약과 순수 값을 소유한다. Node 또는 React Native 런타임 코드를 넣지 않는다.
- `paseo-plugin.json`: 설치 기본 ID를 소유한다. 디렉터리명이나 package 이름으로 런타임 ID를 추측하지 않는다.
- `paseo-plugin.d.ts`: CLI가 생성한 로컬 타입 검사 계약이다. 일반 소스처럼 임의 확장하지 않는다.

클라이언트 모듈에서 `*.server.ts`를 가져오거나 서버 모듈에서 `*.client.tsx`를 가져오지 않는다. 화면 안에서 별도 Paseo 클라이언트를 만들지 않고 제공된 Paseo API를 사용한다.

## Synchronization Rules

- 기여 ID, surface ID, sidebar의 surface 연결 또는 등록 방식은 같은 플러그인의 `index.ts`에서 함께 갱신한다. 연결된 컴포넌트의 export나 props가 영향을 받을 때만 해당 `*.client.tsx`를 함께 바꾼다.
- RPC 입력·출력이 바뀌면 실제 영향 범위에 따라 같은 플러그인의 `*.shared.ts` 계약, `*.server.ts` 구현, `index.ts`의 `plugin.handle` 등록과 `*.client.tsx` 호출부를 함께 갱신한다.
- 플러그인 디렉터리를 추가·삭제·이름 변경하면 이 파일의 Workspace Map, `.github/ISSUE_TEMPLATE/*.yml`의 대상 선택지와 루트 workspace 검증을 같은 변경에서 맞춘다.
- Paseo 플러그인 계약이 바뀌면 현재 CLI가 생성하는 새 스캐폴드와 공식 참조 문서를 대조하고, 영향받는 각 플러그인의 생성 타입 계약을 확인한다.

## Validation and Runtime Safety

- 한 플러그인의 소스 변경은 먼저 `npm run typecheck --workspace <package-name>`으로 검사한다.
- `branch-garden`의 logic, server, shared 또는 view 동작을 바꾸면 `npm run typecheck --workspace branch-garden`과 `npm test --workspace branch-garden`을 모두 실행한다. Git 명령 변경은 read-only allowlist와 실제 Git 상태 무변경 테스트를 반드시 통과해야 한다.
- `github-project-board`의 logic, server, shared 또는 view 동작을 바꾸면 `npm run typecheck --workspace github-project-board`와 `npm test --workspace github-project-board`를 모두 실행한다. GitHub CLI 명령 변경은 read-only allowlist 테스트를 반드시 통과해야 한다.
- `tailscale-dashboard`의 server, shared 또는 view 동작을 바꾸면 `npm run typecheck --workspace tailscale-dashboard`와 `npm test --workspace tailscale-dashboard`를 모두 실행한다. Tailscale CLI 명령 변경은 `status --json`과 `serve status --json`만 허용하는 read-only allowlist 테스트를 반드시 통과해야 한다.
- `composer-compact`의 client 또는 registration 동작을 바꾸면 `npm run typecheck --workspace composer-compact`와 `npm test --workspace composer-compact`를 모두 실행한다.
- `composer-skills`의 client, catalog, clipboard 또는 registration 동작을 바꾸면 `npm run typecheck --workspace composer-skills`와 `npm test --workspace composer-skills`를 모두 실행한다.
- `file-browser`의 server, shared 또는 view 동작을 바꾸면 `npm run typecheck --workspace file-browser`와 `npm test --workspace file-browser`를 모두 실행한다. Windows 경로 변경은 allowlist 탈출, link·junction, 민감 파일, preview 크기 제한 테스트를 반드시 통과해야 한다. 다운로드 변경은 localhost bind, Tailnet identity, token 만료·재사용, 요청 시 경로 재검증과 streaming response 테스트를 함께 통과해야 한다.
- workspace 구조, 설치 상태 또는 여러 플러그인에 걸친 변경은 루트에서 `npm run typecheck`로 검사한다.
- Git source 설치나 업데이트 경로를 변경하거나 배포를 준비할 때는 루트에서 `npm run check:git-source-imports`를 실행한다. Git 설치는 package manager와 install script를 실행하지 않으므로 runtime import는 host 제공 모듈, Node 기본 모듈과 플러그인 내부 상대 경로만 사용한다.
- 같은 컴퓨터에서 소스를 편집하는 개발 흐름은 directory install과 `plugin reload`, 다른 daemon이나 PC에 배포하는 운영 흐름은 Git source의 `plugin add --path`와 `plugin update`를 사용한다. 기존 directory runtime과 Git 검증 runtime에는 서로 다른 ID를 사용한다.
- 설치·업데이트 또는 재로딩까지 요청된 경우에만 대상 데몬과 source를 확인하고 directory source에는 `paseo plugin install`, Git source에는 `paseo plugin add`/`update`, 소스 변경 반영에는 `paseo plugin reload`를 실행한다. 설치 시 `paseo-plugin.json`의 ID가 기본값이며 `--id`를 지정하면 그 값이 실제 런타임 ID가 된다. 생명주기 명령과 로그 확인 전에는 대상 데몬에서 `paseo plugin ls`를 실행해 실제 런타임 ID를 확인하고, 원격 데몬에는 같은 명령에 `--host <host>`를 사용한다. 명령 실행 후에는 `paseo plugin ls`에서 상태와 오류를 확인한다.
- 플러그인은 신뢰된 비격리 코드다. 데몬의 전역 플러그인 스위치가 꺼져 있거나 없으면 사용자의 명시적 허가 없이 켜지 않는다.
- 소스 변경을 반영하려고 데몬을 재시작하지 않는다. `paseo plugin reload <runtime-id>`를 사용한다.
- 백엔드 오류는 `paseo plugin logs <runtime-id>`로 확인하고, 로그에 자격 증명이나 토큰을 남기지 않는다.
- UI 변경은 가능하면 넓은 화면과 compact 레이아웃, 밝은/어두운 테마에서 확인한다.
