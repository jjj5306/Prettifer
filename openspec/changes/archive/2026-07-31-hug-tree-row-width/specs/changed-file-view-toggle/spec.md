## MODIFIED Requirements

### Requirement: Tree View 폴더 접기와 계층선
시스템은 Tree View에서 경로 계층을 폴더 행으로 표시하고, 폴더를 접거나 펼칠 수 있어야
한다(SHALL). 계층은 들여쓰기와 안내선으로 표현해야 한다(MUST). Tree View의 행은 자기 내용
너비만큼만 차지해야 한다(MUST).

#### Scenario: 행 너비가 내용에 맞음
- **WHEN** 사용자가 Tree View에서 변경 파일 영역을 넓힌다
- **THEN** 각 파일과 폴더 행은 자기 이름을 담을 만큼만 넓어진다
- **AND** 영역 전체 너비로 늘어나지 않는다

#### Scenario: 이름이 영역보다 긴 행
- **WHEN** Tree View의 파일 이름이 변경 파일 영역보다 길다
- **THEN** 행은 영역을 넘지 않는다
- **AND** 사용자는 보이는 이름 또는 접근 가능한 이름으로 전체 경로를 확인할 수 있다
