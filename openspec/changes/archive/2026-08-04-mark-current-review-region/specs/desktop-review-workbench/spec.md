## MODIFIED Requirements

### Requirement: 작업대 activity rail
시스템은 목업의 좌측 activity rail을 제공하고 저장소, 커밋, 변경 파일, 그룹 규칙과
diff 검토 영역으로 이동할 수 있게 해야 한다(MUST). 각 항목은 보이는 아이콘과
접근 가능한 영어 이름을 제공해야 한다(MUST). 현재 항목이 가리키는 검토 영역을 화면에서
현재 영역으로 표시해야 하며(MUST), 그 표시는 마우스와 키보드에서 동일해야 한다(MUST).

#### Scenario: 커밋 영역으로 이동
- **WHEN** 사용자가 activity rail의 Commit History 항목을 실행한다
- **THEN** 키보드 포커스가 Commit History 영역으로 이동한다
- **THEN** 현재 작업 영역을 시각적으로 확인할 수 있다

#### Scenario: 마우스로 이동한 영역 확인
- **WHEN** 사용자가 마우스로 activity rail 항목을 실행한다
- **THEN** 해당 항목이 가리키는 검토 영역이 현재 영역으로 표시된다
- **THEN** 사용자는 포커스 위치를 보지 않고도 어느 영역으로 이동했는지 확인할 수 있다

#### Scenario: 키보드로 이동한 영역 확인
- **WHEN** 사용자가 키보드로 activity rail 항목을 실행한다
- **THEN** 마우스로 실행했을 때와 같은 현재 영역 표시가 나타난다

#### Scenario: 포커스가 옮겨간 뒤의 영역 표시
- **WHEN** 사용자가 activity rail로 이동한 뒤 다른 영역의 컨트롤을 조작한다
- **THEN** 현재 영역 표시는 레일의 현재 항목과 같은 영역에 유지된다

#### Scenario: 그룹 규칙 편집으로 이동
- **WHEN** 사용자가 activity rail의 Group Rules 항목을 실행한다
- **THEN** `Changed Files` 패널이 Config View를 표시한다
- **THEN** 규칙 편집이 열린 상태로 표시된다
- **THEN** 키보드 포커스가 `Changed Files` 영역으로 이동한다
- **THEN** `Changed Files` 영역이 현재 영역으로 표시된다

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

#### Scenario: 결과가 사라진 뒤의 영역 표시
- **WHEN** 변경 파일 또는 diff 항목이 현재 메뉴인 상태에서 선택 결과를 다시 만들기 시작한다
- **THEN** 현재 메뉴 표시가 커밋 영역으로 되돌아간다
- **THEN** 현재 영역 표시도 커밋 영역으로 함께 이동한다

### Requirement: 접근 가능한 작업대
시스템은 키보드로 주요 작업을 수행할 수 있게 해야 하며(MUST), 보이는 이름,
포커스 표시와 상태 알림을 제공해야 한다(MUST). 현재 영역 표시는 시각 표현만
담당해야 하며(MUST), 접근 가능한 현재 위치는 activity rail이 제공해야 한다(MUST).

#### Scenario: 키보드 검토
- **WHEN** 사용자가 키보드만 사용해 앱을 탐색한다
- **THEN** 저장소, 비교 범위, 커밋, 변경 파일과 diff 동작에 순서대로 접근할 수 있다
- **THEN** 현재 포커스와 선택 상태를 시각적으로 확인할 수 있다

#### Scenario: 현재 위치를 한 번만 알림
- **WHEN** 보조 기술이 현재 검토 영역을 읽는다
- **THEN** activity rail의 현재 항목에서 현재 위치를 확인할 수 있다
- **THEN** 검토 영역 자체는 같은 사실을 중복해서 알리지 않는다

#### Scenario: 고대비 모드
- **WHEN** 운영체제가 forced-colors 모드를 사용한다
- **THEN** 주요 컨트롤의 포커스와 선택 상태가 운영체제 색상으로 구분된다
- **THEN** 현재 영역 표시도 운영체제 색상으로 구분된다
