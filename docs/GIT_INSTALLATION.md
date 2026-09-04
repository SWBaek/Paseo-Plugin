# Git source 설치와 업데이트

이 문서는 Paseo `0.7.2`에서 이 monorepo의 개별 플러그인을 Git source로 배포하는 절차를 설명합니다. Git source는 다른 daemon이나 PC에 배포하고 추적 ref를 업데이트하는 운영 경로입니다. 같은 컴퓨터에서 소스를 편집하는 동안에는 directory source 설치와 `plugin reload`를 사용하세요.

> [!WARNING]
> Paseo 플러그인은 신뢰된 비격리 코드입니다. 설치 전에 source와 대상 daemon을 확인하고, 전역 플러그인 switch가 꺼져 있으면 사용자의 명시적 승인 없이 켜지 마세요.

## Directory source와 Git source

| 용도 | Source | 반영 명령 | 특징 |
| --- | --- | --- | --- |
| 로컬 개발 | 절대 directory 경로 | `paseo plugin reload <runtime-id>` | 현재 working tree를 다시 compile합니다. |
| 배포·운영 | Git remote와 monorepo `repository:relative/path` | `paseo plugin update <runtime-id>` | managed checkout의 추적 ref를 검증한 뒤 교체합니다. |

두 방식은 같은 runtime ID를 공유하지 마세요. 기존 directory 설치가 있는 daemon에서 Git 흐름을 검증할 때는 `--id <temporary-id>`로 별도 runtime을 만들고 검증 후 제거합니다.

## 사전 검사

대상 daemon과 현재 runtime ID를 먼저 확인합니다.

```powershell
paseo --version
paseo daemon status --json
paseo plugin ls
```

Paseo는 lockfile을 보고 package manager나 install script를 자동 실행하지 않습니다. Manifest에 `build`가 없으면 배포할 source의 runtime import를 Paseo 제공 모듈, Node 기본 모듈과 플러그인 내부 상대 경로로 한정해야 합니다. 이 저장소의 현재 플러그인은 모두 이 방식이며 `build`가 필요하지 않습니다.

```powershell
npm run check:git-source-imports
npm run check:docs-sync
npm run typecheck
```

자동 검사는 테스트와 TypeScript declaration을 제외한 각 플러그인의 source를 확인합니다. `@getpaseo/plugin`, `@getpaseo/plugin/server`, React·React Native·TanStack Query·Zod, Node 기본 모듈과 상대 import만 runtime dependency로 허용합니다. `import type`은 bundle에서 제거되므로 검사 대상이 아닙니다.

## Monorepo 플러그인 설치

manifest의 기본 runtime ID로 설치합니다.

```powershell
paseo plugin add SWBaek/Paseo-Plugin:plugins/branch-garden
paseo plugin add SWBaek/Paseo-Plugin:plugins/github-project-board
paseo plugin add SWBaek/Paseo-Plugin:plugins/tailscale-dashboard
paseo plugin add SWBaek/Paseo-Plugin:plugins/composer-compact
paseo plugin add SWBaek/Paseo-Plugin:plugins/composer-skills
paseo plugin add SWBaek/Paseo-Plugin:plugins/file-browser
paseo plugin add SWBaek/Paseo-Plugin:plugins/provider-usage
paseo plugin ls
```

기존 runtime과 충돌하지 않는 검증 ID가 필요하면 다음처럼 지정합니다.

```powershell
paseo plugin add SWBaek/Paseo-Plugin:plugins/branch-garden `
  --id branch-garden-git-verify
