## REMOVED Requirements

### Requirement: 작업대 activity rail
**Reason**: rail이 Commit History, Changed Files와 Diff Review처럼 작업대에 이미 보이는
영역까지 중복 진입점으로 노출하고, 각 항목의 목적과 사용 조건을 조작 전에 알려주지
않는다. 진입점을 Repository, File History와 Group Rules로 줄이고 도움말을 요구하는
아래 요구사항으로 대체한다. 화면 위치 표시, 메뉴 선택 유지와 선행 조건 시나리오는
새 요구사항으로 옮긴다.

## ADDED Requirements

### Requirement: 작업대 activity rail 진입점과 도움말
시스템은 목업의 좌측 activity rail에 Repository, File History와 Group Rules 항목을
이 순서로 제공해야 한다(MUST). Commit History, Changed Files와 Diff Review 영역은
작업대에 직접 표시하되 별도 activity rail 항목을 제공하지 않아야 한다(MUST). 각 rail
항목은 보이는 아이콘, 접근 가능한 영어 이름과 동작 설명을 제공해야 한다(MUST). 이름과
동작 설명은 마우스 호버와 키보드 포커스에서 같은 시각 도움말로 표시되어야 한다(MUST).
사용할 수 없는 항목의 설명은 필요한 선행 조건을 안내해야 한다(MUST). 현재 항목이
가리키는 검토 영역을 화면에서 현재 영역으로 표시해야 하며(MUST), 그 표시는 마우스와
키보드에서 동일해야 한다(MUST).

#### Scenario: 단순화된 진입점 표시
- **WHEN** 데스크톱 작업대가 표시된다
- **THEN** activity rail은 Repository, File History와 Group Rules 항목을 이 순서로 표시한다
- **THEN** activity rail은 Commit History, Changed Files와 Diff Review 항목을 표시하지 않는다
- **THEN** Commit History, Changed Files와 Diff Review 화면 자체는 기존 작업대에 계속 표시된다

#### Scenario: 선택한 변경 파일의 이력 탐색 시작
- **WHEN** 사용자가 비교 범위의 선택 결과를 빌드하고 Changed Files에서 파일을 선택한 뒤 activity rail의 두 번째 File History 항목을 실행한다
- **THEN** 검토 영역 전체가 선택 파일의 커밋 이력을 표시한다
- **THEN** 이력이 한 건이어도 항목은 콘텐츠 높이로 상단에 표시된다
- **THEN** 기존 통합 대상 선택, 선택 파일과 현재 diff는 변경되지 않는다
- **THEN** 사용자는 선택 결과로 돌아갈 수 있다

#### Scenario: 파일 이력에서 변경 내용 선택
- **WHEN** 사용자가 파일 커밋 이력에서 커밋을 선택한다
- **THEN** 검토 영역 전체가 해당 커밋이 파일에 만든 변경 내용을 표시한다
- **THEN** 사용자는 선택 파일의 커밋 이력으로 돌아갈 수 있다
- **THEN** 기본 선택 결과와 Changed Files 상태는 변경되지 않는다

#### Scenario: 마우스로 동작 설명 확인
- **WHEN** 사용자가 activity rail의 항목에 마우스를 올린다
- **THEN** 항목의 영어 이름과 항목이 여는 영역 또는 수행하는 동작이 도움말로 표시된다
- **THEN** 도움말은 Activity Rail의 오른쪽에 표시된다

#### Scenario: 키보드로 동작 설명 확인
- **WHEN** 사용자가 키보드로 activity rail 항목에 포커스를 둔다
- **THEN** 마우스를 올렸을 때와 같은 이름 및 동작 설명이 도움말로 표시된다
- **THEN** 보조 기술은 버튼의 이름과 동작 설명을 함께 확인할 수 있다

#### Scenario: 사용할 수 없는 항목의 조건 확인
- **WHEN** 선택 결과 또는 선택 파일이 없어 File History를 사용할 수 없거나 통합 결과가 없어 Group Rules를 사용할 수 없다
- **THEN** 사용자는 마우스 호버 또는 키보드 포커스로 필요한 선택 결과나 파일 조건을 확인할 수 있다
- **THEN** 해당 항목을 실행해도 현재 영역과 포커스 대상은 변경되지 않는다

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

#### Scenario: 메뉴 선택 유지
- **WHEN** 사용자가 사용할 수 있는 activity rail 항목을 실행한다
- **THEN** 실행한 항목이 현재 메뉴로 표시된다
- **THEN** 다른 항목을 실행할 때까지 선택 표시가 유지된다

#### Scenario: 전체 높이 메뉴 영역
- **WHEN** 데스크톱 작업대가 표시된다
- **THEN** activity rail은 앱 콘텐츠의 가장 왼쪽 열에서 상단부터 하단까지 표시된다
- **THEN** 앱 바, 저장소 도구 모음과 검토 영역은 activity rail의 오른쪽에 표시된다

#### Scenario: 진입점별 선행 조건
- **WHEN** 선택 결과가 아직 만들어지지 않았거나 Changed Files에서 파일을 선택하지 않았다
- **THEN** File History는 사용할 수 없는 상태로 표시된다
- **THEN** 선택 결과가 준비되고 변경 파일이 선택되면 File History를 사용할 수 있다
- **THEN** 선택 결과가 없는 Group Rules는 사용할 수 없는 상태로 표시된다
- **THEN** Repository 항목은 계속 사용할 수 있다
- **THEN** 사용할 수 없는 항목은 현재 메뉴로 표시되지 않는다

#### Scenario: 결과가 사라진 뒤의 영역 표시
- **WHEN** File History 또는 Group Rules 항목이 현재 메뉴인 상태에서 선택 결과를 다시 만들기 시작한다
- **THEN** activity rail에는 현재 메뉴 표시가 남지 않는다
- **THEN** 현재 영역 표시는 커밋 이력 영역으로 이동한다
