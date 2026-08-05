## Why

merge commit의 기준 부모 선택이 `1: ce481fa`, `2: dd11a57`로 표시된다. `1`과 `2`는 Git이 부모를
기록한 순서일 뿐이다. 사용자가 답해야 하는 질문은 "어느 쪽이 내가 보려는 변경인가"이고, 번호는
그 질문에 답하지 않는다.

부모 1은 항상 병합받은 쪽이고 부모 2 이후는 병합해 들여온 쪽이다. 이 사실이 화면에 없어서, 지금은
짧은 SHA를 저장소에서 따로 조회해야 어느 쪽인지 알 수 있다.

## What Changes

- 부모 항목에 그 부모가 어느 쪽인지와 그 부모 커밋의 제목을 함께 표시한다.
- 화면에서 부모 번호를 걷어낸다. 번호는 계산에 넘기는 값으로만 남는다.
- 선택한 부모를 알리는 접근성 문구도 번호 대신 어느 쪽인지로 표현한다.
- merge commit의 부모 커밋 제목을 읽어 화면까지 전달한다.
- merge가 아닌 커밋의 부모 제목은 읽지 않는다.

## Capabilities

### Modified Capabilities

- `desktop-repository-navigation`: merge commit의 기준 부모 선택이 어떻게 읽히는지가 정해진다.
  merge 행이 선택할 수 없다고 안내하던 낡은 시나리오도 함께 고친다.
- `desktop-composite-diff-review`: 통합 결과가 표시하는 기준 부모도 순서 번호를 쓰지 않는다.

## Impact

- `src/history/repository-history-service.ts`: merge 부모의 제목을 읽고 커밋에 담기
- `src/desktop/shared/desktop-api.ts`: `parentIds`를 부모 목록으로 대체
- `src/desktop/main/desktop-request-handlers.ts`: 부모 목록 전달
- `src/desktop/renderer/history/CommitHistoryPane.tsx`: 부모 항목 문구와 접근성 문구
- `src/desktop/renderer/composition/CompositeResultHeader.tsx`: 결과에 표시하는 기준 부모 문구
- `src/desktop/renderer/state/app-state.ts`: 부모 번호 범위 검사가 새 목록을 사용
- merge가 있는 페이지에만 Git 읽기가 한 번 늘어난다
