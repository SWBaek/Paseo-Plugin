# File Browser

Windows daemon의 `C:\Projects`를 탐색하고, 일반 파일을 같은 Tailnet의 PC 또는 모바일로 내려받는 Paseo 플러그인이다.

## Download transport

다운로드 서버는 필요할 때만 `127.0.0.1:9292`에서 실행된다. 외부 client가 접근하려면 daemon 컴퓨터에서 Tailscale Serve를 한 번 설정해야 한다.

```powershell
tailscale serve --bg --https=9292 9292
tailscale serve status --json
```

이 구성은 Funnel을 사용하지 않으며 Tailnet에만 공개된다. 플러그인은 Serve 구성이 정확히 `http://127.0.0.1:9292`를 가리키는지 확인한 뒤 60초짜리 일회용 URL을 발급한다. 일반 파일만 stream하고 민감 파일과 link·junction은 거부한다.

더 이상 다운로드를 제공하지 않을 때는 다음 명령으로 이 플러그인의 Serve 포트만 끈다.

```powershell
tailscale serve --https=9292 off
```

