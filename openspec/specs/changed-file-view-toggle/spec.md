# changed-file-view-toggle Specification

## Purpose
`Changed Files` 패널에서 변경 파일을 Tree View, List View, Config View와 Full Tree로
전환해 탐색하고, 보기 전환 뒤에도 선택 파일과 현재 diff 맥락을 유지하게 한다.

## Requirements

### Requirement: 변경 파일 보기 전환
시스템은 `Changed Files` 패널에서 Tree View, List View, Config View와 Full Tree를 선택하는
토글을 제공해야 한다(MUST). 현재 선택된 보기를 시각 및 보조 기술 상태로 표시해야 한다(MUST).

#### Scenario: Tree View 선택
- **WHEN** 사용자가 Tree View 토글을 선택한다
- **THEN** 변경 파일이 저장소 상대 경로의 폴더 계층으로 표시된다
- **THEN** Tree View 토글이 선택 상태로 표시된다

#### Scenario: List View 선택
- **WHEN** 사용자가 List View 토글을 선택한다
- **THEN** 각 변경 파일이 전체 저장소 상대 경로를 포함한 한 행으로 표시된다
- **THEN** List View 토글이 선택 상태로 표시된다

#### Scenario: Config View 선택
- **WHEN** 사용자가 Config View 토글을 선택한다
- **THEN** 변경 파일이 사용자가 정의한 경로 prefix 규칙의 그룹으로 묶여 표시된다
- **THEN** Config View 토글이 선택 상태로 표시된다

#### Scenario: 규칙이 없는 저장소에서 Config View 선택
- **WHEN** 그룹화 규칙이 하나도 없는 저장소에서 사용자가 Config View 토글을 선택한다
- **THEN** Config View 토글이 선택 상태로 표시된다
- **THEN** 규칙이 없다는 사실과 규칙을 만드는 방법이 표시된다

#### Scenario: Full Tree 선택
- **WHEN** 사용자가 Full Tree 토글을 선택한다
- **THEN** 비교 기준 시점의 추적 파일 전체가 폴더 계층으로 표시된다
- **THEN** Full Tree 토글이 선택 상태로 표시된다

### Requirement: 트리 행 표시
시스템은 Tree View와 Full Tree의 행을 평평하게 표시해야 하며(MUST), 행마다 테두리나 둥근 모서리를
그리지 않아야 한다(MUST NOT). 행은 표시 영역의 너비를 채워야 하며(MUST), 계층은 레벨당 한 단계의
들여쓰기로 표현해야 한다(MUST). 폴더 계층선을 그리지 않아야 한다(MUST NOT). 트리는 가로로
스크롤하지 않아야 한다(MUST NOT).

#### Scenario: 행 모양
- **WHEN** 사용자가 Tree View 또는 Full Tree를 본다
- **THEN** 각 행은 테두리와 둥근 모서리 없이 표시된다
- **AND** 각 행은 표시 영역의 너비를 채운다

#### Scenario: 계층 표현
- **WHEN** 트리에 하위 항목이 있는 폴더가 표시된다
- **THEN** 하위 행은 상위 행보다 한 단계 들여써서 표시된다
- **AND** 폴더 계층선은 표시되지 않는다

#### Scenario: 선택과 가리킴 표시
- **WHEN** 사용자가 트리의 행을 선택하거나 가리킨다
- **THEN** 그 행 전체를 덮는 띠로 표시된다

#### Scenario: 이름이 표시 영역보다 긴 행
- **WHEN** 트리의 파일 또는 폴더 이름이 표시 영역보다 길다
- **THEN** 이름은 표시 영역 경계에서 잘린다
- **AND** 트리는 가로로 스크롤되지 않는다
- **AND** 사용자는 접근 가능한 이름으로 전체 경로를 확인할 수 있다

#### Scenario: 고대비 모드의 선택 표시
- **WHEN** 운영체제가 forced-colors 모드를 사용한다
- **THEN** 선택된 행을 운영체제 색상으로 구분할 수 있다

