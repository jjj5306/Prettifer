## Why

정의 탐색이 텍스트 기반이라는 것은 설계상 받아들인 제약이다. 그러나 지금은 그 제약보다 낮은
정확도를 보인다.

Java 41개 줄로 실측하면 **37/41**이다. 거짓 양성은 없고, 애너테이션이 앞에 오는 선언과 수정자가
없는 필드·지역 변수를 놓친다.

더 큰 문제는 구분해 주지 않는 것이다. `UtVar`를 Ctrl+Click하면 클래스 선언과 생성자 셋이 모두
`def` 하나로 나온다. 무엇이 형 선언이고 무엇이 생성자인지 목록만 보고 알 수 없으며, 후보가 여러
개라 바로 이동하지도 않는다.

실제로는 **사용자가 누른 자리**가 원하는 대상을 거의 결정한다. `new UtVar(...)`의 이름을 눌렀다면
생성자를 원하고, `UtVar counter`의 이름을 눌렀다면 형 선언을 원한다. 그 정보를 쓰지 않고 있다.

## What Changes

- 선언을 **종류**로 판정한다. 형(class/interface/enum/record), 생성자, 메서드, 필드, 지역 변수,
  매크로, 별칭(typedef/type)을 구분한다.
- 후보 목록이 종류를 표시한다. `def` 하나로 뭉치지 않는다.
- 누른 자리의 맥락을 쓴다. `new` 뒤의 이름이면 생성자를, 그 밖에는 형 선언을 우선한다. 가장
  우선하는 종류의 후보가 하나면 바로 이동하고, 여러 개면 목록으로 남긴다.
- 놓치던 네 가지 패턴(애너테이션 접두, 수정자 없는 필드, 지역 변수)을 고친다. 거짓 양성이 늘지
  않음을 실측 코퍼스로 고정한다.

## Capabilities

### Modified Capabilities

- `diff-symbol-navigation`: 선언 판정에 종류를 도입하고, 후보 표시와 정의 이동 우선순위에 종류와
  누른 자리의 맥락을 반영한다.

### New Capabilities

없음.

## Impact

- `src/symbols/declarations.ts`: 종류 판정으로 확장, Java·C/C++·TypeScript 패턴 보강
- `src/symbols/symbol-search.ts`: 검색 결과가 `isDeclaration` 대신 종류를 싣는다
- `src/desktop/shared/desktop-api.ts`: 경계 계약의 심볼 항목에 종류
- `src/desktop/renderer/`: 이동 우선순위, 목록 표시, 누른 자리의 맥락 전달
- `test/`: Java 코퍼스, 우선순위와 표시 검증
