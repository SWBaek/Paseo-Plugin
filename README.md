# Paseo Plugins

여러 개의 독립적인 로컬 [Paseo](https://paseo.sh) 플러그인을 함께 개발하는 npm workspace입니다. 각 `plugins/*` 디렉터리는 자체 manifest와 진입점을 가진 별도의 설치 단위이며, 플러그인끼리 런타임 코드를 공유하지 않습니다.

> **기준 Paseo 버전: `0.7.0-beta.2`** — Plugin API는 실험 단계입니다. 다른 Paseo 버전에서 개발하거나 설치할 때는 현재 공식 문서와 해당 CLI가 생성하는 `paseo-plugin.d.ts`를 먼저 대조하세요. 현재 버전의 전체 확장 지점은 [Paseo Plugin Capabilities](docs/plugin-capabilities/README.md)에 정리되어 있습니다.

> [!WARNING]
> Paseo 플러그인은 신뢰된 비격리 코드입니다. 서버 측 코드는 daemon이 실행되는 컴퓨터의 파일, 프로세스, 자격 증명과 네트워크에 접근할 수 있고, 클라이언트 코드는 Paseo 앱 안에서 실행됩니다. 검토하고 신뢰하는 소스만 설치하세요.

## 포함된 플러그인

| Runtime ID | 대상 | 역할 |
| --- | --- | --- |
| [`paseo-plugin`](plugins/paseo-plugin/) | Public integration | 현재 Paseo CLI의 기본 구조를 따르는 전역 surface 예제이자 새 기여를 실험하는 기본 scaffold입니다. |
| [`branch-garden`](plugins/branch-garden/) | Personal operations | 선택된 host의 활성 Git Workspace와 로컬 branch·worktree 상태를 읽기 전용으로 집계하는 전역 sidebar surface입니다. |
| [`github-project-board`](plugins/github-project-board/) | Personal operations | 기존 GitHub CLI 인증으로 `SWBaek`의 GitHub Projects를 조회하고, 선택한 Project를 읽기 전용 칸반으로 보여주는 전역 sidebar surface입니다. |
| [`tailscale-dashboard`](plugins/tailscale-dashboard/) | Personal operations | 선택된 host의 Tailscale Serve 구성을 읽기 전용으로 조사하고, 검증된 TailscaleOps 핵심 현황을 Paseo 안에 표시합니다. 전체 Dashboard는 필요할 때 시스템 브라우저로 엽니다. |
| [`composer-compact`](plugins/composer-compact/) | Personal productivity | Agent의 Composer track bar에 `Compact` pill을 추가하고 클릭 한 번으로 해당 Agent에 `/compact`를 전송합니다. |

Runtime ID의 기준은 디렉터리명이나 package 이름이 아니라 각 플러그인의 `paseo-plugin.json`입니다.

## 시작하기

필요한 도구:

- Paseo Desktop/daemon/CLI `0.7.0-beta.2`
- Node.js와 npm
- `github-project-board`를 사용할 경우 인증된 [GitHub CLI](https://cli.github.com/)
- `tailscale-dashboard`를 사용할 경우 로그인된 [Tailscale CLI](https://tailscale.com/docs/reference/tailscale-cli)와 HTTPS Serve로 공개된 TailscaleOps Dashboard

루트에서 의존성을 설치하고 모든 workspace를 타입 검사합니다.

```powershell
npm install
npm run check:git-source-imports
npm run typecheck
```

동작 로직이 있는 플러그인의 테스트도 실행할 수 있습니다.

```powershell
npm test --workspace branch-garden
npm test --workspace github-project-board
npm test --workspace tailscale-dashboard
npm test --workspace composer-compact
```

플러그인 하나만 검사할 때는 package 이름을 workspace 선택자로 사용합니다.

```powershell
npm run typecheck --workspace branch-garden
```

## 로컬 설치와 reload

먼저 대상 daemon의 **Settings → Plugins**에서 플러그인이 활성화되어 있는지 확인하세요. 전역 플러그인 switch를 켜는 것은 해당 daemon에서 모든 신뢰된 플러그인 코드를 허용하는 보안 결정입니다.

저장소 루트에서 절대 경로로 원하는 플러그인을 설치합니다.

```powershell
$repoRoot = (Resolve-Path .).Path
paseo plugin install (Join-Path $repoRoot "plugins\branch-garden")
paseo plugin install (Join-Path $repoRoot "plugins\github-project-board")
paseo plugin install (Join-Path $repoRoot "plugins\tailscale-dashboard")
paseo plugin install (Join-Path $repoRoot "plugins\composer-compact")
paseo plugin ls
```

소스를 변경한 뒤에는 daemon을 재시작하지 말고 실제 runtime ID로 reload합니다.

```powershell
npm run typecheck --workspace branch-garden
npm test --workspace branch-garden
paseo plugin reload branch-garden
paseo plugin ls
paseo plugin logs branch-garden
```

다른 host의 daemon을 관리할 때는 plugin 명령에 `--host <host>`를 추가합니다. 설치·reload·제거를 수행하기 전에는 `paseo plugin ls`로 대상 host와 runtime ID를 확인하세요.

## Git source 배포와 update

다른 daemon이나 PC에 배포할 때는 Git source와 monorepo `--path`를 사용합니다. Git 설치는 package manager나 install script를 실행하지 않으므로 먼저 runtime import 검사와 타입 검사를 통과시켜야 합니다.

```powershell
npm run check:git-source-imports
npm run typecheck
paseo plugin add SWBaek/Paseo-Plugin --path plugins/branch-garden
paseo plugin add SWBaek/Paseo-Plugin --path plugins/github-project-board
paseo plugin add SWBaek/Paseo-Plugin --path plugins/tailscale-dashboard
paseo plugin add SWBaek/Paseo-Plugin --path plugins/composer-compact
paseo plugin status
paseo plugin update --all
```

`--ref`를 생략하면 default branch를 추적하고, 명시적 branch는 새 commit을 추적하며, tag와 commit은 고정됩니다. 기존 directory 설치와 Git 설치에 같은 runtime ID를 사용하지 마세요. 임시 ID를 이용한 검증, 실패 후보 롤백과 정리 절차는 [Git source 설치와 업데이트](docs/GIT_INSTALLATION.md)에 정리되어 있습니다.

## 저장소 구조

```text
.
├── plugins/
│   ├── paseo-plugin/
│   ├── branch-garden/
│   ├── github-project-board/
│   ├── tailscale-dashboard/
│   └── composer-compact/
├── docs/
│   ├── DESIGN.md
│   ├── GIT_INSTALLATION.md
│   └── plugin-capabilities/
├── scripts/
│   └── check-git-source-imports.mjs
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── ISSUE_MANAGEMENT.md
├── AGENTS.md
└── package.json
```

플러그인 안에서는 파일 역할을 다음처럼 나눕니다.

| 파일 | 역할 |
| --- | --- |
| `index.ts` | 기여 등록, RPC handler 연결과 cleanup 수명주기 |
| `*.client.tsx` | React Native UI, hook, theme와 responsive layout |
| `*.server.ts` | 파일 시스템, 프로세스, 자격 증명과 외부 API 같은 daemon 측 동작 |
| `*.shared.ts` | 클라이언트와 서버가 공유하는 Zod RPC 계약과 순수 값 |
| `paseo-plugin.json` | 기본 설치 runtime ID |
| `paseo-plugin.d.ts` | 설치된 Paseo CLI가 생성한 로컬 타입 검사 계약 |

클라이언트 모듈에서 `*.server.ts`를 가져오거나 서버 모듈에서 `*.client.tsx`를 가져오지 않습니다. 화면 안에서 별도의 Paseo client를 생성하지 않고 host가 제공한 Paseo API와 plugin RPC를 사용합니다.

## 개발 원칙

- UI 변경은 [Paseo Plugin Design Rules](docs/DESIGN.md)를 따릅니다.
- 새 기여 지점을 선택할 때는 [Paseo Plugin Capabilities](docs/plugin-capabilities/README.md)에서 현재 지원 범위와 제한을 먼저 확인합니다.
- wide/compact layout, 밝은/어두운 theme, loading·empty·error·disabled 상태와 접근성을 함께 확인합니다.
- Git 또는 GitHub CLI 명령은 read-only allowlist와 상태 무변경 테스트를 유지합니다.
- Git source로 배포하기 전에 `npm run check:git-source-imports`로 install 없이 사용할 수 없는 runtime dependency를 차단합니다.
- 한 플러그인만 변경하면 해당 workspace를, 공통 계약·설치 상태·여러 플러그인을 변경하면 루트 전체를 검증합니다.
- Plugin API 계약을 바꾸거나 새 기여 유형을 사용할 때는 공식 문서와 현재 CLI의 새 scaffold를 대조합니다.

상세한 저장소 작업 규칙은 [AGENTS.md](AGENTS.md)를 참고하세요.

## 이슈와 작업 관리

아이디어, 개발 계획과 버그는 [GitHub Issues](https://github.com/SWBaek/Paseo-Plugin/issues)에서 관리합니다. 새 이슈는 `.github/ISSUE_TEMPLATE/`의 양식을 사용하고, 상태·우선순위·하위 Issue·PR 연결 방식은 [Issue 관리 규칙](.github/ISSUE_MANAGEMENT.md)을 따릅니다.

## 공식 문서

- [Paseo Plugin quickstart](https://paseo.sh/docs/plugins)
- [Paseo Plugin reference](https://paseo.sh/docs/plugins/reference)
- [Paseo CLI](https://paseo.sh/docs/cli)
- [Paseo TypeScript SDK](https://paseo.sh/docs/sdk/reference)