### Requirement: Tree View 폴더 접기
시스템은 Tree View의 각 폴더를 접고 펼 수 있게 해야 하며(MUST), 현재 펼침 상태를 보조 기술에
제공해야 한다(MUST). 하위 항목이 폴더 하나뿐인 폴더가 이어지면 한 행에 경로로 합쳐야 한다(MUST).

#### Scenario: 폴더 접기
- **WHEN** 사용자가 Tree View에서 폴더 행을 실행한다
- **THEN** 해당 폴더의 하위 폴더와 파일이 표시되지 않는다
- **THEN** 폴더 행이 접힌 상태로 표시된다

#### Scenario: 폴더 다시 펼치기
- **WHEN** 사용자가 접힌 폴더 행을 다시 실행한다
- **THEN** 해당 폴더의 하위 항목이 다시 표시된다
- **THEN** 선택 파일과 현재 diff는 변경되지 않는다

#### Scenario: 단일 하위 폴더 경로 합치기
- **WHEN** 하위 항목이 폴더 하나뿐인 폴더가 연속으로 이어진다
- **THEN** 이어지는 폴더 이름이 하나의 행에 경로 형태로 함께 표시된다
- **THEN** 해당 경로 전체가 한 단계만 들여쓰기된다

#### Scenario: 하위 파일이 있는 폴더
- **WHEN** 폴더가 파일을 하나만 포함한다
- **THEN** 해당 폴더는 파일과 합쳐지지 않고 자신의 행으로 표시된다

### Requirement: 보기 사이의 선택 맥락 보존
시스템은 보기를 전환한 뒤 선택 파일과 현재 diff를 유지해야 한다(MUST). 보기 전환은 통합 결과를
다시 계산하지 않아야 한다(MUST).

#### Scenario: 선택 파일이 있는 상태에서 전환
- **WHEN** 사용자가 변경 파일을 선택하고 다른 보기로 전환한다
- **THEN** 전환된 보기에서 같은 저장소 상대 경로의 파일이 선택 상태로 표시된다
- **THEN** diff 영역은 같은 파일의 기준과 선택 결과를 계속 표시한다

#### Scenario: Config View로 전환할 때 선택 파일이 속한 그룹
- **WHEN** 사용자가 파일을 선택한 상태에서 Config View로 전환한다
- **THEN** 그 파일이 속한 그룹이 펼쳐진 상태로 표시된다
- **THEN** 그 파일이 선택 상태로 표시된다

#### Scenario: Full Tree로 전환할 때 선택 파일의 위치
- **WHEN** 사용자가 변경 파일을 선택한 상태에서 Full Tree로 전환한다
- **THEN** 그 파일까지 이어지는 폴더가 펼쳐진 상태로 표시된다
- **THEN** 그 파일이 선택 상태로 표시된다

#### Scenario: 보기 전환만 수행
- **WHEN** 사용자가 결과를 변경하지 않고 보기를 전환한다
- **THEN** 시스템은 새 결과 계산을 시작하지 않는다

### Requirement: 동일한 파일 상태 표현
시스템은 모든 보기에서 통합 결과의 변경 파일에 대해 동일한 저장소 상대 경로와 추가, 수정 또는
삭제 상태를 제공해야 한다(MUST). 문제 파일의 문제 상태도 모든 보기에서 동일하게 제공해야
한다(MUST). Tree View, List View와 Config View는 변경 파일만 표시해야 하며(MUST), Full Tree는
변경되지 않은 추적 파일을 함께 표시해야 한다(MUST).

#### Scenario: 변경 파일만 보여 주는 보기의 파일 집합
- **WHEN** 사용자가 같은 통합 결과에서 Tree View, List View와 Config View를 차례로 확인한다
- **THEN** 각 보기에 표시된 파일의 저장소 상대 경로 집합이 동일하다
- **THEN** 각 파일의 상태가 세 보기에서 동일하다

