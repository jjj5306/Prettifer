## Why

파일별 커밋 이력을 여는 버튼은 Activity Rail에 있고, 이력의 대상이 되는 파일은 `Changed Files`에서 고른다. 고르는 곳과 여는 곳이 화면 양쪽으로 떨어져 있어 방금 선택한 파일과 버튼을 눈으로 이어 붙여야 한다. 이력을 열면 검토 영역 전체가 이력 화면으로 바뀌어 `Changed Files` 목록도 함께 사라지므로, 이력을 보다가 다른 파일로 옮기려면 먼저 결과로 돌아와야 한다.

Activity Rail의 File History와 Group Rules는 모두 `Changed Files`에서 고른 대상을 다루는 동작이고, Group Rules는 Config View 안에서도 열 수 있다. 레일은 실제로 옮겨 갈 곳이 있는 진입점만 두는 편이 읽기 쉽다.

화면 문구와 아이콘에도 겹치는 곳이 있다. diff 검토 화면 제목 `Side-by-side Diff`는 좌우 배치라는 구현 방식을 제목으로 쓰고, 그 배치는 바로 옆 보기 토글이 이미 나타낸다. `Changed Files` 보기 토글의 Config View와 Full Tree는 같은 아이콘을 써서 누르기 전에는 구분되지 않는다.

## What Changes

- 선택 파일의 커밋 이력을 여는 컨트롤을 `Changed Files` 머리글의 보기 토글 옆으로 옮긴다.
- 파일 커밋 이력과 선택 커밋의 변경 내용을 diff 검토 영역에 표시하고, `Changed Files` 목록은 계속 표시한다.
- 커밋 변경 내용에서 파일 이력으로, 파일 이력에서 선택 결과 diff로 돌아가는 경로를 제공한다.
- Activity Rail을 Repository와 About Prettifer 두 항목으로 정리하고 File History, Group Rules 항목을 제거한다.
- 앱 이름, 버전, 한 줄 소개와 저장소 주소를 표시하는 About Prettifer 화면을 추가한다.
- diff 검토 화면 제목을 `Differentia Codicis`로 바꾼다.
- Config View와 Full Tree 보기 토글에 서로 구분되는 아이콘을 적용한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `desktop-review-workbench`: Activity Rail을 Repository와 About Prettifer 두 진입점으로 정리하고, Prettifer 소개 화면 요구사항을 추가한다.
- `file-history`: 이력 진입점을 `Changed Files` 머리글로 옮기고, 이력과 커밋 변경 내용을 검토 영역에서 보는 동안 변경 파일 목록이 유지되도록 요구사항을 고친다.
- `changed-file-view-toggle`: 네 보기 토글이 서로 구분되는 아이콘을 표시하도록 요구사항을 확장한다.
- `desktop-composite-diff-review`: diff 검토 화면 제목을 요구사항에 반영한다.

## Impact

- GitHub 이슈 #99
- Activity Rail, `Changed Files` 머리글과 diff 검토 화면 renderer 컴포넌트
- 파일 이력 화면 상태와 renderer controller
- 앱 버전을 읽는 main 프로세스 요청과 preload 계약
- Activity Rail, 변경 파일, 파일 이력 단위·접근성 테스트와 Electron 사용자 흐름
- 외부 의존성 변경 없음
