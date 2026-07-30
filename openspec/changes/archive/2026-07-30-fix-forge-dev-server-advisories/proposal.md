## Why

`npm audit`이 `webpack-dev-server` 경로에서 moderate 등급 권고 6건을 보고한다. 개발 서버를
띄운 상태에서 악성 사이트를 방문하면 소스가 노출될 수 있는 부류다. 배포 패키지에는 포함되지
않지만, 개발자가 매일 실행하는 경로이고 경고가 계속 쌓이면 audit 출력 자체를 무시하게 된다.

Electron Forge는 최신 버전(7.11.2)에서도 `webpack-dev-server: ^4.0.0`을 선언한다. 반면 이
권고들은 모두 5.2.5 이하가 취약하다. 즉 Forge가 선언한 범위 안에는 안전한 버전이 없다.

## What Changes

제품 동작과 화면은 바뀌지 않는다. 개발 도구 의존성만 바꾼다.

- `webpack-dev-server`를 권고가 해소된 버전으로 고정한다.
- 채택한 버전 조합이 개발 실행, 패키징과 릴리스 산출물 생성에서 동작함을 검증한다.
- 채택 근거와 다음 사람이 재확인·갱신할 절차를 개발 문서에 남긴다.

이번 범위에 넣지 않는 것이 하나 있다. `brace-expansion` 권고(high 1건)는 이슈 #9 이후에
유입된 별개 문제이고, 지금은 지원되는 해법이 없다. 이슈 #44로 분리했다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

없음. 사용자가 관찰하는 동작이 바뀌지 않는 개발 의존성 변경이므로 메인 스펙은 변경하지
않는다. 검증 기준은 audit 결과와 개발·패키징·릴리스 경로의 실제 동작이다.

## Impact

- `package.json`, `package-lock.json`: `webpack-dev-server` 고정
- `README.md`: 채택한 버전 조합과 재확인 절차
- 제품 코드(`src/`), CSP, preload 경계, Electron fuse 설정은 변경하지 않는다
- 배포 산출물의 실행 코드에는 영향이 없다(개발 전용 의존성)
