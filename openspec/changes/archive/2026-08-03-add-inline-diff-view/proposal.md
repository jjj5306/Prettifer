## Why

diff 검토는 기준과 결과를 좌우로 놓는 방식만 제공한다. 화면이 좁거나 한 줄이 긴 코드에서는 좌우
분할이 각 쪽의 폭을 절반으로 줄여 가로 스크롤이 잦아진다. 세로로 긴 모니터나 줄이 긴 언어에서는
삭제와 추가를 위아래로 이어 보는 편이 읽기 좋다.

읽기 좋은 방식은 파일마다 다르므로, 한쪽을 고르는 것이 아니라 사용자가 전환할 수 있어야 한다.

## What Changes

- diff 영역에 좌우 보기와 세로(인라인) 보기를 전환하는 토글을 둔다.
- 세로 보기는 삭제된 줄과 추가된 줄을 하나의 흐름으로 잇는다.
- 전환은 편집기를 다시 만들지 않고 옵션만 갱신하므로, 보고 있던 위치와 선택 파일이 유지되고 새
  계산이나 Git 요청이 일어나지 않는다.
- 비교할 기준이 없는 표시(추가된 파일, 선택 결과 밖 파일, 문제 파일, 바이너리)에서는 토글을 두지
  않는다. 그 화면들은 두 보기에서 같은 내용이다.

## Capabilities

### New Capabilities

- `diff-view-mode`: 파일 검토 화면에서 좌우 보기와 세로 보기를 전환하는 동작

### Modified Capabilities

없음. 읽기 전용 파일 검토가 무엇을 보여 주는지는 그대로이고, 어떻게 배치하는지에 선택이 생긴다.

## Impact

- `src/desktop/renderer/diff/MonacoDiffAdapter.ts`: 초기 옵션과 옵션 갱신
- `src/desktop/renderer/diff/DiffPane.tsx`: 토글과 현재 보기
- `src/desktop/renderer/diff/DiffPane.module.css`: 토글 스타일
- `test/`: 어댑터, 화면, e2e 검증