#### Scenario: 모든 보기의 변경 파일 상태
- **WHEN** 사용자가 네 보기에서 같은 변경 파일을 확인한다
- **THEN** 그 파일의 추가, 수정 또는 삭제 상태가 네 보기에서 동일하다

#### Scenario: Full Tree가 더 보여 주는 파일
- **WHEN** 사용자가 Full Tree를 확인한다
- **THEN** 통합 결과의 변경 파일이 모두 표시된다
- **THEN** 통합 결과가 건드리지 않은 추적 파일도 변경 없음으로 함께 표시된다

#### Scenario: 긴 경로 표시
- **WHEN** 변경 파일의 저장소 상대 경로가 패널 너비보다 길다
- **THEN** 행은 다른 작업 영역의 너비를 밀어내지 않는다
- **THEN** 사용자는 보이는 이름 또는 접근 가능한 이름으로 전체 경로를 확인할 수 있다

#### Scenario: 모든 보기의 문제 파일
- **WHEN** 문제 파일이 있는 통합 결과에서 사용자가 네 보기를 차례로 확인한다
- **THEN** 네 보기 모두 그 파일을 문제 상태로 표시한다
- **THEN** 문제 파일도 경로 계층, 전체 경로 목록과 규칙 그룹에서 같은 위치에 나타난다

### Requirement: 안전한 경로 렌더링
시스템은 파일 경로를 텍스트로 렌더링해야 하며(MUST), 경로 내용을 HTML로
실행하거나 해석하지 않아야 한다(MUST).

#### Scenario: 마크업 형태의 경로
- **WHEN** 파일 경로에 HTML 마크업처럼 보이는 문자가 포함된다
- **THEN** 시스템은 해당 문자를 파일 경로 텍스트로 표시한다
- **THEN** renderer에서 경로 내용이 실행되지 않는다

### Requirement: 접근 가능한 보기 토글
시스템은 키보드로 Tree View, List View, Config View와 Full Tree를 선택할 수 있게 해야 하며
(MUST), 각 토글에 보이는 이름과 선택 상태를 제공해야 한다(MUST).

#### Scenario: 키보드로 보기 변경
- **WHEN** 사용자가 Tab으로 보기 토글에 포커스하고 Space 또는 Enter를 누른다
- **THEN** 포커스한 보기가 활성화된다
- **THEN** 포커스 위치와 활성 보기를 확인할 수 있다

#### Scenario: 보기 전환 뒤 파일 탐색
- **WHEN** 사용자가 키보드로 보기를 전환한 뒤 변경 파일 영역으로 이동한다
- **THEN** 선택 파일 또는 첫 탐색 가능한 파일에서 검토를 계속할 수 있다

### Requirement: 빈 결과 표시
시스템은 변경 파일이 없는 결과에서 모든 보기의 공통 빈 상태와 다음 행동을 표시해야 한다(MUST).
Full Tree는 변경 파일이 없어도 비교 기준의 구조를 표시해야 한다(MUST).

#### Scenario: 변경 파일이 없는 상태에서 보기 전환
- **WHEN** 변경 파일이 없는 결과에서 사용자가 Tree View, List View와 Config View를 전환한다
- **THEN** 시스템은 변경 파일이 없음을 계속 표시한다
- **THEN** 비교 범위 또는 커밋 선택을 변경할 수 있는 상태를 유지한다

#### Scenario: 변경 파일이 없는 상태의 Config View
- **WHEN** 변경 파일이 없는 결과에서 사용자가 Config View를 선택한다
- **THEN** 시스템은 규칙 그룹 대신 변경 파일이 없음을 표시한다
- **THEN** 사용자는 규칙 편집으로 이동할 수 있다

#### Scenario: 변경 파일이 없는 상태의 Full Tree
- **WHEN** 변경 파일이 없는 결과에서 사용자가 Full Tree를 선택한다
- **THEN** 시스템은 비교 기준의 추적 파일 구조를 표시한다
- **THEN** 모든 파일이 변경 없음으로 표시된다
