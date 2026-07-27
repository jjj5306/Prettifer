## Why

현재 데스크톱 앱은 저장소 선택부터 커밋, 변경 파일과 diff 검토로 이어지는
흐름을 사용자가 빠르게 이해하고 안정적으로 완료하기 어렵다. 이슈 #11의 새
목업과 색상 기준을 바탕으로 실제 Git 검토 작업에 사용할 수 있는 데스크톱
워크벤치를 정의한다.

## What Changes

- graphite 계열 색상과 보라색 강조색을 일관된 데스크톱 UI 기준으로 적용한다.
- 사용자에게 보이는 기본 화면 문구를 영어로 제공한다.
- 저장소 열기, 비교 범위 선택, 커밋 선택, 결과 계산, 변경 파일과 좌우 diff
  검토가 한 작업 흐름으로 이어지게 한다.
- `Changed Files` 패널에서 Tree View와 List View를 전환할 수 있게 한다.
- 보기 전환 뒤 선택 파일, 파일 상태와 현재 diff 맥락을 유지한다.
- 로딩, 빈 결과, 취소, 오류와 복구 행동을 작업 맥락 안에서 제공한다.
- 키보드 탐색, 보이는 포커스와 화면 확대 환경을 지원한다.
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
