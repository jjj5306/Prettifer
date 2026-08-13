## Context

Activity Rail은 여섯 개의 아이콘 버튼을 세로로 표시한다. Commit History, Changed Files와 Diff Review는 이미 같은 작업대에 보이는 영역으로 포커스만 이동해 진입점 가치가 낮다. File History는 실제로 왼쪽 패널을 전환하지만 별도 네 번째 항목에 있어 발견하기 어렵다. 버튼의 `title`과 `aria-label`에는 항목 이름만 있어 아이콘이 여는 영역과 비활성 이유도 설명하지 못한다.

UI 기본 문구는 영어를 유지해야 하고, renderer는 외부 툴팁 의존성 없이 접근 가능한 HTML과 CSS로 동작해야 한다.

## Goals / Non-Goals

**Goals:**

- Activity Rail을 Repository, File History와 Group Rules 세 항목으로 축소
- 기존 Commit History 위치의 두 번째 항목으로 File History 전환
- 선택 결과와 Changed Files의 선택 파일을 기준으로 File History 진입
- 파일 커밋 이력 → 커밋 변경 내용의 전용 전체 폭 단계 제공
- 남은 항목에 이름, 동작과 필요한 선행 조건을 설명하는 일관된 도움말 제공
- 마우스 호버와 키보드 포커스에서 같은 시각 도움말 제공
- 도움말 문구를 각 버튼의 접근 가능한 설명으로 연결
- 비활성 항목의 기존 실행 차단과 현재 영역 표시 유지

**Non-Goals:**

- Activity Rail 밖의 버튼을 위한 공통 툴팁 체계 도입
- 기본 검토 흐름의 Commit History, Changed Files와 Diff Review 화면 제거 또는 배치 변경
- 도움말 위치를 사용자가 설정하는 기능

## Decisions

### 실제 화면 전환을 일으키는 세 진입점만 유지

Activity Rail 항목은 Repository, File History, Group Rules 순서로 제공한다. Commit History, Changed Files와 Diff Review는 항상 보이는 작업대 영역이므로 레일에서 제거한다. File History는 기존 Commit History의 두 번째 위치와 시간 흐름 아이콘을 이어받아 Changed Files에서 선택한 파일의 이력을 열도록 한다.

File History는 검토 영역 전체를 사용하는 별도 탐색 흐름으로 연다. 첫 단계는 선택 파일의 커밋 이력, 두 번째 단계는 선택 커밋이 만든 파일 diff다. 커밋 변경 내용은 파일 이력으로 돌아가고, 파일 이력은 선택 결과로 돌아가는 버튼을 제공한다.

File History는 기존 `selectedFilePath`를 그대로 사용해 이력을 읽는다. 별도 파일 선택 상태나 전체 파일 트리 API를 추가하지 않으므로 Changed Files의 선택과 File History 대상이 어긋나지 않는다. 탐색 중에도 선택 결과와 현재 diff는 보존한다.

### 항목 메타데이터에서 이름과 설명을 함께 관리

각 Activity Rail 항목은 고정된 영어 이름과 기본 동작 설명을 함께 가진다. File History와 Group Rules를 사용할 수 없는 상태에서는 항목별 선행 조건 설명을 선택한다. 버튼, 시각 도움말과 접근 가능한 설명이 같은 메타데이터를 사용하므로 문구가 서로 달라지지 않는다.

컴포넌트 밖에 별도 전역 툴팁 레지스트리를 두는 대안은 현재 범위가 Activity Rail 하나뿐이라 불필요한 결합을 만든다.

### CSS 호버 및 focus-within으로 시각 도움말 표시

각 버튼과 `role="tooltip"` 요소를 하나의 상대 위치 컨테이너에 두고 컨테이너 호버 또는 버튼 포커스에서 도움말을 표시한다. 도움말은 Activity Rail 오른쪽에 배치하며 최대 너비, 높은 쌓임 순서와 포인터 이벤트 차단을 적용한다. 브라우저 기본 `title`은 중복 도움말을 피하기 위해 제거한다.

JavaScript 타이머로 열림 상태를 관리하는 대안은 지연, 정리와 테스트 상태를 추가하지만 이 화면에는 필요하지 않다.

### 비활성 항목은 aria-disabled 상태로 포커스를 유지

native `disabled` 버튼은 키보드 포커스를 받을 수 없어 비활성 이유를 확인할 수 없다. 버튼을 `aria-disabled="true"`로 표시하고 클릭 처리의 첫 단계에서 실행을 차단한다. 따라서 마우스와 키보드 사용자는 같은 버튼 순서에서 선행 조건을 확인할 수 있고 보조 기술은 사용할 수 없는 상태를 전달받는다.

비활성 버튼을 별도의 초점 가능한 래퍼로 감싸는 대안은 한 항목에 중복 포커스 대상을 만들므로 사용하지 않는다.

### 안정적인 설명 식별자로 접근성 관계 구성

각 도움말은 WorkbenchRegion 기반의 고유 ID를 사용하고 버튼은 `aria-describedby`로 이를 참조한다. 버튼의 `aria-label`은 짧은 이름으로 유지해 탐색 목록을 간결하게 하고, 자세한 동작과 선행 조건은 설명으로 분리한다.

## Risks / Trade-offs

- [비활성 항목도 Tab 순서에 포함됨] → 실행할 수 없는 이유를 키보드로 확인해야 하는 요구사항을 우선하고 세 개의 고정된 항목 순서를 테스트한다.
- [짧은 이력이 남은 높이를 카드 하나가 차지할 수 있음] → 이력 목록은 자체 스크롤 영역을 가지되 항목은 콘텐츠 높이로 상단 정렬한다.
- [도움말이 좁은 창에서 검토 내용을 덮을 수 있음] → Activity Rail 바로 오른쪽에 최대 너비를 제한하고 도움말 자체는 포인터 입력을 받지 않게 한다.
- [CSS로 숨긴 설명의 보조 기술 해석 차이] → `aria-describedby`가 참조하는 요소를 DOM에 항상 유지하고 접근성 테스트에서 이름, 설명과 비활성 상태를 검증한다.
- [aria-disabled 실행 차단 누락] → 비활성 버튼 클릭이 콜백과 포커스 이동을 일으키지 않는 단위 테스트로 보호한다.
