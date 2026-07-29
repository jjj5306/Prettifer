## MODIFIED Requirements

### Requirement: 선형 이력의 비연속 커밋 선택
시스템은 비교 기준의 후손이며 하나의 조상 관계에 있는 커밋을 서로 인접하지 않아도 선택할 수 있게 해야 한다(SHALL). 시스템은 선택 순서와 관계없이 커밋의 조상 관계에 따라 오래된 커밋부터 변경을 반영해야 한다(SHALL). 부모가 둘 이상인 커밋은 사용자가 정한 기준 부모와 함께 선택할 수 있어야 한다(SHALL).

#### Scenario: 떨어진 커밋을 역순으로 선택
- **WHEN** 사용자가 선형 이력에서 `feat(auth): persist session`을 먼저 선택하고 그보다 오래된 `feat(auth): validate login request`를 나중에 선택한다
- **THEN** 시스템은 로그인 검증 변경을 먼저 반영하고 세션 저장 변경을 이어서 반영한다
- **AND** 두 커밋 사이의 미선택 리팩터링 커밋은 선택 목록에 포함하지 않는다

#### Scenario: merge commit을 기준 부모와 함께 선택
- **WHEN** 사용자가 부모가 둘인 merge commit을 첫 번째 부모를 기준으로 선택한다
- **THEN** 시스템은 그 부모와 merge commit 사이의 변경만 반영한다
- **AND** 다른 부모에서만 들어온 변경은 반영하지 않는다

#### Scenario: 기준 부모를 정하지 않은 merge commit
- **WHEN** 선택 목록에 기준 부모가 정해지지 않은 merge commit이 있다
- **THEN** 시스템은 계산을 시작하지 않는다
- **AND** 기준 부모가 필요한 커밋과 사용자가 취할 다음 행동을 함께 알린다

#### Scenario: 존재하지 않는 기준 부모 지정
- **WHEN** 선택한 커밋의 부모 수보다 큰 기준 부모 번호가 지정된다
- **THEN** 시스템은 계산을 시작하지 않는다
- **AND** 해당 커밋과 선택할 수 있는 부모 범위를 함께 알린다

#### Scenario: 부모가 하나인 커밋에 기준 부모 지정
- **WHEN** 부모가 하나인 커밋에 기준 부모가 지정된다
- **THEN** 시스템은 그 커밋의 변경을 지금까지와 같게 반영한다

## ADDED Requirements

### Requirement: 기준 부모와 함께 표시되는 포함 범위
시스템은 통합 결과에 포함된 merge commit마다 계산에 사용한 기준 부모를 함께 제공해야 한다(MUST).

#### Scenario: merge commit이 포함된 결과
- **WHEN** 기준 부모를 정한 merge commit이 포함된 통합 결과가 만들어진다
- **THEN** 결과는 그 커밋에 사용한 기준 부모를 함께 제공한다

#### Scenario: 같은 merge commit을 다른 부모로 다시 계산
- **WHEN** 사용자가 같은 merge commit의 기준 부모를 바꿔 결과를 다시 만든다
- **THEN** 시스템은 바뀐 기준 부모로 계산한 결과를 제공한다
- **AND** 결과에 표시되는 기준 부모도 함께 바뀐다
