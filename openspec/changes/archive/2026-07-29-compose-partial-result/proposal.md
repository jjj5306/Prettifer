## Why

선택 커밋 중 하나라도 독립 적용할 수 없으면 계산 전체가 실패하고 사용자는 아무
결과도 받지 못한다. 실제로는 문제가 한두 파일에만 생기고 나머지는 문제없이
계산되는 경우가 많다.

merge commit 선택(#17)이 열리면서 이 제약의 영향이 더 커졌다. 고를 수 있는 커밋
조합이 넓어진 만큼 충돌 가능성도 함께 올라간다.

계산 가능한 파일의 결과를 먼저 제공하고, 내용 선택이 필요한 파일만 문제 상태로
구분해 검토를 이어갈 수 있게 한다.

## What Changes

- 커밋 적용 중 충돌이 생기면 충돌 경로만 문제로 기록하고 나머지 변경은 유지한다.
- 문제가 생긴 뒤에도 남은 선택 커밋을 계속 적용한다.
- 통합 결과에 문제 파일 목록과 각 문제의 원인, 관련 커밋과 다음 행동을 담는다.
- 결과 전체를 완전한 결과와 부분 결과로 구분해 제공한다.
- 어떤 파일도 계산할 수 없으면 지금처럼 실패로 처리한다.
- 변경 파일 목록에서 문제 파일을 원래 위치에 문제 상태로 표시한다.
- 문제 파일을 선택하면 diff 대신 원인과 다음 행동을 표시한다.
- 결과 요약에 부분 결과임과 문제 파일 수를 표시하고 해당 파일로 이동할 수 있게 한다.
- **BREAKING**: 커밋을 독립 적용할 수 없을 때 계산이 실패하지 않고 부분 결과를
  제공한다. 기존 `COMMIT_APPLY_CONFLICT` 실패 흐름이 부분 결과로 바뀐다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `composite-diff-generation`: 충돌 시 부분 결과를 계산하고 문제 파일을 함께
  제공하는 요구사항으로 바뀐다
- `desktop-composite-diff-review`: 부분 결과 상태와 문제 파일 표시 요구사항이
  추가된다
- `changed-file-view-toggle`: 변경 파일 목록이 문제 상태를 함께 표현한다

## Impact

- `src/composition/composite-diff-service.ts`의 커밋 적용과 결과 수집
- `src/composition/composite-diff-coordinator.ts`의 상태 표현
- `src/desktop/shared/desktop-api.ts`의 결과 계약
- `src/desktop/renderer`의 변경 파일 목록, diff 영역과 결과 요약
- 코어 유닛·통합 테스트, renderer 테스트와 Playwright Electron 흐름
- 이슈 #16과 README의 지원 범위
