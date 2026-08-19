## MODIFIED Requirements

### Requirement: 접근 가능한 보기 토글
시스템은 키보드로 Tree View, List View, Config View와 Full Tree를 선택할 수 있게 해야 하며
(MUST), 각 토글에 보이는 이름과 선택 상태를 제공해야 한다(MUST). 네 토글은 서로 구분되는
아이콘을 표시해야 하며(MUST), 두 토글이 같은 아이콘을 사용하지 않아야 한다(MUST NOT).

#### Scenario: 키보드로 보기 변경
- **WHEN** 사용자가 Tab으로 보기 토글에 포커스하고 Space 또는 Enter를 누른다
- **THEN** 포커스한 보기가 활성화된다
- **THEN** 포커스 위치와 활성 보기를 확인할 수 있다

#### Scenario: 보기 전환 뒤 파일 탐색
- **WHEN** 사용자가 키보드로 보기를 전환한 뒤 변경 파일 영역으로 이동한다
- **THEN** 선택 파일 또는 첫 탐색 가능한 파일에서 검토를 계속할 수 있다

#### Scenario: 토글별 아이콘 구분
- **WHEN** 사용자가 `Changed Files` 머리글의 보기 토글을 본다
- **THEN** Tree View, List View, Config View와 Full Tree가 각각 다른 아이콘으로 표시된다
- **THEN** 사용자는 누르기 전에 각 토글이 어떤 보기인지 아이콘과 이름으로 구분할 수 있다
