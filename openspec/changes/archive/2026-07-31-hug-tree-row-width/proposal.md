## Why

Tree View에서 Changed Files 영역을 넓히면 각 행이 영역 너비만큼 늘어난다. 파일 하나를 담은
행이 글자 길이와 무관하게 패널 전체를 차지해서, 계층 구조가 개요가 아니라 전체 너비 막대가
쌓인 모습으로 보인다. 들여쓰기와 안내선으로 계층을 읽게 하려면 행이 자기 내용만큼만 차지해야
한다.

## What Changes

- Tree View의 파일·폴더 행이 자기 내용 너비만큼만 차지한다.
- 이름이 길어 패널을 넘길 때는 기존처럼 패널 안에서 잘림 표시를 유지한다.
- List View의 전체 너비 행은 바꾸지 않는다. 그 보기에는 계층이 없다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `changed-file-view-toggle`: Tree View 행의 너비 동작을 요구사항으로 추가한다.

## Impact

- `src/desktop/renderer/files/ChangedFilePane.module.css`
- `test/e2e/desktop-flow.e2e.ts`: 폭 회귀 검증
- 파일 목록 자료, 상태와 계약은 변경하지 않는다
