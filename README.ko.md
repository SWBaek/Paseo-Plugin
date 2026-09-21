# Paseo Plugins

[English](README.md) · [플러그인 선택](#포함된-플러그인) · [호환성](docs/COMPATIBILITY.md) · [설정](docs/CONFIGURATION.md) · [지원](SUPPORT.md) · [기여](CONTRIBUTING.md)

Paseo에서 Git 작업 상태를 살펴보고, 공급자 사용량을 확인하고, 반복 프롬프트를 저장해 보내고 Windows 명령을 실행하는 네 플러그인입니다. 필요한 것만 개별 설치할 수 있습니다. NaruForge와 기여자가 관리하는 커뮤니티 프로젝트로, Paseo 팀의 공식 운영·보증 저장소가 아닙니다.

**현재 소스:** 컬렉션 **v0.1.0-rc.4**는 Paseo **0.9.0-beta.2**용 네 플러그인을 포함합니다. SDK와 `requirements.paseo: ^0.9.0`을 0.9에 맞췄습니다. 컬렉션은 prerelease이며 [0.9 검증 범위와 한계](docs/verification/paseo-0.9.0-beta.2.md)를 확인하세요. daemon·app·CLI 모두 0.9.0-beta.2를 사용합니다.

기존 [v0.1.0-rc.2](https://github.com/NaruForge/Paseo-Plugin/releases/tag/v0.1.0-rc.2)는 Paseo 0.7.2용으로 보존합니다. 이전 사용자 Runtime·Git 검증 보고는 당시 범위를 유지하며 새 pill 구현의 정식 앱 검증을 대신하지 않습니다.

## 포함된 플러그인

| 플러그인 | 역할 | 현재 소스 요구 사항 | 성숙도·배포 상태 |
| --- | --- | --- | --- |
| [`branch-garden`](plugins/branch-garden/) | Git Project·Workspace와 branch·worktree 상태를 읽기 전용으로 모아 봅니다. | Paseo 0.9.0-beta.2, host의 Git과 등록된 Project/Workspace | Preview; v0.1.0-rc.4 |
| [`command-deck`](plugins/command-deck/) | Project별 PowerShell 명령을 저장하고 Composer에서 실행·출력 조회·중지합니다. | Windows Host, PowerShell 7, Paseo 0.9.0-beta.2 | Experimental; v0.1.0-rc.4·앱 runtime 검증 대기 |
| [`prompt-palette`](plugins/prompt-palette/) | 반복 프롬프트를 저장하고 Composer에서 미리 본 뒤 보냅니다. | Paseo 0.9.0-beta.2, Workspace가 있는 기존 Agent | Experimental; v0.1.0-rc.4 |
| [`provider-usage`](plugins/provider-usage/) | 활성 Provider 연결의 사용량을 표시하고 Composer pill을 설정합니다. | Paseo 0.9.0-beta.2, 활성 Provider 연결 | Experimental; v0.1.0-rc.4 |

Branch Garden과 Provider Usage가 핵심 유지보수 대상이며 Prompt Palette와 Command Deck은 신규 실험 기능입니다. Branch Garden UI는 영어이고 Provider Usage에는 한국어 상태 문구가 남아 있습니다. 개별 가이드는 영어입니다. 각 가이드의 대표 이미지는 설치된 Paseo 0.8.0 Windows 앱에서 촬영했습니다. [촬영 범위](docs/verification/plugin-screenshots-0.8.0.md)를 참고하세요.

## 시작하기

먼저 설치할 버전을 고르세요. 0.7.2 사용자는 아래 공개 태그를 고정하고, 0.8 평가 사용자는 [로컬 설치](#로컬-설치와-reload)로 이동합니다. 사용자 설치에는 npm 검사나 전체 컬렉션 설치가 필요하지 않습니다.

플러그인은 신뢰된 비격리 코드로 daemon 사용자의 파일·프로세스·네트워크 권한으로 실행됩니다. Git과 사용량 조회는 읽기 전용입니다. Prompt Palette는 설정 저장과 명시적인 Agent 전송을, Command Deck은 저장한 PowerShell을 daemon 사용자 권한으로 실행·중지합니다. [보안·데이터 접근](SECURITY.md)을 확인하고 신뢰하기로 결정한 뒤 대상 daemon의 **Settings → Plugins**에서 활성화하세요.

### 공개 0.7 릴리스 설치

Paseo daemon/app/CLI **0.7.2**에서 원하는 플러그인의 명령 하나를 선택합니다. Branch Garden은 daemon host의 Git과 등록된 Project/Workspace가 필요하고, 이 버전의 Provider Usage는 기존 Codex/Grok 인증을 사용합니다.

```powershell
paseo plugin add NaruForge/Paseo-Plugin:plugins/branch-garden --ref v0.1.0-rc.2
paseo plugin add NaruForge/Paseo-Plugin:plugins/provider-usage --ref v0.1.0-rc.2
```

설치 후 `paseo plugin ls`에서 선택한 ID가 `running`이고 load error가 없는지 확인하세요. 0.7 사용법은 해당 태그의 [Branch Garden 가이드](https://github.com/NaruForge/Paseo-Plugin/blob/v0.1.0-rc.2/plugins/branch-garden/README.md#use)와 [Provider Usage 가이드](https://github.com/NaruForge/Paseo-Plugin/blob/v0.1.0-rc.2/plugins/provider-usage/README.md#use)를 따릅니다.

태그 안의 가이드와 릴리스 노트는 과거 명령 예시도 보존합니다. 설치·업데이트·제거 명령은 이 README의 현재 `NaruForge/` 안내를 따르세요.

## 로컬 설치와 reload

현재 소스 평가에는 **0.9.0-beta.2 daemon/app/CLI**를 사용합니다. daemon host에 저장소를 clone하고 루트로 이동한 뒤 commit과 소스를 검토하세요. 기존 checkout이 있다면 그 루트에서 ref와 로컬 변경을 먼저 확인합니다.

```powershell
git clone https://github.com/NaruForge/Paseo-Plugin.git
cd Paseo-Plugin
git rev-parse HEAD
```

다음은 저장소 루트에서 실행하는 PowerShell 예시입니다. 먼저 `paseo plugin ls`로 설치 상태와 ID를 확인하고 **원하는 설치 명령 하나만** 선택하세요. 기본 ID는 각 `paseo-plugin.json`에 있습니다. 기존 설치가 같은 ID를 쓰면 `--id branch-garden-dev`처럼 별도 ID를 지정합니다.

```powershell
$repoRoot = (Resolve-Path .).Path
paseo plugin ls
paseo plugin install (Join-Path $repoRoot "plugins\branch-garden")
paseo plugin install (Join-Path $repoRoot "plugins\provider-usage")
paseo plugin install (Join-Path $repoRoot "plugins\prompt-palette")
paseo plugin install (Join-Path $repoRoot "plugins\command-deck")
paseo plugin ls
```

설치한 ID가 `running`이고 오류가 없으면 다음 위치에서 사용합니다.

- Branch Garden: sidebar에서 열고 host를 선택한 뒤 Refresh. 등록된 저장소가 없거나 필터에 맞지 않으면 빈 결과가 정상입니다.
- Provider Usage: Command Center의 Open provider usage. Sidebar 표시는 Settings → Layout, pill은 Settings → Plugins → Provider Usage에서 조절합니다. 미지원 사용량은 조회 불가로 남습니다.
- Command Deck: Settings → Plugins → Command Deck에서 Project를 고르고 명령을 저장합니다. Composer의 Commands 또는 Command Center의 Open workspace commands에서 실행·출력·중지를 제공합니다. 처음에는 빈 명령 목록이 정상입니다. 설치된 앱·모바일 검증은 별도로 필요합니다.
- Prompt Palette: Settings → Plugins → Prompt Palette에서 프롬프트를 추가하고 Apply to draft → Save changes. 기존 Agent의 Prompts에서 본문과 대상을 확인한 뒤 Send합니다. 처음에는 빈 라이브러리가 정상입니다.

검토한 소스 변경을 반영할 때는 실제 ID로 `paseo plugin reload <runtime-id>`를 실행한 뒤 `paseo plugin ls`를 확인합니다. daemon을 재시작하지 않습니다. 원격 CLI 옵션은 `paseo --host <host> plugin ls`처럼 명령 앞에 둡니다.

## Git source 배포와 update

다른 daemon이나 PC에는 Git source를 사용합니다. `--ref`를 생략하면 **이미 0.9 소스인 main**을 추적하므로 0.7·0.8 사용자는 기존 태그를 고정하세요. Branch는 새 commit을 추적하고 tag/commit은 고정됩니다.

0.9 Git 평가에는 `v0.1.0-rc.2`나 `v0.1.0-rc.3`을 쓰지 마세요. 아래 `v0.1.0-rc.4` 태그를 검토하고 **명령 하나만** 선택하세요. 이 명령은 Git 경로의 실행 검증을 완료했다는 뜻이 아닙니다.

```powershell
paseo plugin add NaruForge/Paseo-Plugin:plugins/branch-garden --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/provider-usage --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/prompt-palette --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/command-deck --ref v0.1.0-rc.4
```

위 명령은 `v0.1.0-rc.4` 태그를 고정합니다. 다른 ref를 선택하려면 해당 소스와 지원 버전을 먼저 검토하세요.

업데이트는 `paseo plugin status <runtime-id>`로 ref를 확인한 뒤 `paseo plugin update <runtime-id>`를 실행합니다. 고정 태그는 이동하지 않습니다. Source 선택·원격 명령·실패 후보 복구는 [Git 설치 안내](docs/GIT_INSTALLATION.md)를 참고하세요.

## 설정·문제 해결·제거

Branch Garden은 별도 저장 설정이 없습니다. Provider Usage의 표시 설정과 Prompt Palette의 라이브러리는 내장 Host Settings에 저장되며 update/reload 뒤에도 유지됩니다. **설치를 제거하면 해당 설정과 라이브러리는 삭제됩니다.** 제거·재설치 전에 표시 설정을 기록하고 필요한 프롬프트를 복사하세요. Prompt Palette에는 import/export 기능이 없습니다. Command Deck도 제거 시 명령 설정과 설치 식별자가 삭제됩니다. 기존 터미널은 자동 종료하지 않으며 재설치 후 자동 연결되지 않으므로, 제거 전에 필요한 출력을 복사하고 터미널을 직접 정리하세요.

문제가 있으면 대상 host에서 `paseo plugin ls`와 `paseo plugin logs <runtime-id>`로 확인하고 [지원 안내](SUPPORT.md)를 따라 비밀 정보를 뺀 증상·버전·ref를 보고하세요. 제거는 문제 해결의 필수 단계가 아닙니다. 원할 때만 `paseo plugin remove <runtime-id>`를 실행하고 목록에서 해당 ID가 사라졌는지 확인합니다. 원본 Git 저장소와 공급자 인증은 삭제되지 않습니다.

플러그인별 [업데이트·제거 안내](docs/CONFIGURATION.md#update-and-remove), [설정](docs/CONFIGURATION.md), [과거 제거된 플러그인](docs/REMOVED_PLUGINS.md)을 참고하세요.

## 개발하기

이 저장소는 네 플러그인의 npm workspace입니다. 소스 기여에는 Node.js 22, npm과 Git을 사용하며 저장소 루트에서 다음을 실행합니다. 사용자 설치와 별도의 개발 검사입니다.

```powershell
npm ci
npm run check
```

변경 범위별 검사와 기여 절차는 [Contributing](CONTRIBUTING.md), 0.9 계약과 이관 배경은 [이관 안내](docs/MIGRATION_0.9.md)에 있습니다.

## 저장소 구조

```text
.
├── plugins/
│   ├── branch-garden/
│   ├── provider-usage/
│   ├── prompt-palette/
│   └── command-deck/
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

플러그인은 `index.client.tsx`·`index.server.ts`와 `client/`·`server/`·`shared/`를 사용합니다. 아래 표는 현재 소스 경로입니다. 새 등록·import·cleanup 규칙은 [이관 안내](docs/MIGRATION_0.8.md#파일과-import-이동)를 따릅니다.

| 파일 | 역할 |
| --- | --- |
| `index.client.tsx`, `index.server.ts` | client 기여와 server RPC·Settings 등록, cleanup |
| `client/*.ts` | client contribution 조립, 구독과 controller cleanup |
| `client/*.tsx` | React Native UI, hook, theme와 responsive layout |
| `server/*.ts` | 파일 시스템, 프로세스, 자격 증명과 외부 API 같은 daemon 측 동작 |
| `shared/*.ts` | 클라이언트와 서버가 공유하는 Zod RPC 계약과 순수 값 |
| `*.logic.ts`, `*.view.ts` | runtime에 의존하지 않는 판단과 표시용 파생 값 |
| `*-registration.ts` 등 helper | client 등록, query, modal과 비동기 controller 수명주기 |
| `paseo-plugin.json` | 기본 설치 runtime ID |
| `package.json` | 로컬 타입 검사에 사용하는 exact `@getpaseo/plugin` 개발 의존성 |

클라이언트 모듈에서 `server/`를 가져오거나 서버 모듈에서 `client/`를 가져오지 않습니다. 화면 안에서 별도의 Paseo client를 생성하지 않고 host가 제공한 Paseo API와 plugin RPC를 사용합니다.

## 개발 원칙

- UI 변경은 [Paseo Plugin Design Rules](docs/DESIGN.md)를 따릅니다.
- 0.8의 새 기여 지점을 선택할 때는 [Paseo Plugin Capabilities](docs/plugin-capabilities/README.md)에서 지원 범위와 제한을 확인합니다. 기존 0.7 소스에 신규 API를 바로 적용하지 않습니다.
- UI 검수는 디자인 규칙의 영향 기반 A–D 등급을 적용합니다. 변경이 영향을 주는 layout·theme·상태·접근성만 확인하고, D 등급에서 wide/compact와 밝은/어두운 theme를 모두 확인합니다.
- Git 명령은 read-only allowlist와 상태 무변경 테스트를 유지합니다.
- Git source로 배포하기 전에 `npm run check:git-source-imports`로 install 없이 사용할 수 없는 runtime dependency를 차단합니다.
- 한 플러그인만 변경하면 해당 workspace를, 공통 계약·설치 상태·여러 플러그인을 변경하면 루트 전체를 검증합니다.
- Plugin API 계약을 바꾸거나 새 기여 유형을 사용할 때는 공식 문서와 현재 CLI의 새 scaffold를 대조합니다.

상세한 저장소 작업 규칙은 [AGENTS.md](AGENTS.md)를 참고하세요.

## 이슈와 작업 관리

아이디어, 개발 계획과 버그는 [GitHub Issues](https://github.com/NaruForge/Paseo-Plugin/issues)에서 관리합니다. 새 이슈는 `.github/ISSUE_TEMPLATE/`의 양식을 사용하고, 상태·우선순위·하위 Issue·PR 연결 방식은 [Issue 관리 규칙](.github/ISSUE_MANAGEMENT.md)을 따릅니다.

## 공식 문서

- [Paseo Plugin 문서 버전 선택](https://paseo.sh/docs/plugins)
- [Paseo v0.7 Plugin quickstart](https://paseo.sh/docs/plugins/v0.7)
- [Paseo v0.7 Plugin reference](https://paseo.sh/docs/plugins/v0.7/reference)
- [Paseo v0.8 quickstart](https://paseo.sh/docs/plugins/v0.8)
- [Paseo v0.8 reference](https://paseo.sh/docs/plugins/v0.8/reference)
- [Paseo v0.8 migration](https://paseo.sh/docs/plugins/v0.8/migration)
- [Paseo v0.8 provider plugins](https://paseo.sh/docs/plugins/v0.8/providers)
- [Paseo CLI](https://paseo.sh/docs/cli)
- [Paseo TypeScript SDK](https://paseo.sh/docs/sdk/reference)
