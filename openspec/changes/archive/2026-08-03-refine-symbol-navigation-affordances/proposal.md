## Why

심볼 탐색(이슈 #12)을 실제로 써 보면 세 가지가 걸린다.

1. 검토 화면 머리글은 좌우 배치 설명을 보여준다. 몇 번 보면 알게 되는 내용이고, 정작 필요한
   **지금 어떤 파일을 보고 있는지**는 편집기의 접근성 이름에만 있다. 심볼을 타고 파일 사이를
   오가면 현재 파일이 계속 바뀌므로 화면에 있어야 한다.
2. Ctrl+Click으로 이동할 수 있다는 것을 화면에서 알 수 없다. 기능이 있어도 발견되지 않는다.
3. 이동 후 커서가 줄 맨앞에 놓인다. 멤버 선언으로 이동했을 때 그 줄의 어디를 봐야 하는지,
   애초에 이동이 일어났는지도 눈에 띄지 않는다.

## What Changes

- 검토 화면 머리글에 현재 검토 중인 파일 경로를 표시하고, 좌우 배치 설명을 뺀다.
- Ctrl(또는 Cmd)을 누른 채 식별자 위에 있으면 그 식별자에 링크 표시(밑줄과 링크 커서)를 준다.
  Ctrl을 떼거나 식별자를 벗어나면 지운다.
- 정의로 이동하면 커서를 선언 줄의 **심볼 위치(열)** 에 두고, 도착한 줄을 눈에 보이게 표시한다.

## Capabilities

### Modified Capabilities

- `diff-symbol-navigation`: 이동 도착 지점의 정확도(열)와 도착 표시, Ctrl 링크 표시를 요구사항에
  추가한다.
- `desktop-composite-diff-review`: 파일 검토 화면 머리글이 표시하는 내용을 현재 파일 경로로
  바꾼다.

### New Capabilities

없음.

## Impact

- `src/desktop/renderer/diff/DiffPane.tsx`: 머리글 표시 내용, 이동 위치 전달
- `src/desktop/renderer/diff/MonacoDiffAdapter.ts`: 링크 표시, 열 단위 이동, 도착 줄 표시
- `src/desktop/renderer/diff/DiffPane.module.css`: 링크와 도착 줄 스타일
- `src/desktop/renderer/state/app-state.ts`: 이동 위치에 열 추가
- `src/desktop/renderer/controller/use-app-controller.ts`: 선언 줄에서 심볼 열 계산
- `test/`: 유닛과 e2e 검증, 기존 설명 문구 단정 갱신
