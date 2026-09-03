# File Browser

Windows daemon의 `C:\Projects`를 탐색하고, 일반 파일과 선택한 파일·폴더를 같은 Tailnet의 PC 또는 모바일로 내려받는 Paseo 플러그인이다.

## Download transport

다운로드 서버는 필요할 때만 `127.0.0.1:9292`에서 실행된다. 외부 client가 접근하려면 daemon 컴퓨터에서 Tailscale Serve를 한 번 설정해야 한다.

```powershell
tailscale serve --bg --https=9292 9292
tailscale serve status --json
```

이 구성은 Funnel을 사용하지 않으며 Tailnet에만 공개된다. 플러그인은 Serve 구성이 정확히 `http://127.0.0.1:9292`를 가리키는지 확인한 뒤 60초짜리 일회용 URL을 발급한다. 하나의 파일만 선택하면 원본 파일을 그대로 stream하고, 폴더나 여러 항목을 선택하면 임시 파일 없이 Deflate ZIP으로 stream한다. 현재 폴더에서 최대 100개 항목을 선택할 수 있으며 폴더를 이동하면 선택은 초기화된다.

## Smart ZIP filtering

Git 저장소 폴더는 Git이 추적하는 파일과 표준 ignore 규칙에 걸리지 않은 미추적 파일만 ZIP에 넣는다. 따라서 `.gitignore`, `.git/info/exclude`, 사용자의 전역 excludes가 모두 반영되며 Git 상태는 변경하지 않는다. Git 저장소가 아닌 폴더에서는 `node_modules`, `.git`, cache·coverage·가상 환경 디렉터리와 log·임시 파일 같은 생성물을 기본 제외한다.

파일을 명시적으로 하나 또는 여러 개 선택하면 ignore 여부와 관계없이 그 파일을 포함할 수 있다. 선택한 폴더와 현재 폴더 ZIP에는 항상 smart filtering이 적용된다. 민감 파일은 명시적으로 선택할 수 없고, Git이 추적하는 민감 파일처럼 ZIP 후보에 남아 있으면 전체 요청을 거부한다.

현재 폴더 ZIP은 `C:\Projects` 루트 전체에서 허용하지 않지만, 루트에 보이는 개별 프로젝트 폴더를 선택해 내려받을 수 있다. ZIP은 최대 10,000개 항목, 비압축 합계 2 GiB, 선택 폴더부터 깊이 64로 제한하며 한 번에 하나만 생성한다. 포함 후보에 민감 파일, link·junction 또는 지원하지 않는 항목이 있으면 전체 요청을 거부한다. ZIP 안에는 선택한 폴더 자체가 최상위 디렉터리로 포함된다.

더 이상 다운로드를 제공하지 않을 때는 다음 명령으로 이 플러그인의 Serve 포트만 끈다.

```powershell
tailscale serve --https=9292 off
```
