# Paseo 0.9 플러그인 이관

현재 대상은 **Paseo 0.9.0-beta.2**, 컬렉션은 **v0.1.0-rc.4**이다. 추적은 [#121](https://github.com/NaruForge/Paseo-Plugin/issues/121)이다. [호환성](COMPATIBILITY.md)과 [0.9 검증 기록](verification/paseo-0.9.0-beta.2.md)을 함께 읽는다.

0.8 이관은 [MIGRATION_0.8.md](MIGRATION_0.8.md)에 보존한다. 0.9는 런타임 entry를 다시 쪼개지 않는다. 네 플러그인은 이미 `index.client.tsx` / `index.server.ts`와 정식 Composer `button` / `update` / `remove` 계약을 사용한다.

## 0.8에서 깨진 이유

`requirements.paseo: ^0.8.0`은 0.8.x만 허용한다. Paseo 0.9.0-beta는 설치·로드·reload 전에 거부한다. 코드 계약보다 버전 선언이 먼저 실패한다.

[0.9.0-beta.1 릴리스](https://github.com/getpaseo/paseo/releases/tag/v0.9.0-beta.1)의 플러그인 변경은 대체로 추가 API다. 이 컬렉션이 채택한 항목만 아래 표에 있다.

| 플러그인 | 0.9 대응 |
| --- | --- |
| Branch Garden | exact SDK/client 0.9.0-beta.2; 읽기 전용 Git 스캔 유지 |
| Provider Usage | Agent directory를 `list({ subscribe: {} })`로 한 번 소유하고 cleanup에서 `release`; 기존 usage SDK·pill `button` 유지 |
| Prompt Palette | 첫 Agent 목록에 `subscribe: {}`, 이후 페이지와 30초 갱신은 일반 `list`; cleanup에서 observation `release` |
| Command Deck | Prompt Palette와 같은 directory 소유; Workspace panel에 `locations: ["workspace", "explorer"]` |

Settings schema·revision, RPC, Agent `send()`, Terminal SDK, 읽기 전용 Git allowlist는 유지한다. 메시지·명령을 자동 재전송하지 않으며 cleanup은 터미널을 종료하지 않는다. `useHosts`, `openExternalUrl`, timeline transformer, npm 패키지 배포는 이번 컬렉션에 추가하지 않는다.

## 버전과 설치

네 workspace의 `@getpaseo/plugin`과 Branch Garden의 `@getpaseo/client`는 exact `0.9.0-beta.2`이다. `plugins.json`과 lockfile도 맞춘다. Catalog의 플러그인별 `paseoVersion`이 collection 기본값보다 우선한다.

Manifest는 기존 ID와 `requirements.paseo: ^0.9.0`을 사용한다. Paseo의 prerelease matcher는 `0.9.0-beta.2`를 이 범위에 포함한다. **daemon, app, CLI를 모두 0.9.0-beta.2로 맞춘다.** Manifest만으로 다른 베타 빌드를 보호한다고 가정하지 않는다.

0.7.2 사용자는 Branch Garden·Provider Usage를 `--ref v0.1.0-rc.2`에 고정한다. 0.8.0 사용자는 `--ref v0.1.0-rc.3`을 유지한다. 0.9 소스는 `--ref v0.1.0-rc.4`를 사용한다. 이전 태그를 이동하거나 과거 검증 결과를 0.9 결과로 바꾸지 않는다. 고정 ref 변경과 Settings 백업은 [Git 설치](GIT_INSTALLATION.md)를 따른다.

## 검증 순서

1. 대상 CLI로 빈 임시 디렉터리에 fresh scaffold를 만든다.
2. Exact plugin/client declaration, host import allowlist, server compiler의 경로·인자를 대조한다.
3. 변경 workspace의 typecheck와 동작 테스트를 먼저 실행한다. 여러 플러그인·설치 상태 변경은 루트 `npm ci`와 `npm run check`를 실행한다.
4. 아래 compiler 검사를 네 플러그인에 실행한다. 임시 사본은 node_modules를 제외한다. 이 검사는 daemon을 시작하거나 플러그인을 설치하지 않는다.
5. [Design](DESIGN.md)의 UI 영향 등급에 따라 확인하고 실제 앱과 시뮬레이션을 구분한다.

```powershell
npm exec --yes --package=@getpaseo/cli@0.9.0-beta.2 -- paseo plugin init <absolute-empty-directory> --id migration-probe
node scripts/check-plugin-compiler.mjs plugins/branch-garden <0.9.0-beta.2-server-package-directory>
node scripts/check-plugin-compiler.mjs plugins/provider-usage <0.9.0-beta.2-server-package-directory>
node scripts/check-plugin-compiler.mjs plugins/prompt-palette <0.9.0-beta.2-server-package-directory>
node scripts/check-plugin-compiler.mjs plugins/command-deck <0.9.0-beta.2-server-package-directory>
```

Compiler 검사는 명시한 `@getpaseo/server`의 exact 버전이 SDK와 일치하는지 확인한다. 현재 검증된 private entry는 `dist/server/server/plugins/compiler.js`의 `compilePlugin({ client, server })`다.

설치/reload가 요청되면 대상 daemon의 `plugin ls`로 실제 runtime ID와 source를 확인한다. Directory는 install/reload, Git source는 add/update를 사용한다. 원격 명령은 `paseo --host <target> plugin ls` 형식이다. 소스 반영을 위해 daemon을 재시작하지 않는다.

## 과거 증거

[0.8.0 정식판 기록](verification/paseo-0.8.0-release.md), [사용자 Runtime 보고](verification/paseo-0.8-runtime.md), [Git 검증](verification/paseo-0.8-git-source.md)은 당시 사실을 보존한다. 0.9 앱/모바일 동작의 증거로 재사용하지 않는다.