```

`--path`는 기존 자동화와의 호환을 위한 legacy 형식입니다. 새 명령과 문서에는 source 뒤에 `:relative/path`를 붙이는 canonical 형식을 사용합니다.

## 선택적 build 명령

대부분의 플러그인은 `build`를 생략해야 합니다. Paseo가 제공하지 않는 의존성을 설치하거나 source·asset 생성이 반드시 필요할 때만 `paseo-plugin.json`에 argv 배열 목록을 선언합니다.

```json
{
  "id": "example-plugin",
  "build": [
    ["npm", "ci"],
    ["npm", "run", "build"]
  ]
}
```

Paseo는 정확한 commit과 manifest를 확인한 뒤 staged plugin directory에서 각 executable을 shell 없이 직접 실행합니다. Install과 update 모두 validation·compile·activation 전에 이 명령을 실행하며, package manager나 명령을 lockfile에서 추론하지 않습니다.

`build`도 플러그인과 마찬가지로 신뢰된 비격리 코드입니다. 대상 daemon 사용자의 파일·프로세스·자격 증명과 네트워크 권한으로 실행되고, `--host`를 사용하면 원격 daemon host에서 실행됩니다. 명령이 실패하면 후보를 폐기하고 기존 설치·실행 버전을 유지하므로 출력과 daemon log를 확인한 뒤 source를 수정해 다시 update합니다.

설치 결과에서 `source`가 `git`, `status`가 `running`, `path`가 daemon home 아래 managed checkout인지 확인합니다. 실패하면 `paseo plugin logs <runtime-id>`로 초기화와 compile 오류를 확인합니다.

## Ref 선택

| 옵션 | 동작 |
| --- | --- |
| `--ref` 생략 | remote의 default branch를 추적합니다. |
| `--ref main` 같은 branch | 명시한 branch의 새 commit을 추적합니다. |
| `--ref v0.1.0` 같은 tag | 해당 tag에 고정되며 자동 추적하지 않습니다. |
| `--ref <commit-sha>` | 해당 commit에 고정됩니다. |

운영 환경에서 변경 시점을 통제하려면 tag나 commit을 사용하고, 지속 배포가 필요할 때만 branch를 추적하세요.

## 상태 확인과 업데이트

```powershell
paseo plugin status
paseo plugin status branch-garden
paseo plugin update branch-garden
paseo plugin update --all
paseo plugin ls
```

`status`는 현재 commit, remote의 최신 commit, 뒤처진 commit 수와 업데이트 가능 여부를 반환합니다. `update --all`은 Git-managed runtime만 대상으로 하며 directory source는 변경하지 않습니다.

Paseo는 후보 commit을 checkout하고 compile·초기화한 뒤 정상 시작한 경우에만 활성 버전을 교체합니다. 후보가 시작에 실패하면 update 명령은 실패하고 이전 commit이 계속 `running` 상태로 유지됩니다. 이때 `status`에는 실패 후보가 여전히 업데이트 가능 상태로 남습니다. 원격 ref를 수정한 뒤 다시 `plugin update`를 실행하세요.

이 롤백은 Git source update에만 적용됩니다. directory source의 `plugin reload` 실패는 이전 bundle로 자동 복귀하지 않습니다.

## 제거와 정리

```powershell
paseo plugin remove branch-garden-git-verify
paseo plugin ls
```

Git source를 제거하면 runtime 설정과 managed checkout이 함께 제거됩니다. 원본 Git 저장소는 삭제되지 않습니다. 검증을 마친 뒤 임시 runtime이 목록에서 사라졌고 기존 runtime이 계속 `running`인지 확인하세요.

## 과거 0.7.0-beta.1 검증 기록

아래 내용은 현재 기준 버전인 `0.7.2`의 검증 결과가 아니라, Git source 흐름을 처음 도입할 때 남긴 역사적 기록입니다. 2026-08-28에 로컬 Paseo `0.7.0-beta.1` daemon에서 다음 경로를 실제 검증했습니다.

- `plugins/branch-garden`과 `plugins/github-project-board`를 서로 다른 임시 runtime ID로 설치했습니다.
- 두 managed checkout에 `node_modules`가 없는 상태에서 모두 `running`이 되었습니다.
- 추적 branch를 한 commit 진행했을 때 `plugin status`가 `commitsBehind: 1`, `updateAvailable: true`를 보고했습니다.
- `plugin update --all`이 업데이트 대상만 새 commit으로 전환했고 기존 directory runtime은 변경하지 않았습니다.
- 초기화 중 예외를 발생시키는 후보로 단일 update를 실행했을 때 명령은 실패했지만 이전 commit의 runtime은 계속 `running`이었습니다.
- 복구 commit을 올린 뒤 단일 update가 성공했고 상태가 최신으로 돌아왔습니다.
- 모든 임시 runtime, managed checkout과 원격 검증 branch를 제거한 뒤 기존 `branch-garden`, `github-project-board`가 계속 `running`임을 확인했습니다.

현재 계약의 기준은 안정판 [Plugin quickstart](https://paseo.sh/docs/plugins/v0.7)와 [Plugin reference의 CLI reference](https://paseo.sh/docs/plugins/v0.7/reference#cli-reference)입니다.
