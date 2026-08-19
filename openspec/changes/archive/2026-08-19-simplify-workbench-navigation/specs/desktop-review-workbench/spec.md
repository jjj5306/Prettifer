## REMOVED Requirements

### Requirement: 작업대 activity rail 진입점과 도움말
**Reason**: rail의 File History와 Group Rules는 `Changed Files`에서 고른 대상을 다루는
동작이라 그 패널 옆에 있어야 하고, Group Rules는 Config View 안에서도 열 수 있다.
rail은 실제로 옮겨 갈 곳이 있는 진입점만 두는 요구사항으로 대체한다. 파일 이력
진입점은 `file-history` capability로 옮기고, 도움말과 현재 영역 표시는 아래 요구사항으로
옮긴다.

## ADDED Requirements

### Requirement: 작업대 activity rail 진입점
시스템은 목업의 좌측 activity rail에 Repository와 About Prettifer 항목을 이 순서로
제공해야 한다(MUST). 파일 이력, 그룹 규칙, Commit History, `Changed Files`와 diff 검토를
여는 activity rail 항목을 제공하지 않아야 한다(MUST NOT). 각 rail 항목은 보이는 아이콘,
접근 가능한 영어 이름과 동작 설명을 제공해야 한다(MUST). 이름과 동작 설명은 마우스
호버와 키보드 포커스에서 같은 시각 도움말로 표시되어야 한다(MUST). 두 항목은 저장소나
선택 결과 상태와 무관하게 항상 사용할 수 있어야 한다(MUST). Repository 항목이 가리키는
영역을 화면에서 현재 영역으로 표시해야 하며(MUST), 그 표시는 마우스와 키보드에서
동일해야 한다(MUST).

#### Scenario: 두 진입점 표시
- **WHEN** 데스크톱 작업대가 표시된다
- **THEN** activity rail은 Repository와 About Prettifer 항목을 이 순서로 표시한다
- **THEN** activity rail은 File History와 Group Rules 항목을 표시하지 않는다
- **THEN** 파일 이력과 그룹 규칙은 `Changed Files` 패널에서 계속 열 수 있다

#### Scenario: 저장소 영역으로 이동
- **WHEN** 사용자가 activity rail의 Repository 항목을 실행한다
- **THEN** 키보드 포커스가 저장소와 비교 범위 영역으로 이동한다
- **THEN** 그 영역이 현재 영역으로 표시된다

#### Scenario: 선택 결과와 무관한 사용 가능 상태
- **WHEN** 저장소를 열지 않았거나 선택 결과가 아직 만들어지지 않았다
- **THEN** Repository와 About Prettifer 항목은 모두 사용할 수 있는 상태로 표시된다
- **THEN** 사용할 수 없는 상태로 표시되는 rail 항목이 없다

#### Scenario: 마우스로 동작 설명 확인
- **WHEN** 사용자가 activity rail의 항목에 마우스를 올린다
- **THEN** 항목의 영어 이름과 항목이 여는 영역 또는 수행하는 동작이 도움말로 표시된다
- **THEN** 도움말은 activity rail의 오른쪽에 표시된다

#### Scenario: 키보드로 동작 설명 확인
- **WHEN** 사용자가 키보드로 activity rail 항목에 포커스를 둔다
- **THEN** 마우스를 올렸을 때와 같은 이름 및 동작 설명이 도움말로 표시된다
- **THEN** 보조 기술은 버튼의 이름과 동작 설명을 함께 확인할 수 있다

#### Scenario: 포커스가 옮겨간 뒤의 영역 표시
- **WHEN** 사용자가 activity rail로 이동한 뒤 다른 영역의 컨트롤을 조작한다
- **THEN** 현재 영역 표시는 마지막으로 이동한 영역에 유지된다

#### Scenario: 전체 높이 메뉴 영역
- **WHEN** 데스크톱 작업대가 표시된다
- **THEN** activity rail은 앱 콘텐츠의 가장 왼쪽 열에서 상단부터 하단까지 표시된다
- **THEN** 앱 바, 저장소 도구 모음과 검토 영역은 activity rail의 오른쪽에 표시된다

### Requirement: Prettifer 소개 화면
시스템은 activity rail의 About Prettifer 항목으로 앱 이름, 실행 중인 버전, 한 줄 소개와
저장소 주소를 표시하는 소개 화면을 열어야 한다(MUST). 소개 화면은 키보드로 열고 닫을 수
있어야 하며(MUST), 닫으면 포커스를 열기 전 위치로 되돌려야 한다(MUST). 소개 화면은
저장소, 비교 범위, 커밋 선택과 검토 상태를 변경하지 않아야 한다(MUST NOT).

#### Scenario: 소개 화면 열기
- **WHEN** 사용자가 activity rail의 About Prettifer 항목을 실행한다
- **THEN** 시스템은 앱 이름, 실행 중인 버전, 한 줄 소개와 저장소 주소를 표시한다

#### Scenario: 버전을 읽을 수 없는 상태
- **WHEN** 실행 중인 버전을 확인할 수 없다
- **THEN** 시스템은 나머지 소개 내용을 계속 표시한다
- **THEN** 버전을 확인할 수 없다는 사실을 표시한다

#### Scenario: 키보드로 소개 화면 닫기
- **WHEN** 사용자가 소개 화면에서 Escape를 누른다
- **THEN** 소개 화면이 닫힌다
- **THEN** 포커스가 About Prettifer 항목으로 돌아간다

#### Scenario: 닫기 컨트롤로 소개 화면 닫기
- **WHEN** 사용자가 소개 화면의 닫기 컨트롤을 실행한다
- **THEN** 소개 화면이 닫힌다
- **THEN** 포커스가 About Prettifer 항목으로 돌아간다

#### Scenario: 검토 상태 보존
- **WHEN** 사용자가 선택 결과를 검토하다가 소개 화면을 열고 닫는다
- **THEN** 저장소, 비교 범위, 커밋 선택, 선택 파일과 현재 diff는 변경되지 않는다
