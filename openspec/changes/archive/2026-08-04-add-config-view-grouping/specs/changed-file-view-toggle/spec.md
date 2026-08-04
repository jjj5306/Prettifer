## MODIFIED Requirements

### Requirement: 변경 파일 보기 전환
시스템은 `Changed Files` 패널에서 Tree View, List View와 Config View를 선택하는 토글을
제공해야 한다(MUST). 현재 선택된 보기를 시각 및 보조 기술 상태로 표시해야 한다(MUST).

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

### Requirement: 보기 사이의 선택 맥락 보존
시스템은 Tree View, List View와 Config View를 전환한 뒤 선택 파일과 현재 diff를 유지해야
한다(MUST). 보기 전환은 통합 결과를 다시 계산하지 않아야 한다(MUST).

#### Scenario: 선택 파일이 있는 상태에서 전환
- **WHEN** 사용자가 변경 파일을 선택하고 다른 보기로 전환한다
- **THEN** 전환된 보기에서 같은 저장소 상대 경로의 파일이 선택 상태로 표시된다
- **THEN** diff 영역은 같은 파일의 기준과 선택 결과를 계속 표시한다

#### Scenario: Config View로 전환할 때 선택 파일이 속한 그룹
- **WHEN** 사용자가 파일을 선택한 상태에서 Config View로 전환한다
- **THEN** 그 파일이 속한 그룹이 펼쳐진 상태로 표시된다
- **THEN** 그 파일이 선택 상태로 표시된다

#### Scenario: 보기 전환만 수행
- **WHEN** 사용자가 결과를 변경하지 않고 보기를 전환한다
- **THEN** 시스템은 새 결과 계산이나 Git 요청을 시작하지 않는다

### Requirement: 동일한 파일 상태 표현
시스템은 모든 보기에서 동일한 파일 집합, 저장소 상대 경로와 추가, 수정 또는 삭제 상태를 제공해야
한다(MUST). 문제 파일의 문제 상태도 모든 보기에서 동일하게 제공해야 한다(MUST).

#### Scenario: 모든 보기의 파일 집합
- **WHEN** 사용자가 같은 통합 결과에서 Tree View, List View와 Config View를 차례로 확인한다
- **THEN** 각 보기에 표시된 파일의 저장소 상대 경로 집합이 동일하다
- **THEN** 각 파일의 상태가 모든 보기에서 동일하다

#### Scenario: 긴 경로 표시
- **WHEN** 변경 파일의 저장소 상대 경로가 패널 너비보다 길다
- **THEN** 행은 다른 작업 영역의 너비를 밀어내지 않는다
- **THEN** 사용자는 보이는 이름 또는 접근 가능한 이름으로 전체 경로를 확인할 수 있다

#### Scenario: 모든 보기의 문제 파일
- **WHEN** 문제 파일이 있는 통합 결과에서 사용자가 세 보기를 차례로 확인한다
- **THEN** 세 보기 모두 그 파일을 문제 상태로 표시한다
- **THEN** 문제 파일도 경로 계층, 전체 경로 목록과 규칙 그룹에서 같은 위치에 나타난다

### Requirement: 접근 가능한 보기 토글
시스템은 키보드로 Tree View, List View와 Config View를 선택할 수 있게 해야 하며(MUST),
각 토글에 보이는 이름과 선택 상태를 제공해야 한다(MUST).

#### Scenario: 키보드로 보기 변경
- **WHEN** 사용자가 Tab으로 보기 토글에 포커스하고 Space 또는 Enter를 누른다
- **THEN** 포커스한 보기가 활성화된다
- **THEN** 포커스 위치와 활성 보기를 확인할 수 있다

#### Scenario: 보기 전환 뒤 파일 탐색
- **WHEN** 사용자가 키보드로 보기를 전환한 뒤 변경 파일 영역으로 이동한다
- **THEN** 선택 파일 또는 첫 탐색 가능한 파일에서 검토를 계속할 수 있다

### Requirement: 빈 결과 표시
시스템은 변경 파일이 없는 결과에서 모든 보기의 공통 빈 상태와 다음 행동을 표시해야 한다(MUST).

#### Scenario: 변경 파일이 없는 상태에서 보기 전환
- **WHEN** 변경 파일이 없는 결과에서 사용자가 보기를 전환한다
- **THEN** 시스템은 변경 파일이 없음을 계속 표시한다
- **THEN** 비교 범위 또는 커밋 선택을 변경할 수 있는 상태를 유지한다

#### Scenario: 변경 파일이 없는 상태의 Config View
- **WHEN** 변경 파일이 없는 결과에서 사용자가 Config View를 선택한다
- **THEN** 시스템은 규칙 그룹 대신 변경 파일이 없음을 표시한다
- **THEN** 사용자는 규칙 편집으로 이동할 수 있다
