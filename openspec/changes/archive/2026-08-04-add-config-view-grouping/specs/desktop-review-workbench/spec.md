## MODIFIED Requirements

### Requirement: 작업대 activity rail
시스템은 목업의 좌측 activity rail을 제공하고 저장소, 커밋, 변경 파일, 그룹 규칙과
diff 검토 영역으로 이동할 수 있게 해야 한다(MUST). 각 항목은 보이는 아이콘과
접근 가능한 영어 이름을 제공해야 한다(MUST).

#### Scenario: 커밋 영역으로 이동
- **WHEN** 사용자가 activity rail의 Commit History 항목을 실행한다
- **THEN** 키보드 포커스가 Commit History 영역으로 이동한다
- **THEN** 현재 작업 영역을 시각적으로 확인할 수 있다

#### Scenario: 그룹 규칙 편집으로 이동
- **WHEN** 사용자가 activity rail의 Group Rules 항목을 실행한다
- **THEN** `Changed Files` 패널이 Config View를 표시한다
- **THEN** 규칙 편집이 열린 상태로 표시된다
- **THEN** 키보드 포커스가 `Changed Files` 영역으로 이동한다

#### Scenario: 다른 보기에서 그룹 규칙 편집으로 이동
- **WHEN** 사용자가 Tree View 또는 List View를 보는 중에 Group Rules 항목을 실행한다
- **THEN** 보기가 Config View로 바뀐다
- **THEN** 선택 파일이 속한 그룹이 펼쳐진 상태로 표시된다
- **THEN** 선택 파일과 현재 diff는 변경되지 않는다

#### Scenario: 메뉴 선택 유지
- **WHEN** 사용자가 사용할 수 있는 activity rail 항목을 실행한다
- **THEN** 실행한 항목이 현재 메뉴로 표시된다
- **THEN** 다른 항목을 실행할 때까지 선택 표시가 유지된다

#### Scenario: 전체 높이 메뉴 영역
- **WHEN** 데스크톱 작업대가 표시된다
- **THEN** activity rail은 앱 콘텐츠의 가장 왼쪽 열에서 상단부터 하단까지 표시된다
- **THEN** 앱 바, 저장소 도구 모음과 검토 영역은 activity rail의 오른쪽에 표시된다

#### Scenario: 결과 전용 영역
- **WHEN** 선택 결과가 아직 만들어지지 않았다
- **THEN** 변경 파일, 그룹 규칙과 diff activity 항목은 사용할 수 없는 상태로 표시된다
- **THEN** 저장소와 커밋 항목은 계속 사용할 수 있다
- **THEN** 사용할 수 없는 항목은 현재 메뉴로 표시되지 않는다
