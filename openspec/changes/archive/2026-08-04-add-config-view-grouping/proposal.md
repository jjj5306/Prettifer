## Why

`Changed Files`의 Tree View와 List View는 저장소의 디렉터리 구조를 그대로 따라간다. "이번 변경에서
테스트가 얼마나 늘었나", "설정 파일만 먼저 보자"처럼 검토 목적에 맞춰 변경을 묶어 보는 방법이 없다.

저장소마다 경로 규칙이 다르다. 어떤 저장소는 `tests/`, 어떤 저장소는 `src/test/java/`가 테스트다.
내장 규칙 하나로는 맞출 수 없으므로 사용자가 자기 저장소의 경로 prefix와 그룹 이름을 직접 정의하고,
그 규칙대로 변경 파일을 묶어 보는 Config View가 필요하다.

## What Changes

- `Changed Files` 보기 토글에 Config View를 추가한다. 기존 Tree View와 List View는 그대로 둔다.
- 사용자가 경로 prefix와 그룹 이름을 짝지은 규칙을 작성, 수정, 삭제하고 표시 순서를 정한다.
- Config View는 규칙 순서대로 그룹을 표시하고, 각 그룹에 속한 변경 파일을 보여 준다.
- 한 경로가 여러 규칙에 걸리면 가장 긴 prefix의 규칙을 적용하고, 파일마다 적용된 규칙을 확인할 수 있다.
- 어떤 규칙에도 걸리지 않은 파일은 별도 그룹에 남겨 전체 변경 파일 수를 보존한다.
- 잘못된 규칙은 조용히 무시하지 않고 원인과 다음 행동을 표시하며, 나머지 규칙으로 그룹화는 계속한다.
- 규칙은 저장소별로 분리해 보관하고, 앱을 다시 실행해도 복원한다.
- 규칙이 하나도 없으면 Config View에서 규칙을 만드는 방법을 안내한다.
- 그룹을 접고 펼 수 있고, 보기 전환과 그룹 이동, 파일 선택을 키보드만으로 할 수 있다.
- activity rail에 Group Rules 항목을 추가해 어느 보기에서든 규칙 편집으로 바로 이동한다.
- 보기를 전환해도 선택 파일과 현재 diff를 유지하며 결과를 다시 계산하지 않는다.

## Capabilities

### New Capabilities

- `changed-file-grouping`: 사용자가 정의한 경로 prefix 규칙으로 변경 파일을 그룹으로 묶어 보고,
  그 규칙을 저장소별로 관리하고 보관하는 동작

### Modified Capabilities

- `changed-file-view-toggle`: 보기 전환이 Tree View와 List View 두 가지에서 Config View를 포함한
  세 가지로 늘어난다. 선택 맥락 보존, 동일한 파일 상태 표현, 접근 가능한 보기 토글과 빈 결과 표시가
  세 보기 모두에 적용된다.
- `desktop-review-workbench`: activity rail의 이동 대상에 그룹 규칙 편집이 더해진다. 결과가 없을 때
  사용할 수 없는 항목의 범위도 함께 늘어난다.

## Impact

- `src/desktop/renderer/files/`: Config View 표시, 그룹 접기와 펼치기, 규칙 편집 화면
- `src/desktop/renderer/navigation/`: activity rail의 그룹 규칙 항목
- `src/desktop/renderer/state/`: 보기 선택과 규칙 상태
- `src/desktop/shared/`, `src/desktop/preload/`: 규칙 읽기와 저장 계약
- `src/desktop/main/`: 저장소별 규칙 보관 경계
- 규칙은 사용자 저장소 밖에 보관한다. 사용자 branch, HEAD와 작업 트리는 변경하지 않는다
- 검토 대상 저장소를 읽지 않는다. Config View 전환은 Git 요청을 발생시키지 않는다
