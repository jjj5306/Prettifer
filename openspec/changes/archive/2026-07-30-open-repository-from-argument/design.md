## Context

저장소는 지금 한 경로로만 열린다. renderer가 `selectRepository`를 호출하면 main이 폴더
대화상자를 띄우고, 고른 경로를 `RepositorySessionManager.open`이 정규화·검증한다.

시작 시 저장소를 열려면 사용자 조작 없이 같은 검증을 지나야 한다. 이 앱은 요청·응답(invoke)만
쓰고 main에서 renderer로 밀어 넣는 경로가 없으므로, renderer가 시작 시 한 번 물어보는 형태가
된다.

## Goals / Non-Goals

**Goals:**

- 인자로 받은 경로를 시작 시 열고, 폴더 선택과 같은 검증을 지나게 한다.
- 인자가 없을 때의 동작을 바꾸지 않는다.
- 잘못된 인자를 조용히 무시하지 않는다.

**Non-Goals:**

- 여러 저장소 동시 열기, 파일 연결, 셸 컨텍스트 메뉴 등록
- 인자로 커밋이나 비교 범위 지정
- 실행 중 두 번째 인스턴스가 인자를 넘기는 흐름

## Decisions

### 1. "인자 없음"을 기존 취소 결과로 표현한다

새 채널 `repository:initial`은 기존 `ApiResult`를 그대로 돌려준다.

| 상황 | 결과 |
|---|---|
| 유효한 인자 | `success` + 세션 |
| 인자 없음 | `cancelled` |
| 유효하지 않은 인자 | `error` + 진단 |

`cancelled`는 이미 "열린 저장소와 화면 상태를 유지한다"를 뜻하고, 시작 시점의 그 상태가 곧
저장소가 없는 화면이다. 새 상태값을 만들면 renderer의 저장소 상태 전이를 한 벌 더 써야 하는데,
그렇게 얻는 것이 없다.

### 2. 인자 해석을 순수 함수로 분리한다

`process.argv`의 모양이 실행 방식에 따라 다르다.

| 실행 | argv |
|---|---|
| 패키지 | `[prettifer.exe, <경로>, ...]` |
| 개발 | `[electron.exe, <스크립트>, <경로>, ...]` |

여기에 Electron이 붙이는 스위치(`--remote-debugging-port` 등)가 섞인다. 그래서
`repositoryPathFromArgv(argv, isPackaged)`를 순수 함수로 두고, 스위치로 시작하는 인자를 걸러
첫 번째 값만 쓴다. 실행 방식별 형태를 단위 테스트로 고정한다.

### 3. 주입점으로 넘긴다

`ApplicationSeams`에 `initialRepositoryPath?: () => string | null`을 더한다. 운영 진입점은
`process.argv`에서 만든 값을 넘기고, E2E 진입점은 같은 주입점을 그대로 쓴다. 조립 지점은 값의
출처를 모른다.

이 덕분에 패키지 smoke 테스트가 테스트용 환경 변수 없이 실제 제품 경로로 저장소를 열 수 있다.

### 4. 검증은 재사용한다

`RepositorySessionController`에 `openInitialRepository()`를 더하되, 경로를 여는 부분은 폴더
선택과 같은 `sessions.open()`과 같은 진단 변환을 쓴다. 인자 경로가 폴더 선택보다 느슨하게
검증되는 일이 없어야 한다.

## Risks / Trade-offs

- [renderer가 시작 시 한 번 더 요청한다] → 인자가 없으면 `cancelled`가 즉시 돌아오고 화면 상태는
  그대로다. 사용자가 보는 지연은 없다.
- [`cancelled`를 "인자 없음"에 재사용한다] → 의미가 하나 늘어난다. 대신 renderer가 이미 그
  결과에서 아무것도 바꾸지 않으므로 코드가 갈라지지 않는다. 이 선택은 design에 남겨 다음 사람이
  왜 새 상태가 없는지 알 수 있게 한다.
- [인자를 신뢰한다] → 경로는 사용자 자신의 명령행에서 오고, 기존 저장소 검증을 그대로 지난다.
  Git 저장소가 아니면 열리지 않는다.
