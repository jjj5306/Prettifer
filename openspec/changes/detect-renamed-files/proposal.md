## Why

이름이 바뀐 파일은 이전 경로의 삭제와 새 경로의 추가로 나뉘어 나온다. 같은 파일의 경로 변경과
내용 변경이 목록의 서로 다른 두 줄에 흩어지고, 두 줄이 같은 파일이라는 사실은 화면에 없다. 파일을
옮긴 변경에서는 사용자가 삭제와 추가를 눈으로 짝지어야 한다.

이름 변경은 Git이 이미 판정할 수 있다. 통합 결과를 만들 때 그 판정을 쓰지 않기로 했던 것이 초기
코어의 비목표였고, 지금은 그 판정이 없어서 생기는 비용이 더 크다.

## What Changes

- 통합 결과가 이름이 바뀐 파일을 하나의 변경으로 식별한다.
- 그 변경은 이전 경로, 현재 경로와 Git이 일치시킨 비율을 함께 제공한다.
- 경로 변경과 내용 변경이 하나의 diff로 나온다.
- 변경 파일 목록이 추가, 수정, 삭제와 구분되는 이름 변경 상태를 표시한다.
- 이름 변경으로 판정할 수 없는 파일은 지금처럼 추가와 삭제로 나온다.
- 판정에 쓴 기준을 Git 설정이 아니라 명령에 적어, 같은 입력이 같은 결과를 낸다.

## Capabilities

### Modified Capabilities

- `composite-diff-generation`: 통합 결과의 파일 상태에 이름 변경이 더해지고, 그 판정 기준이
  요구사항으로 정해진다.
- `desktop-composite-diff-review`: 변경 파일 목록과 검토 화면이 이름 변경을 표시한다.
- `base-file-tree`: 저장소 전체 구조에서 이름이 바뀐 파일이 어디에 놓이는지 정해진다.

## Impact

- `src/composition/composite-diff-service.ts`: 이름 변경 판정, 상태와 이전 경로
- `src/desktop/shared/desktop-api.ts`: 이름 변경 상태를 담는 계약
- `src/desktop/renderer/files/FileButton.tsx`: 목록의 이름 변경 표시
- `src/desktop/renderer/files/full-tree.ts`: 전체 구조에서 이전 경로 처리
- `src/desktop/renderer/diff/DiffPane.tsx`: 검토 화면의 두 경로 표시
- 선택 커밋의 변경 경로를 모으는 단계는 바뀌지 않는다. 그 단계는 이름 변경을 해석하지 않아야
  이전 경로와 새 경로가 모두 checkout된다
