## Why

`Side-by-side Diff`는 변경 내용을 읽기 전용으로 보여주지만 코드 사이를 이동할 수 없다. 변경된
함수가 어디에 정의되어 있고 어디에서 호출되는지 확인하려면 IDE를 따로 열어야 한다. 검토 흐름이
끊기고 변경의 영향 범위를 판단하기 어렵다.

## What Changes

- 변경 파일의 심볼에서 정의 위치로 이동한다. Ctrl+Click과 F12를 지원한다.
- 같은 심볼의 참조와 호출부 목록을 표시하고, 항목을 선택해 이동한다. Shift+F12를 지원한다.
- 이동 결과가 다른 파일이면 그 파일을 검토 영역에서 연다.
- 이동 전 위치로 돌아가는 뒤로 가기를 제공한다.
- 후보가 여러 개면 목록으로 보여주고 사용자가 고른다.
- 정의를 찾지 못하거나 지원하지 않는 언어이거나 검색이 실패하면 원인과 다음 행동을 표시한다.
- 심볼 검색 대상 언어에 Java와 C/C++를 포함하고, 두 언어의 구문 강조를 함께 추가한다.

## Capabilities

### New Capabilities

- `diff-symbol-navigation`: 검토 화면에서 심볼의 정의와 참조로 이동하고 되돌아오는 동작

### Modified Capabilities

없음. 기존 검토 화면의 파일 표시와 diff 동작은 그대로다.

## Impact

- `src/symbols/`: 언어 판별, 커서 위치 심볼 추출, 선언 인식, 출현 위치 추출 (순수 모듈)
- `src/desktop/main/`: 저장소 전역 검색 경계
- `src/desktop/shared/`, `src/desktop/preload/`: 심볼 검색 계약
- `src/desktop/renderer/`: Monaco 제공자, 이동 이력, 후보 목록과 진단
- `build/webpack.renderer.config.cjs`: Java·C/C++ 구문 강조 추가
- 사용자 branch, HEAD와 작업 트리는 변경하지 않는다
