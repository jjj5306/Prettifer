## Why

`Load 100 older commits`를 몇 번 누르면 Commit History에 수백 개가 쌓인다. 되돌릴 방법이 없어서
목록을 다시 짧게 만들려면 비교 범위를 처음부터 다시 불러야 하고, 그러면 선택까지 사라진다.

선택도 마찬가지다. 여러 커밋을 고른 뒤 처음부터 다시 고르려면 체크를 하나씩 되돌려야 한다.

## What Changes

- Commit History에서 불러온 커밋을 첫 페이지 상태로 되돌리는 초기화를 제공한다.
- Commit History에서 커밋 선택을 한 번에 비우는 초기화를 제공한다.
- 두 초기화는 서로의 상태를 건드리지 않는다. 목록을 줄여도 선택은 남고, 선택을 비워도 목록은 그대로다.
- 되돌릴 것이 없으면 해당 초기화를 화면에 두지 않는다.
- 초기화 뒤에도 `Load 100 older commits`로 다시 불러올 수 있다.

## Capabilities

### New Capabilities

없음. 이미 정의된 커밋 목록과 선택 동작에 되돌리기를 더한다.

### Modified Capabilities

- `desktop-repository-navigation`: 선형 커밋 흐름 탐색에 불러온 커밋 초기화가, 합성 선택에 선택
  초기화가 더해진다.

## Impact

- `src/desktop/renderer/state/app-state.ts`: 두 초기화 동작과 첫 페이지 경계 보관
- `src/desktop/renderer/controller/use-app-controller.ts`: 초기화 실행
- `src/desktop/renderer/history/CommitHistoryPane.tsx`: 두 초기화 컨트롤
- 저장소를 읽지 않는다. 초기화는 이미 받아 둔 자료만 다룬다
