## Why

Activity Rail은 아이콘과 짧은 이름만 제공하고 현재 화면 안에서 바로 접근할 수 있는 Commit History, Changed Files와 Diff Review까지 중복 진입점으로 노출한다. 사용자가 실제로 화면을 전환하거나 별도 설정을 여는 Repository, File History와 Group Rules만 남기고 목적과 사용 조건을 조작 전에 설명해야 한다.

## What Changes

- Activity Rail을 Repository, File History와 Group Rules 세 버튼으로 단순화한다.
- 기존 Commit History 위치의 두 번째 버튼은 Changed Files에서 선택한 파일의 File History를 연다.
- Commit History, Changed Files와 Diff Review 전용 이동 버튼을 제거한다.
- File History는 선택 파일의 커밋 이력과 선택 커밋의 변경 내용을 전용 전체 폭 화면으로 제공한다.
- File History는 비교 범위의 선택 결과가 준비되고 Changed Files에서 파일이 선택된 때 사용할 수 있다.
- 남은 Activity Rail 버튼에 화면에서 읽을 수 있는 이름과 동작 설명을 제공한다.
- 마우스 호버와 키보드 포커스에서 같은 도움말을 표시한다.
- 비활성 버튼의 도움말에는 필요한 선행 조건을 함께 안내한다.
- 도움말을 버튼의 접근 가능한 설명과 연결한다.
- Activity Rail 밖의 기존 Commit History, Changed Files와 Diff Review 화면 동작은 변경하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `desktop-review-workbench`: Activity Rail을 실제 화면 전환 진입점으로 단순화하고 남은 항목이 호버와 키보드 포커스에서 목적 및 사용 조건을 설명하도록 요구사항을 확장한다.

## Impact

- GitHub 이슈 #96
- Activity Rail renderer 컴포넌트와 File History 전용 탐색 화면
- 선택 파일의 이력 조회 상태와 renderer controller
- Activity Rail 단위·접근성 테스트와 Electron 사용자 흐름
- 외부 API와 의존성 변경 없음
