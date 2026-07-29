## Why

merge commit은 통합 결과에 포함할 수 없다. `Merge commit · unavailable`로 표시되고
체크 상자가 비활성이다. 부모가 둘 이상이라 어느 부모를 기준으로 변경을 계산할지
정하는 수단이 없어서 아예 막아둔 상태다.

실제 검토 대상 저장소에서 이 제약은 크다. 검토에 쓰인 한 브랜치 범위에서는 29개
커밋 중 12개가 병합 커밋이었다. 브랜치를 자주 병합하는 흐름에서는 검토 대상의
상당 부분을 고를 수 없다.

사용자가 기준 부모를 정하면 merge commit도 통합 결과에 포함할 수 있게 한다.

## What Changes

- merge commit을 선택할 수 있게 하고, 선택하면 기준 부모를 정하도록 요구한다.
- 기준 부모를 정하지 않은 merge commit이 있으면 계산을 시작하지 않고 안내한다.
- 기준 부모를 기준으로 변경 경로와 통합 결과를 계산한다.
- 통합 결과에 각 merge commit의 기준 부모를 표시한다.
- 기준 부모 선택은 다른 커밋의 선택 상태를 바꾸지 않는다.
- 결과 계산 요청과 결과에 커밋 ID를 키로 하는 기준 부모 자료가 추가된다. 기존
  선택 커밋 배열의 형태는 바뀌지 않아 부모가 하나인 커밋만 다루는 호출부는 그대로
  동작한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `composite-diff-generation`: 선택 가능한 커밋의 범위에 merge commit이 포함되고,
  기준 부모를 사용해 변경을 계산하는 요구사항이 추가된다
- `desktop-repository-navigation`: merge commit의 체크와 기준 부모 선택 흐름이
  추가된다
- `desktop-composite-diff-review`: 통합 결과에 사용한 기준 부모를 표시하는
  요구사항이 추가된다

## Impact

- `src/history/repository-history-service.ts`의 선택 가능 판정과 검증
- `src/composition/selection-planner.ts`의 선택 계획과 기준 부모 검증
- `src/composition/composite-diff-service.ts`의 변경 경로 조회와 커밋 적용
- `src/desktop/shared/desktop-api.ts`의 결과 계산 요청 계약
- `src/desktop/renderer`의 커밋 카드 선택 상태와 결과 범위 표시
- 코어 유닛·통합 테스트, renderer 테스트와 Playwright Electron 흐름
- 이슈 #17과 README의 지원 범위
