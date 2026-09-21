# Git source 설치와 업데이트

현재 **v0.1.0-rc.4**는 Paseo **0.9.0-beta.2**용 네 플러그인입니다. [0.9 검증 기록](verification/paseo-0.9.0-beta.2.md)을 확인하고 daemon·app·CLI를 모두 0.9.0-beta.2로 맞추세요. `^0.8.0` manifest는 0.9에서 거부됩니다. 과거 `v0.1.0-rc.3`는 0.8.0용, `v0.1.0-rc.2`는 0.7.2용으로 보존합니다. 같은 컴퓨터의 개발에는 directory install/reload, 다른 daemon이나 PC 배포에는 Git source를 사용합니다.

```powershell
paseo plugin add NaruForge/Paseo-Plugin:plugins/branch-garden --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/provider-usage --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/prompt-palette --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/command-deck --ref v0.1.0-rc.4
```

원하는 명령 하나만 선택합니다. 설치된 Settings를 보존하려면 업데이트 가능한 branch source에는 `plugin update`를 사용하세요. 고정 태그의 전환에 remove/re-add가 필요하면 아래 백업·복구 절차를 먼저 따릅니다.

0.9의 SDK·manifest 변경은 [이관 안내](MIGRATION_0.9.md)를 따릅니다. 0.8 runtime entry는 [0.8 이관](MIGRATION_0.8.md)에 보존합니다. 아래 과거 0.7 설치 절차는 0.7.2 daemon/client 대상입니다. 0.9에는 위 rc.4 명령을 사용합니다.

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

