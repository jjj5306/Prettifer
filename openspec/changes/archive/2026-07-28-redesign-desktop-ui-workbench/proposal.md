## Why

현재 데스크톱 앱은 저장소 선택부터 커밋, 변경 파일과 diff 검토로 이어지는
흐름을 사용자가 빠르게 이해하고 안정적으로 완료하기 어렵다. 이슈 #11의 새
목업과 색상 기준을 바탕으로 실제 Git 검토 작업에 사용할 수 있는 데스크톱
워크벤치를 정의한다.

## What Changes

- graphite 계열 색상과 보라색 강조색을 일관된 데스크톱 UI 기준으로 적용한다.
- Hanken Grotesk UI 글꼴과 Geist 코드 글꼴을 앱에 포함해 동일한 타이포그래피를 제공한다.
- 목업의 좌측 activity rail을 제공하고 현재 검토 단계로 빠르게 이동할 수 있게 한다.
- 사용자에게 보이는 기본 화면 문구를 영어로 제공한다.
- 저장소 열기, 비교 범위 선택, 커밋 선택, 결과 계산, 변경 파일과 좌우 diff
  검토가 한 작업 흐름으로 이어지게 한다.
- 선택 가능한 커밋 카드는 체크박스와 카드 본문에서 동일하게 다중 선택된다.
- 대형 저장소에서도 선택 커밋이 변경하는 파일만 준비해 결과 계산 시간을 줄인다.
- 독립 적용할 수 없는 커밋에는 필요한 이전 커밋을 함께 선택하는 복구 안내를 제공한다.
- `Changed Files` 패널에서 Tree View와 List View를 전환할 수 있게 한다.
- 보기 전환 뒤 선택 파일, 파일 상태와 현재 diff 맥락을 유지한다.
- 로딩, 빈 결과, 취소, 오류와 복구 행동을 작업 맥락 안에서 제공한다.
- 키보드 탐색, 보이는 포커스와 화면 확대 환경을 지원한다.
- activity rail을 앱의 전체 높이 메뉴 영역으로 제공하고 사용자가 선택한 메뉴를 유지한다.
- Commit History를 가장 오래된 커밋부터 최신 커밋 순서로 표시한다.
- 상단 작업 영역을 압축하고 1280×720 화면에서 변경 파일과 diff 영역을 화면 높이의 70% 이상으로 표시한다.
- diff 편집기가 diff 검토 영역의 남는 높이를 모두 채우게 한다.
- Tree View의 폴더를 접고 펼 수 있게 하고 계층선을 각 행의 가로 연결선으로 끝낸다.
- Tree View에서 하위 폴더가 하나뿐인 경로를 한 행으로 합쳐 들여쓰기가 쌓이지 않게 한다.
- 새로 추가된 파일은 기준 내용 없이 전체 내용을 추가된 상태로 표시한다.
- 앱 바, 저장소 범위, Commit History와 Selected Result의 세로 길이를 하나의 값으로 통일하고
  커밋 카드를 한 줄로 압축한다.
- 주요 흐름과 두 파일 보기를 React 및 Playwright Electron 테스트로 검증한다.

## Capabilities

### New Capabilities

- `desktop-review-workbench`: 저장소를 열고 커밋, 변경 파일과 통합 diff를
  탐색하는 데스크톱 작업 흐름, 시각 상태와 접근성 요구사항
- `changed-file-view-toggle`: 변경 파일을 Tree View와 List View로 전환하고
  선택 및 diff 맥락을 보존하는 요구사항

### Modified Capabilities

없음.

## Impact

- Electron renderer의 화면 구성, 상태 관리, 스타일과 접근성 동작
- preload가 제공하는 기존 저장소 및 비교 기능의 renderer 연결
- React 컴포넌트 테스트와 Playwright Electron 전체 흐름
- README의 Tree View 및 List View 목업
- 이슈 #11과 후속 데스크톱 사용 문서
