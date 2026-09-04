## 요약

- 변경 목적과 사용자에게 보이는 결과를 적어 주세요.

## 관련 Issue

Closes #

## 검증

- [ ] `npm run check:docs-sync`
- [ ] `npm run check:git-source-imports` (Git source 또는 배포 경로에 영향이 있는 경우)
- [ ] 대상 workspace의 typecheck
- [ ] 대상 workspace의 필수 테스트
- [ ] 여러 workspace·구조·설치 상태 변경 시 루트 `npm run typecheck`

## UI 검수

- 등급: A / B / C / D
- 확인한 환경과 상태:
- 생략한 환경과 근거:

UI 결과에 영향을 주지 않는 변경이면 등급 A와 그 근거만 남겨 주세요. 그 외에는 `docs/DESIGN.md`의 영향 기반 범위를 적용합니다.

## 문서와 운영 영향

- [ ] 사용자용 요구 사항·안전 경계·운영 절차가 바뀌면 관련 README/docs를 함께 갱신했습니다.
- [ ] 플러그인 디렉터리나 runtime ID가 바뀌면 AGENTS, README, Issue Form과 Git 설치 목록을 함께 갱신했습니다.
