## MODIFIED Requirements

### Requirement: 작업대 activity rail
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

#### Scenario: 전체 파일에서 파일 이력 탐색 시작
- **WHEN** 사용자가 비교 범위를 로드하고 activity rail의 두 번째 File History 항목을 실행한다
- **THEN** 검토 영역 전체가 비교 대상 브랜치의 파일 트리를 표시한다
- **THEN** 선택 결과를 계산하거나 Changed Files에서 파일을 먼저 선택할 필요가 없다
- **THEN** 기존 통합 대상 선택, 선택 파일과 현재 diff는 변경되지 않는다

#### Scenario: 전체 파일에서 파일 선택
- **WHEN** 사용자가 File History의 전체 파일 트리에서 파일을 선택한다
- **THEN** 검토 영역 전체가 선택 파일의 커밋 이력을 표시한다
- **THEN** 이력이 한 건이어도 항목은 콘텐츠 높이로 상단에 표시된다
- **THEN** 사용자는 전체 파일 트리로 돌아갈 수 있다

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
- **WHEN** 비교 범위가 없어 File History를 사용할 수 없거나 통합 결과가 없어 Group Rules를 사용할 수 없다
- **THEN** 사용자는 마우스 호버 또는 키보드 포커스로 필요한 비교 범위나 결과 조건을 확인할 수 있다
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

#### Scenario: 전체 높이 메뉴 영역
- **WHEN** 데스크톱 작업대가 표시된다
- **THEN** activity rail은 앱 콘텐츠의 가장 왼쪽 열에서 상단부터 하단까지 표시된다
- **THEN** 앱 바, 저장소 도구 모음과 검토 영역은 activity rail의 오른쪽에 표시된다

#### Scenario: 진입점별 선행 조건
- **WHEN** 비교 범위 또는 선택 결과가 아직 만들어지지 않았다
- **THEN** 비교 범위가 없는 File History와 선택 결과가 없는 Group Rules는 각각 사용할 수 없는 상태로 표시된다
- **THEN** 비교 범위가 있으면 선택 결과와 선택 파일이 없어도 File History를 사용할 수 있다
- **THEN** Repository 항목은 계속 사용할 수 있다
- **THEN** 사용할 수 없는 항목은 현재 메뉴로 표시되지 않는다
