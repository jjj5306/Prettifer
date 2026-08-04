## Why

Activity rail 항목을 실행하면 대상 영역으로 키보드 포커스가 이동한다. 마우스로 클릭하면 화면에서
달라지는 것이 레일의 강조 막대뿐이어서, 어디로 이동했는지 알 수 없다. 영역 외곽선은
`:focus-visible`에 걸려 있고 마우스 클릭은 그 판정을 받지 못하기 때문이다.

그래서 마우스 사용자에게는 Repository, Commit History, Changed Files, Diff Review 항목이 아무
동작도 하지 않는 버튼처럼 보인다. 레일이 가리키는 영역을 입력 장치와 무관하게 알 수 있어야 한다.

## What Changes

- 레일의 현재 항목이 가리키는 검토 영역을 현재 영역으로 표시한다.
- 표시는 마우스와 키보드에서 동일하며, 포커스가 다른 곳으로 옮겨가도 유지된다.
- 레일의 현재 항목 표시와 영역 표시는 항상 같은 영역을 가리킨다.
- 선택 결과가 사라져 현재 항목이 되돌아가면 영역 표시도 함께 이동한다.
- 고대비 모드에서도 표시를 구분할 수 있게 한다.

## Capabilities

### New Capabilities

없음. 레일이 이미 정의한 이동 동작에 화면 표시를 더한다.

### Modified Capabilities

- `desktop-review-workbench`: activity rail 요구사항에 현재 영역 표시가 더해진다. 이동 결과를
  포커스에만 의존하지 않고 화면으로도 제공한다.

## Impact

- `src/desktop/renderer/PanelSurface.module.css`: 현재 영역 표시 스타일
- `src/desktop/renderer/DesktopWorkspace.tsx`: 현재 영역을 각 패널에 전달
- `src/desktop/renderer/repository/`, `history/`, `files/`, `diff/`: 패널 루트의 표시 적용
- 사용자 branch, HEAD와 작업 트리는 변경하지 않는다. Git 요청을 발생시키지 않는다
