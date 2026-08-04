## Why

`Changed Files`는 선택 결과가 건드린 파일만 보여 준다. 변경이 프로젝트 구조의 어디에서 일어났는지,
그 옆에 어떤 파일이 함께 있는지는 알 수 없다. 검토자는 변경 위치를 파악하려고 IDE를 따로 연다.

저장소 전체 파일 구조를 그대로 펼치고 그 안에서 변경 파일을 구분하는 Full Tree 보기를 더한다.

## What Changes

- `Changed Files` 보기 토글에 Full Tree를 추가한다. Tree View, List View와 Config View는 그대로 둔다.
- 비교 기준 시점의 추적 파일 전체를 폴더 계층으로 표시한다.
- 각 파일을 추가, 수정, 삭제와 변경 없음으로 구분한다.
- 변경 파일을 품은 폴더를 구분해, 접힌 상태에서도 그 안에 변경이 있음을 알 수 있게 한다.
- 변경되지 않은 파일을 선택하면 비교 기준 시점의 내용을 읽기 전용 문서로 표시한다.
- 전체 경로 목록은 Full Tree를 처음 열 때 비교 범위당 한 번 조회하고, 결과를 다시 계산해도 다시
  조회하지 않는다.
- 경로 수가 상한을 넘는 저장소에서는 표시할 수 있는 범위와 넘친 사실을 함께 알린다.
- Tree View의 폴더 접기와 폭 조절, 보기 전환 뒤 선택 파일과 현재 diff 유지는 그대로 지킨다.
- 폴더 이동, 접기와 파일 선택을 키보드만으로 할 수 있게 한다.

## Capabilities

### New Capabilities

- `base-file-tree`: 비교 기준 시점의 추적 파일 전체를 조회해 계층으로 표시하고, 그 안에서 변경
  파일과 변경 없는 파일을 구분해 검토하는 동작

### Modified Capabilities

- `changed-file-view-toggle`: 보기 전환이 세 가지에서 Full Tree를 포함한 네 가지로 늘어난다.
  선택 맥락 보존과 접근 가능한 보기 토글이 네 보기 모두에 적용된다. 동일한 파일 상태 표현은
  변경 파일에 대해서만 유지되며, Full Tree는 변경 없는 파일을 더 보여 준다.
- `desktop-composite-diff-review`: 읽기 전용 파일 검토에 변경되지 않은 파일의 표시가 더해진다.

## Impact

- `src/git/` 또는 `src/symbols/`: 비교 기준 커밋의 추적 경로 목록 조회
- `src/desktop/shared/`, `src/desktop/preload/`, `src/desktop/main/`: 경로 목록 조회 계약
- `src/desktop/renderer/files/`: Full Tree 표시와 상태 구분
- `src/desktop/renderer/state/`, `controller/`: 경로 목록 상태와 조회 시점
- 기존 `readBaseFile` 계약과 결과 밖 파일 표시 경로를 그대로 재사용한다
- 사용자 branch, HEAD와 작업 트리는 변경하지 않는다. 커밋만 읽는다