사용자 설치에는 npm 실행이 필요하지 않습니다. 이 저장소의 기존 플러그인 source에는 build 명령이 없습니다. 개발자가 소스를 변경해 배포할 때의 검사와 선택적 build는 [개발자 사전 검사](#개발자-사전-검사)에서 따로 설명합니다.

## Monorepo 플러그인 설치

현재 0.7 호환 태그를 manifest의 기본 runtime ID로 설치합니다. 원하는 명령 하나 또는 두 개를 선택하세요.

```powershell
paseo plugin add NaruForge/Paseo-Plugin:plugins/branch-garden --ref v0.1.0-rc.2
paseo plugin add NaruForge/Paseo-Plugin:plugins/provider-usage --ref v0.1.0-rc.2
paseo plugin ls
```

기존 runtime과 충돌하지 않는 검증 ID가 필요하면 다음처럼 지정합니다.

```powershell
paseo plugin add NaruForge/Paseo-Plugin:plugins/branch-garden `
  --ref v0.1.0-rc.2 --id branch-garden-git-verify
```

설치 후 `plugin ls`에서 `source`가 `git`, `status`가 `running`이고 load error가 없는지 확인합니다. 0.7 사용법은 태그의 [Branch Garden](https://github.com/NaruForge/Paseo-Plugin/blob/v0.1.0-rc.2/plugins/branch-garden/README.md#use) 또는 [Provider Usage](https://github.com/NaruForge/Paseo-Plugin/blob/v0.1.0-rc.2/plugins/provider-usage/README.md#use) 가이드를 따릅니다. 태그 문서의 과거 설치·관리 명령 대신 이 문서의 현재 명령을 사용하세요.

`--path`는 기존 자동화와의 호환을 위한 legacy 형식입니다. 새 명령과 문서에는 source 뒤에 `:relative/path`를 붙이는 canonical 형식을 사용합니다.

## 0.8 소스 Git 평가

네 플러그인의 현재 소스는 main에 있습니다. `v0.1.0-rc.2`는 Paseo 0.7.2용 Branch Garden과 Provider Usage만 포함하며 Prompt Palette와 Command Deck은 없습니다. `v0.1.0-rc.3`는 0.8.0용입니다. 0.9 평가에는 그 태그들을 쓰지 마세요. 아래 rc.4 태그를 검토하고 0.9.0-beta.2 daemon/app에서 **명령 하나만** 선택하세요. 아래 명령을 실행하는 것 자체가 검증 완료는 아닙니다. 세 플러그인의 add/update/실패 복구 증거는 [0.8 Git 검증 기록](verification/paseo-0.8-git-source.md)에 있고, Command Deck Git 경로는 포함되지 않습니다.

```powershell
paseo plugin add NaruForge/Paseo-Plugin:plugins/branch-garden --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/provider-usage --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/prompt-palette --ref v0.1.0-rc.4
paseo plugin add NaruForge/Paseo-Plugin:plugins/command-deck --ref v0.1.0-rc.4
```

위 명령은 `v0.1.0-rc.4` 태그를 고정합니다. 다른 ref를 선택하려면 해당 소스와 지원 버전을 먼저 검토하세요.

현재 로컬 개발은 컬렉션 [0.9 평가](../README.md#evaluate-current-09-source)와 각 플러그인 가이드의 directory 설치를 사용합니다. 세 플러그인의 Git 활성화·업데이트·실패 복구는 [0.8 Git 검증 기록](verification/paseo-0.8-git-source.md)을 따르고, Command Deck Git 활성화는 아직 수행하지 않았습니다.

## Ref 선택

| 옵션 | 동작 |
| --- | --- |
| `--ref` 생략 | remote의 default branch를 추적합니다. |
| `--ref main` 같은 branch | 명시한 branch의 새 commit을 추적합니다. |
| `--ref v0.1.0` 같은 tag | 해당 tag에 고정되며 자동 추적하지 않습니다. |
| `--ref <commit-sha>` | 해당 commit에 고정됩니다. |

운영 환경에서 변경 시점을 통제하려면 tag나 commit을 사용하고, 지속 배포가 필요할 때만 branch를 추적하세요.

0.7 사용자는 기존 태그·commit을 보존하세요. Default branch에는 이미 0.8 소스가 있으므로 이를 추적하면 0.7과 호환되지 않는 업데이트 후보를 받습니다. 0.8 이전 버전은 새 `requirements.paseo` 진단을 이해하지 못하므로 범위 선언만으로 0.7 설치를 보호할 수 없습니다. 위 태그 고정 설치는 `update`로 새 commit을 받지 않습니다.

## 상태 확인과 업데이트

```powershell
paseo plugin ls
paseo plugin status branch-garden
```

선택한 Git 설치를 업데이트하려면:

```powershell
paseo plugin update branch-garden
paseo plugin ls
```

`status`는 현재 commit, remote의 최신 commit, 뒤처진 commit 수와 업데이트 가능 여부를 반환합니다. 필요한 경우에만 `paseo plugin update --all`로 모든 Git-managed runtime을 업데이트할 수 있으며 directory source는 변경하지 않습니다.

Paseo는 후보 commit을 checkout하고 compile·초기화한 뒤 정상 시작한 경우에만 활성 버전을 교체합니다. 후보가 시작에 실패하면 update 명령은 실패하고 이전 commit이 계속 `running` 상태로 유지됩니다. 이때 `status`에는 실패 후보가 여전히 업데이트 가능 상태로 남습니다. 원격 ref를 수정한 뒤 다시 `plugin update`를 실행하세요.

이 롤백은 Git source update에만 적용됩니다. directory source의 `plugin reload` 실패는 이전 bundle로 자동 복귀하지 않습니다.

## 제거와 정리

제거는 선택적 작업이며 오류 진단을 위해 실행할 필요는 없습니다. 먼저 `paseo plugin ls`에서 대상 host와 실제 runtime ID를 확인하세요.

**현재 0.8 Provider Usage는 표시 설정을, Prompt Palette는 프롬프트 라이브러리를, Command Deck은 명령과 설치 식별자를 제거 시 삭제합니다.** 재설치 전에 설정을 기록하고 필요한 프롬프트와 명령을 복사하세요. Prompt Palette와 Command Deck에는 import/export 기능이 없습니다. Command Deck 터미널은 자동 종료되지 않으며 재설치 후 이어받지 않습니다. 재설치하면 기본값에서 시작합니다. Branch Garden에는 저장된 플러그인 설정이 없습니다. 내장 0.8 Settings가 없다는 설명은 과거 두 플러그인의 `v0.1.0-rc.2` 릴리스에만 해당합니다.

아래 `<runtime-id>`를 제거하려는 실제 ID로 바꿉니다. 임시 검증 설치라면 임시 ID만 지정하세요.

```powershell
paseo plugin remove <runtime-id>
paseo plugin ls
```

Git source는 runtime 설정과 managed checkout이 함께 제거되고 directory source는 원본 소스 디렉터리를 남깁니다. 원본 Git 저장소와 공급자 인증은 삭제되지 않습니다. 목록에서 대상만 사라지고 나머지 설치가 정상인지 확인하세요. Remove/re-add로 고정 ref를 바꾸는 [롤백 절차](RELEASING.md#rollback)도 설정을 삭제합니다. 제거 없는 update/reload는 설정을 유지합니다.

## 0.8.0 정식 후보 검증

다음은 배포 담당자가 별도 후보 ref와 호환 daemon/app에서 수행하는 검증 절차입니다. 네 플러그인은 모두 0.8.0 대상입니다. 기존 세 플러그인에만 사용자 Paseo 0.8 Runtime 검증 완료 보고가 있습니다. 정확한 환경·시나리오 범위는 [보고 기록](verification/paseo-0.8-runtime.md)을 따릅니다. Command Deck의 앱 runtime 검증은 [별도 기록](verification/command-deck-0.8-source.md)을 따릅니다. 세 플러그인의 Git 설치·업데이트·실패 후보 복구는 [0.8 Git 검증 기록](verification/paseo-0.8-git-source.md)에 있습니다. Command Deck Git 경로는 남아 있습니다.

1. 대상 정식 0.8.0 CLI의 fresh scaffold와 exact SDK를 대조하고 root 검사를 통과시킵니다.
2. `requirements.paseo`와 client/server entry가 갖춰진 후보 ref를 선택합니다. 권장 범위 `^0.8.0`은 Paseo의 prerelease 규칙에서 beta.1을 포함합니다.
3. 기존 directory/runtime과 구분되는 ID를 사용해 Git source를 설치하고 `ls`의 source·commit·상태·load error를 확인합니다.
4. 실제 RPC/UI/cleanup과 성공 update·실패 후보 복구를 검증합니다. Host compiler 경계와 `node_modules` 없는 실행을 포함합니다.

0.8의 `--host`는 global 옵션입니다.

```powershell
paseo --host <target> plugin ls
paseo --host <target> plugin add NaruForge/Paseo-Plugin:plugins/branch-garden --ref <migrated-ref> --id branch-garden-release-check
paseo --host <target> plugin ls
paseo --host <target> plugin logs branch-garden-release-check
```

`plugin ls`는 remote ref를 조회하지 않고 현재 runtime/source/설치 commit/error를 보고합니다. 새 remote commit 확인은 `plugin status`로 수행합니다. 0.8은 요구 버전을 install·Git build·load 전에 검사하고 startup/enable/reload 때도 재검사합니다. 호환되지 않는 Git update는 설치된 revision을 유지합니다. 연결 app도 자신의 버전을 검사하므로 daemon 확인만으로 끝내지 않습니다.

## 개발자 사전 검사

이 절은 기존 source를 설치하는 사용자 절차가 아닙니다. 개발자가 새 배포 후보의 source를 변경했을 때 저장소 루트에서 의존성을 준비하고 실행하는 검사입니다. [기여 안내](../CONTRIBUTING.md)와 [이관 검증](MIGRATION_0.8.md#검증과-기록)을 따릅니다.

Paseo는 lockfile을 보고 package manager나 install script를 자동 실행하지 않습니다. Manifest에 `build`가 없으면 배포할 source의 runtime import를 Paseo 제공 모듈, Node 기본 모듈과 플러그인 내부 상대 경로로 한정해야 합니다. 이 저장소의 현재 플러그인은 모두 이 방식이며 `build`가 필요하지 않습니다.

```powershell
npm run check:git-source-imports
npm run check:docs-sync
npm run typecheck
```

자동 검사는 각 workspace의 exact SDK에 맞춰 import를 검사하며 테스트와 TypeScript declaration 파일은 제외합니다. 0.7 source에는 기존 host runtime allowlist를 유지합니다. 0.8 source에는 runtime별 SDK 경로와 client/server/shared 상대 경계를 적용하며 `import type`, inline type import, re-export와 dynamic import도 검사합니다. Shared에서는 Node·React·runtime-specific SDK를 허용하지 않습니다.

**Paseo 0.8 compiler는 type import와 전이 의존성에도 경계를 적용**하므로 저장소의 정적 allowlist 검사만으로 compiler 검증을 대체하지 않습니다. 네 플러그인 모두 `node_modules` 없는 사본에서 정식 0.8.0 compiler를 통과했습니다([정식판 기록](verification/paseo-0.8.0-release.md)). 이 환경에서는 직접 `@getpaseo/client` type import도 해석되지 않아, server entry는 공개 `PluginServerContext`의 타입 추론을 사용합니다. 개발용 exact client dependency는 SDK peer 타입 검사용으로 유지합니다. [런타임 모듈표](plugin-capabilities/backend-and-sdk.md#host-제공-모듈)를 참조하세요.

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

## 과거 0.7.0-beta.1 검증 기록

아래 내용은 당시 기준 버전인 `0.7.2`의 검증 결과가 아니라, Git source 흐름을 처음 도입할 때 남긴 역사적 기록입니다. 2026-08-28에 로컬 Paseo `0.7.0-beta.1` daemon에서 다음 경로를 실제 검증했습니다.

- 당시 `plugins/branch-garden`과 현재 제거된 `plugins/github-project-board`를 서로 다른 임시 runtime ID로 설치했습니다.
- 두 managed checkout에 `node_modules`가 없는 상태에서 모두 `running`이 되었습니다.
- 추적 branch를 한 commit 진행했을 때 `plugin status`가 `commitsBehind: 1`, `updateAvailable: true`를 보고했습니다.
- `plugin update --all`이 업데이트 대상만 새 commit으로 전환했고 기존 directory runtime은 변경하지 않았습니다.
- 초기화 중 예외를 발생시키는 후보로 단일 update를 실행했을 때 명령은 실패했지만 이전 commit의 runtime은 계속 `running`이었습니다.
- 복구 commit을 올린 뒤 단일 update가 성공했고 상태가 최신으로 돌아왔습니다.
- 모든 임시 runtime, managed checkout과 원격 검증 branch를 제거한 뒤 기존 `branch-garden`, `github-project-board`가 계속 `running`임을 확인했습니다.

기존 소스는 [v0.7 CLI reference](https://paseo.sh/docs/plugins/v0.7/reference#cli-reference), 이관 후보는 [v0.8 CLI reference](https://paseo.sh/docs/plugins/v0.8/reference#cli-reference)와 [requirements](https://paseo.sh/docs/plugins/v0.8/reference#requirements)를 기준으로 합니다. 위 역사적 검증 기록은 0.8의 실행 증거로 재사용하지 않습니다.
