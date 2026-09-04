# Paseo Plugin Design Rules

이 문서는 `plugins/*`의 Paseo 클라이언트 UI에 적용하는 저장소 공통 디자인 규칙이다. Paseo 본체의 [Design](https://github.com/getpaseo/paseo/blob/main/docs/design.md)을 플러그인 공개 계약에 맞게 번안했으며, 원문을 그대로 복제하거나 자동 동기화하지 않는다.

마지막 대조일: 2026-09-04

## Rule precedence

규칙이 충돌하면 아래 순서를 따른다.

1. 현재 안정판 [Plugin quickstart](https://paseo.sh/docs/plugins/v0.7)와 [Plugin reference](https://paseo.sh/docs/plugins/v0.7/reference)
2. 대상 Paseo 버전의 fresh scaffold와 exact `@getpaseo/plugin` package declaration
3. 이 문서
4. Paseo 본체의 `docs/design.md`

플러그인 API는 실험 단계다. 공개 문서나 package declaration이 바뀌어 이 문서가 틀려지면 영향을 받는 UI 변경과 함께 이 문서도 갱신한다. 최신 공식 문서에 토큰이나 컴포넌트가 있더라도 대상 버전의 package declaration에 없으면 사용할 수 있다고 가정하지 않는다.

## Character

- 화면은 조용하고 단순하며 여백이 충분해야 한다.
- 시각 요소는 사용자가 행동하거나 상태를 이해하는 데 기여해야 한다. 장식만을 위한 색, 테두리, 그림자와 배지는 추가하지 않는다.
- 정보 밀도가 높아져도 글자와 행을 무작정 줄이지 않는다. 정보를 묶거나 우선순위를 낮추고, 필요하면 섹션을 나눈다.
- 같은 의미의 요소는 같은 플러그인 안에서 같은 모양과 동작을 사용한다.

## Host boundary and reuse

Paseo는 플러그인 surface의 route, 화면 header, 닫기 동작, host picker, error boundary와 query client를 소유한다. 플러그인은 header 아래의 body만 소유한다.

- Paseo가 제공하는 화면 제목이나 navigation chrome을 body 안에 반복하지 않는다.
- `packages/app/...`의 내부 컴포넌트나 토큰을 가져오지 않는다. 본체의 `<Button>`, `<StatusBadge>`, `<SettingsSection>`, `confirmDialog` 같은 이름은 공개 플러그인 API가 아니다.
- 클라이언트에서는 대상 버전의 package declaration과 Plugin reference가 허용한 runtime module만 가져온다.
- 같은 플러그인 안에서 동일한 의미의 UI가 세 곳 이상 쓰이면 공통 컴포넌트로 만든다. 서로 독립적으로 설치되는 플러그인 사이에는 런타임 결합을 만들지 않는다.
- 기여 icon은 현재 플러그인 계약이 요구하는 Lucide 이름을 사용한다.
- 현재 기준인 Paseo `0.7.2`의 surface 내부 icon은 `@getpaseo/plugin`이 제공하는 `Icon`을 `*.client.tsx`에서 사용한다. `lucide-react-native`나 `react-native-svg`를 직접 가져오지 않는다.
- 내부 icon은 action이나 상태를 더 빨리 이해하게 하는 경우에만 사용하고, 텍스트 label이나 접근성 설명을 대체하지 않는다.

## Theme and color

모든 색은 현재 플러그인의 `theme.colors`에서 가져온다.

- Root view 배경: `surface0`
- 카드, 칼럼, 데이터 그룹과 상태 panel: `surface1`
- 검색, filter, selector와 secondary control: `surface2`
- outline과 divider: `border`
- 주요 제목과 본문: `foreground`
- 설명, label, metadata, placeholder와 비활성 문맥: `foregroundMuted`
- 주 행동과 선택 상태: `accent`
- `accent` 배경 위의 글자: `accentForeground`
- 성공 상태와 정상 완료 신호: `statusSuccess`
- 주의, 부분 실패와 검토 필요 상태: `statusWarning`
- 오류와 파괴적 의미: `statusDanger`

추가 규칙:

- 모든 `Text`에 색을 지정한다. React Native 기본 글자색에 의존하지 않는다.
- 검정, 흰색 또는 특정 theme에 맞춘 hex 색상을 UI에 하드코딩하지 않는다. `addTheme`에 전달하는 theme palette는 예외다.
- package declaration에 없는 토큰을 type cast로 우회하거나 이름을 추측하지 않는다.
- `foregroundMuted`에 opacity를 겹쳐 카드·control·divider를 흉내 내지 않는다. 공개된 semantic surface와 border token을 직접 사용한다.
- 강조색은 한 화면에서 가장 중요한 행동 하나에만 사용한다. 선택 상태와 상태 신호가 많아 강조색이 지배적으로 보이지 않게 한다.
- Disabled 상태는 의미 색을 바꾸지 말고 바깥 pressable의 opacity로 표현한다.
- Theme 또는 `layout.compact`가 바뀌면 스타일도 다시 계산되도록 `useMemo` 의존성을 유지한다.

## Typography and hierarchy

계층은 우선 색과 굵기로 표현하고, 크기 차이는 제한적으로 사용한다.

| 역할 | 권장 크기 | 권장 굵기 |
| --- | ---: | ---: |
| 주요 본문과 행 제목 | 14 | 400 |
| 설명과 보조 정보 | 12 | 400 |
| 조밀한 metadata | 10 | 400 또는 500 |
| 섹션·그룹을 명명하는 label | 14 | 500 또는 600 |
| body 안에 꼭 필요한 콘텐츠 제목 | compact 20, wide 24 | 400 또는 500 |

- `700` 이상 굵기를 일반 본문, 행 제목, 버튼과 badge의 기본값으로 사용하지 않는다.
- 화면을 명명하는 큰 hero 제목은 Paseo header와 역할이 겹치므로 기본적으로 만들지 않는다.
- 실제 내용은 `foreground`, 맥락과 설명은 `foregroundMuted`로 구분한다.
- 글자 크기를 줄여 한 줄에 억지로 맞추지 않는다. 줄바꿈, stacking 또는 정보 축약을 먼저 검토한다.

## Spacing, density, and alignment

공개 플러그인 계약이 spacing token을 제공하지 않는 동안에는 `4, 8, 12, 16, 24, 32`의 작은 로컬 scale을 사용한다.

- Root padding은 `layout.compact ? 16 : 24`를 기본값으로 한다.
- 조밀한 요소의 gap은 compact 8, wide 12를 기본값으로 한다.
- 관련 섹션 사이에는 24 이상, 같은 그룹 안의 행과 정보 사이에는 8~16을 사용한다.
- 주요 press target은 가능하면 최소 44 높이를 확보한다.
- 행의 icon, 제목과 trailing action은 일정한 leading/trailing rail에 맞춘다. Touch target을 키워도 보이는 내용의 정렬은 움직이지 않는다.
- Border는 그룹을 묶거나 영역을 나눌 때만 사용한다. 관련 행 묶음에는 바깥 경계 하나와 내부 divider를 사용하고 각 항목을 개별 상자로 장식하지 않는다.
- 상태가 로드되거나 badge가 나타날 때 주변 layout이 움직이지 않도록 필요한 공간을 미리 확보한다.

## Responsive and platform behavior

Compact 화면을 먼저 설계하고 wide 화면은 같은 정보와 행동에 여백과 배치를 더한다.

- 화면 폭에 따른 padding, stacking과 열 배치는 `layout.compact`로 결정한다.
- `layout.platform`은 DOM 또는 native capability처럼 플랫폼 자체가 다른 동작에만 사용한다. 화면 폭의 대용으로 사용하지 않는다.
- Web 전용 global이나 DOM API는 `layout.platform === "web"`일 때만 접근한다.
- Hover로 나타나는 행동은 compact와 native에서도 항상 발견하고 사용할 수 있어야 한다.
- Compact와 wide가 서로 다른 데이터 흐름이나 별도 컴포넌트 트리를 갖지 않도록 한다. 가능한 한 framing만 바꾼다.

## Actions and interaction

- Surface와 workspace/agent panel에서 Agent 또는 Workspace를 열 때는 Paseo가 주입한 optional `navigation`을 사용한다. 임의 route를 조립하거나 내부 router를 가져오지 않는다.
- `navigation`이 없는 이전 client에서는 그 capability에 의존하는 action을 숨긴다. 선택 host가 대상을 소유하므로 다른 host로 우회하거나 fallback하지 않는다.
- 한 surface에서 accent로 채운 primary action은 최대 하나다. 대부분의 읽기 전용 화면에는 없어도 된다.
- Secondary action은 foreground와 낮은 강도의 surface 또는 outline으로 조용하게 표현한다.
- 파괴적 행동은 사용자가 의도를 밝힌 뒤에만 danger 색과 최종 확인을 보여준다. 공개 확인 primitive가 없으면 본체 내부 API를 가져오지 말고 플러그인 안에 명시적인 확인 단계를 설계한다.
- `Pressable`에는 적절한 `accessibilityRole`, 필요한 `accessibilityLabel`, disabled와 pending 처리를 제공한다.
- 요청 중에는 중복 실행을 막고 버튼 크기가 바뀌지 않는 진행 문구를 표시한다.
- 버튼이나 filter 같은 의미 요소가 반복되면 raw `Pressable` 조합을 계속 복사하지 말고 플러그인 내부 primitive로 만든다.
- Pointer 전용 event나 hover만으로 핵심 행동을 구현하지 않는다.

## Loading, empty, error, and status states

상태는 영향을 받는 가장 작은 범위에서 보여준다.

- 한 필드의 오류는 그 필드 가까이에, 한 카드의 오류는 카드 안에, 전체 화면 실패만 화면 수준에 표시한다.
- 일부 데이터만 실패했다면 성공한 데이터는 계속 보여주고 실패한 범위를 따로 설명한다.
- Loading은 관련 요소 가까이에 표시한다. 기존 내용을 전부 지우고 큰 spinner로 바꾸지 않는다.
- Empty state는 짧고 직접적으로 쓴다. 설명은 한두 줄을 넘기지 않고, 필요한 복구 행동은 하나만 둔다.
- 상태 색은 package declaration에 있는 semantic status token을 사용한다. 임의의 성공·경고·오류 색을 만들지 않는다.
- Placeholder와 비활성 설명은 `foregroundMuted`까지만 낮춘다. 추가 opacity와 italic으로 더 흐리게 만들지 않는다.

## Copy and terminology

- 제목, label과 버튼은 짧게 쓰고 불필요한 마침표를 붙이지 않는다.
- 버튼은 사용자가 실행할 동작을 나타내는 동사로 시작한다.
- 오류는 사과하거나 평가하지 않고 현재 상태와 가능한 복구 방법을 직접 설명한다.
- Paseo 개체를 가리킬 때는 `Project`, `Workspace`, `Host`, `Provider`, `Agent`의 공식 의미를 유지한다. 외부 서비스 고유 개체를 설명할 때만 그 서비스의 용어를 사용한다.
- Loading 문구와 action label은 같은 화면에서 한 언어와 한 문체를 유지한다.

## Forbidden patterns

다음 패턴은 사용하지 않는다.

- Paseo 본체의 `packages/app/...` 내부 import
- Hardcoded UI color 또는 색이 없는 `Text`
- package declaration에 없는 theme token을 cast로 우회
- 한 화면의 여러 accent-filled CTA
- 기본값처럼 반복되는 `700`, `800`, `900` font weight
- 장식 목적의 border, shadow, badge
- `layout.platform`을 화면 너비 판정에 사용
- Platform guard 없는 DOM 또는 browser global 접근
- Hover나 pointer만으로 접근 가능한 핵심 action
- Loading과 상태 갱신 때 발생하는 불필요한 layout shift
- 확인 없는 파괴적 행동

## Risk-based UI validation

UI 수동 검수는 모든 환경의 일률적인 조합이 아니라 변경이 실제로 영향을 줄 수 있는 범위를 기준으로 한다. 변경 전에 아래 등급을 고르고, 영향 여부가 불확실하면 한 단계 높은 등급을 적용한다.

| 등급 | 변경 범위 | 필수 수동 검수 |
| --- | --- | --- |
| A | 데이터 처리, 이벤트 연결, 내부 refactor처럼 시각적 결과와 UI 상태를 바꾸지 않음 | 수동 UI 검수 없음 |
| B | 짧은 문구, 단일 icon, 국소적인 control처럼 theme·layout·상태 계약을 바꾸지 않는 수정 | 관련 화면을 대표 환경 하나에서 확인 |
| C | 색상이나 상태 tone, 긴 문구와 줄바꿈, spacing·배치, loading·empty·error·disabled 중 특정 축을 바꾸는 수정 | 영향받은 축만 확인. 색상은 밝은/어두운 theme, 배치와 줄바꿈은 wide/compact, 상태는 변경한 상태를 확인 |
| D | 새 화면, 여러 위치에서 쓰는 공통 UI 구조, 공통 theme token의 적용 방식, 화면의 반응형 구조를 바꾸는 수정 | wide/compact와 밝은/어두운 theme를 모두 확인하고, 존재하며 영향받는 상태와 접근성을 함께 확인 |

C 등급에서는 서로 영향을 주지 않는 축까지 전부 조합할 필요가 없다. 예를 들어 줄바꿈만 바꿨다면 wide/compact를 확인하되 밝은/어두운 theme까지 반복하지 않고, 상태 tone만 바꿨다면 두 theme의 해당 상태를 확인하되 모든 layout과 다른 상태를 반복하지 않는다.

존재하지 않거나 변경의 영향을 받지 않는 loading·empty·error·disabled 상태를 검수를 위해 새로 만들거나 억지로 재현하지 않는다. 자동 테스트, 보안 회귀 테스트와 typecheck 범위는 이 등급으로 완화하지 않고 `AGENTS.md`의 변경 경로별 기준을 따른다.

검수 결과는 다음처럼 짧게 기록한다.

> UI 검수: B / dark·compact 확인 / light·wide 생략: theme과 layout에 영향을 주지 않는 icon 수정

## UI review checklist

UI 변경을 완료하기 전에 변경 등급에 적용되는 항목만 확인한다.

- 플러그인 소스를 바꿨다면 대상 workspace의 typecheck가 통과한다.
- 선택한 등급에 필요한 layout, theme와 상태를 확인한다.
- 변경한 상태에서 Primary action이 하나를 넘지 않고 disabled·pending·error 동작이 안정적이다.
- interaction이나 의미 구조를 바꿨다면 touch target, 접근성 role과 label이 적절하다.
- Paseo header를 body 안에서 반복하지 않고 공식 용어를 사용한다.
- 사용한 token과 runtime module이 대상 `@getpaseo/plugin` package declaration에 실제로 존재한다.
