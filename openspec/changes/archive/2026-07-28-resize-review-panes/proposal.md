## Why

검토 작업대의 `Changed Files`와 diff 영역은 폭이 고정되어 있다. 저장소마다
경로 길이와 코드 폭이 달라서, 긴 경로를 확인하려면 파일 이름이 잘리고 코드를
넓게 보려면 파일 목록이 공간을 낭비한다. 사용자가 지금 무엇을 보고 있는지에
따라 두 영역의 폭을 직접 정할 수 있어야 한다.

## What Changes

- `Changed Files`와 diff 영역 사이에 폭을 조절하는 구분자를 제공한다.
- 구분자를 마우스로 끌어 두 영역의 폭을 바꿀 수 있게 한다.
- 구분자를 키보드로도 조작할 수 있게 하고 현재 폭을 보조 기술에 알린다.
- 두 영역 모두 사용할 수 있는 최소 폭을 보장해 어느 한쪽이 사라지지 않게 한다.
- diff 안의 기준 파일과 선택 결과 사이 구분자도 끌어서 조절할 수 있게 한다.
- 조절한 폭은 파일 선택, 보기 전환과 결과 다시 계산 뒤에도 유지한다.

## Capabilities

### New Capabilities

- `review-pane-resizing`: 검토 작업대에서 `Changed Files`와 diff 영역의 폭을
  사용자가 직접 조절하고 유지하는 요구사항

### Modified Capabilities

없음.

## Impact

- Electron renderer의 검토 영역 레이아웃과 구분자 조작 상태
- `Changed Files` 패널과 diff 패널의 폭 계산 및 최소 폭 규칙
- Monaco diff 편집기의 좌우 분할 조절 설정
- React 컴포넌트 테스트와 Playwright Electron 전체 흐름
- 이슈 #11과 데스크톱 사용 문서
