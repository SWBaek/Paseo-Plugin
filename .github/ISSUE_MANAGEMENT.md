# Issue 관리 규칙

이 저장소는 아이디어, 개발 계획과 버그를 GitHub Issues 및 `Paseo Plugins` Project에서 관리한다.

## 등록과 분류

- 새 아이디어는 `아이디어` Issue Form으로 등록하고 `Inbox`에서 검토한다.
- Issue Form으로 만든 Issue는 `Paseo Plugins` Project에 자동 등록된다. 아직 `Status` 값이 없는 항목도 Backlog 보기에 표시되며 분류할 때 `Inbox`를 지정한다.
- 구현하기로 결정한 작업은 검증 가능한 완료 조건을 채운 뒤 `Ready`로 옮긴다.
- 한 Issue는 독립적으로 검증할 수 있는 하나의 결과를 다룬다.
- 플러그인 영역 라벨은 디렉터리명이 아니라 `paseo-plugin.json`의 런타임 ID를 기준으로 한다. 아직 manifest가 없는 새 플러그인 제안은 `area:new-plugin`을 사용하고, scaffold를 만든 뒤 `plugin:<runtime-id>`로 교체한다.
- 진행하지 않기로 한 제안은 삭제하지 않고 `not planned` 사유로 닫아 결정 기록을 남긴다.

## Project 필드

- `Status`: Inbox, Backlog, Ready, In progress, In review, Done
- `Priority`: P0, P1, P2, P3
- `Size`: S, M, L
- `Target date`: 일정이 필요한 작업에만 지정한다.

진행 상태는 라벨과 중복 관리하지 않고 Project의 `Status` 필드만 사용한다. `blocked`와 `needs-triage`는 상태 흐름을 보조하는 라벨로 사용한다.

## 계획과 구현

- 큰 개발 계획은 부모 Issue로 만들고 실제 구현 단위를 하위 Issue로 분리한다.
- 의존하는 작업은 Issue dependency로 연결하고 차단된 Issue에는 `blocked` 라벨을 붙인다.
- 구현을 시작할 때 담당자를 지정하고 `In progress`로 옮긴다.
- 검토 중인 PR이 연결되면 `In review`로 옮긴다.
- PR 본문에 `Closes #<issue-number>`를 넣어 병합 시 Issue가 닫히게 한다.

## Milestone

Milestone은 진행 상태가 아니라 `v0.1.0`, `v0.2.0`처럼 릴리스 범위를 묶을 때만 사용한다.

## 정기 정리

- `Inbox`의 새 항목을 주기적으로 검토해 Backlog 이동, 구현 승인 또는 `not planned` 종료를 결정한다.
- 완료된 Issue와 병합된 PR은 `Done`으로 옮긴다.
- 오래된 `Done` 항목은 필요할 때 Project에서 보관한다.
