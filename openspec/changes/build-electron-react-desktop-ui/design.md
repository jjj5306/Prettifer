## Context

이 변경은 GitHub 이슈 #7을 구현 대상으로 삼는다. 현재 Prettifer 코어는 로컬 Git 저장소에서 비교 기준을 정하고, 선형 이력의 비연속 커밋을 적용해 추가·수정·삭제된 텍스트 파일과 통합 diff를 계산한다. 최신 요청만 결과로 게시하고 계산을 취소하며 사용자의 현재 브랜치와 작업 중인 파일을 보존하는 기능도 제공한다.

현재 저장소에는 사용자 화면과 저장소 이력 조회 기능이 없다. 첫 UI는 `docs/assets/prettifer-initial-ux-mockup.png`의 커밋 선택, 변경 파일 탐색과 좌우 diff 흐름을 사용하며 코어가 지원하는 범위를 화면에 정확히 표시한다. Windows를 첫 검증 운영체제로 사용하고 모든 저장소 작업은 사용자 컴퓨터에서 수행한다.

React 렌더러는 Git과 파일 시스템에 접근하는 데스크톱 기능과 분리되어야 한다. 이 경계는 코드 구조, 타입 설정, lint, 단위 테스트, 프로세스 간 계약 테스트와 패키지 실행 테스트로 함께 보호한다.

## Goals / Non-Goals

**Goals:**

- 사용자가 로컬 저장소를 열고 비교할 로컬 브랜치 범위를 선택한다.
- 작업 브랜치의 첫 번째 부모를 따르는 커밋 흐름에서 비연속 커밋을 선택한다.
- 기존 코어로 통합 결과를 생성하고 진행, 취소, 성공과 실패 상태를 이해할 수 있게 표시한다.
- 변경 파일을 탐색하고 Monaco Editor로 읽기 전용 좌우 diff를 확인한다.
- React 컴포넌트, 상태, Hook, 비동기 작업, 스타일과 테스트의 작성 규칙을 자동 검증한다.
- Electron main, preload와 renderer의 권한 및 의존성 경계를 작고 명확하게 유지한다.
- Windows 개발 앱, 패키지와 ZIP 결과물을 재현 가능한 명령으로 검증한다.

**Non-Goals:**

- 전체 Git 그래프 선과 여러 브랜치의 동시 탐색
- merge commit과 root commit 합성
- 부분 결과, 충돌 해결, 이름 변경 추론과 바이너리 diff
- 경로·확장자 그룹과 파일별 전체 커밋 이력
- 파일 편집, stage, commit, push와 원격 저장소 관리
- 다중 창, 사용자 설정 동기화와 계정 기능
- 코드 서명, 자동 업데이트와 공개 배포
- VS Code 확장과 웹 서비스
- 상세 튜토리얼, 퀵스타트와 사용 매뉴얼

## Decisions

### Electron Forge와 React 기반 단일 창 앱

Electron Forge의 TypeScript + Webpack 구성을 앱 실행과 패키징 기반으로 사용한다. renderer는 React와 TypeScript로 작성하고 `React.StrictMode`에서 실행한다. 좌우 텍스트 비교에는 Monaco Editor의 diff editor를 사용한다. Windows 결과물은 Forge package와 ZIP maker로 검증한다.

다음 명령 계약을 `package.json`에 제공한다.

- `desktop:start`: 개발용 Electron 창 실행
- `desktop:package`: 현재 Windows 환경의 패키지 앱 생성
- `desktop:make`: 실행 가능한 Windows ZIP 결과물 생성
- `test:desktop`: 패키지 경계와 주요 사용자 흐름 자동 검증
- `typecheck`, `lint`, `test`, `build`: 코어와 데스크톱 전체 검증

Electron, Forge, React와 보안 관련 패키지는 구현 시점의 최신 안정 버전을 정확한 버전으로 기록하고 lockfile로 고정한다. Electron 보안 수정이 포함된 안정 버전 갱신은 검증 명령과 패키지 실행 확인을 거친다.

### 코어, main, preload, renderer 의존성 방향

프로젝트는 다음 책임과 의존성 방향을 사용한다.

```text
React renderer
    ↓ typed desktop API
preload
    ↓ named request channels
Electron main
    ↓
repository history service + existing composite diff core
    ↓
Git process and local file system
```

- 기존 `src/composition`과 `src/git`은 React와 Electron에 의존하지 않는다.
- `src/history`는 읽기 전용 저장소·브랜치·커밋 조회를 맡고 Electron에 의존하지 않는다.
- `src/desktop/shared`는 직렬화 가능한 요청, 응답, 상태와 진단 계약만 제공한다. Node.js, Electron, React와 DOM 타입을 사용하지 않는다.
- `src/desktop/main`은 창 수명, 폴더 선택, 저장소 세션, 요청 검증, 이력 조회와 통합 결과 계산을 맡는다.
- `src/desktop/preload`는 허용된 각 동작을 하나의 이름 있는 함수로 노출한다.
- `src/desktop/renderer`는 `src/desktop/shared`의 타입과 preload API만 사용한다. `electron`, `node:*`, `src/git`, `src/history`와 `src/composition`을 직접 가져오지 않는다.
- main과 preload는 renderer 모듈을 가져오지 않는다. 기능 간 참조는 각 기능의 공개 모듈을 통한다.

각 실행 영역은 별도 TypeScript 설정을 사용한다. main과 preload 설정에는 필요한 Node.js·Electron 타입만 포함한다. renderer 설정에는 DOM과 테스트 타입만 포함하고 Node.js 타입을 포함하지 않는다. 모든 설정은 기존 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, 미사용 코드 검사와 명시적 모듈 문법을 유지한다.

### 저장소 세션 중심의 제한된 데스크톱 API

폴더 경로는 main 프로세스의 운영체제 폴더 선택 창에서만 받는다. main은 선택된 경로를 정규화하고 Git 저장소인지 확인한 뒤 창 수명에 묶인 `repositorySessionId`를 만든다. renderer는 화면 표시용 경로와 세션 ID를 받고 이후 요청에는 세션 ID만 전달한다.

preload가 공개하는 API는 다음 사용자 동작 단위로 제한한다.

- 저장소 폴더 선택
- 현재 세션의 브랜치 및 저장소 정보 조회
- 고정된 비교 범위의 커밋 페이지 조회
- 선택 커밋의 통합 결과 생성
- 요청 ID로 진행 중인 통합 결과 계산 취소

각 요청은 전용 채널과 직렬화 가능한 자료형을 사용한다. `ipcRenderer`, `send`, `invoke`, 이벤트 객체와 임의 채널 이름은 renderer에 노출하지 않는다. 모든 응답은 성공 자료 또는 `code`, `message`, 선택적 문제 대상과 `nextAction`을 갖는 진단 중 하나다. 오류 stack, 내부 임시 경로와 실행 명령 전체는 renderer 응답에 포함하지 않는다.

main은 Zod 스키마로 모든 요청 자료형을 실행 시점에 검증한다. 저장소 세션, 로컬 브랜치 이름, 고정된 브랜치 커밋 ID, 페이지 범위, 선택 커밋과 요청 ID도 main의 현재 세션 자료와 대조한다. 요청 발신 화면은 앱이 생성한 현재 창과 로컬 앱 주소에 일치해야 한다.

### Electron 보안 설정

앱 시작 시 renderer sandbox를 전역으로 켠다. `BrowserWindow`는 `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`와 전용 preload 경로를 사용한다. renderer는 로컬 패키지 자원만 불러온다.

운영 패키지의 Content Security Policy는 기본 출처와 스크립트를 앱 자신으로 제한한다. 개발 정책은 Forge 개발 주소와 개발 도구에 필요한 항목만 별도로 허용한다. 다음 창 경계도 main에서 적용한다.

- 예상된 앱 주소 밖으로 이동하는 탐색 차단
- 새 창 생성 차단
- 권한 요청 기본 거부
- `<webview>` 사용 금지
- renderer의 임의 외부 프로그램 실행 금지
- 현재 창과 일치하지 않는 프로세스 간 요청 거부

보안 회귀 테스트는 BrowserWindow 설정, preload 공개 키, 요청 발신자 검사, CSP, 탐색 차단과 Electron fuse 설정을 확인한다. 패키지 검증에서도 renderer의 Node.js 접근과 허용되지 않은 외부 이동이 차단되는지 확인한다.

### 읽기 전용 저장소 이력 조회

`RepositoryHistoryService`는 기존 `GitCommandRunner`를 사용하며 다음 정보를 제공한다.

- 저장소 최상위 경로와 현재 로컬 브랜치
- 로컬 브랜치 이름과 해당 커밋 ID
- 선택한 두 브랜치의 공통 조상
- 공통 조상 이후 작업 브랜치의 첫 번째 부모 커밋 흐름
- 커밋 ID, 부모 ID, 제목, 작성자 이름, 작성 시각과 merge 여부

Git 출력은 색상, pager, 외부 프로그램과 사용자 입력을 끈다. 커밋 필드는 NUL 구분 형식으로 읽어 제목과 작성자 문자에 줄바꿈이나 구분 문자가 있어도 안전하게 해석한다. 화면에는 한 번에 100개를 제공한다. 페이지는 조회 시작 시 고정한 작업 브랜치 커밋 ID와 공통 조상을 기준으로 만들고 다음 위치를 응답에 포함한다.

커밋 목록은 사용자에게 최신순으로 표시한다. 합성 요청에는 전체 커밋 ID를 사용하고 목록 key도 전체 커밋 ID를 사용한다. 부모가 둘 이상인 커밋은 merge 상태와 선택 불가 이유를 표시한다. 브랜치가 조회 시작 이후 이동하면 세션 버전을 불일치 상태로 바꾸고 새 이력을 불러오기 전까지 합성 요청을 받지 않는다.

### 요청 세대와 계산 수명 관리

각 저장소 세션은 `sessionRevision`, 각 비교 범위는 `rangeRevision`, 각 비동기 작업은 `requestId`를 갖는다. renderer reducer와 main 요청 관리자는 세 값이 현재 값과 모두 일치할 때만 응답을 적용한다.

main은 창마다 하나의 `CompositeDiffCoordinator`와 현재 계산 취소 함수를 관리한다. 새 저장소, 새 비교 범위, 새 선택 계산과 창 종료는 이전 계산을 취소한다. 계산 완료, 오류와 취소 경로에서 임시 작업 공간과 요청 항목을 정리한다. renderer는 선택이 바뀌면 완성된 결과를 무효화하고 사용자가 통합 결과 만들기를 다시 실행할 때 새 요청을 보낸다.

### React 상태 구조

renderer의 원본 상태는 한 개의 순수 reducer가 관리한다. 저장소, 비교 범위와 계산 상태는 허용된 조합만 표현하는 구분된 상태로 정의한다.

```text
repository: closed | choosing | loading | ready | error
range:       unset | loading | ready | stale | error
composition: idle | calculating | ready | cancelled | error
```

커밋 원본은 전체 커밋 ID를 key로 한 한 곳의 자료에 둔다. `selectedCommitIds`, `inspectedCommitId`와 `selectedFilePath`는 ID와 경로만 저장한다. 선택 개수, 선택 커밋 객체, 현재 파일 객체, 버튼 활성 상태와 정렬된 파일 목록은 렌더링 중 원본 상태에서 계산한다. 저장소나 비교 범위를 바꾸는 reducer action은 하위 선택과 결과를 같은 전이에서 제거한다.

Electron API 호출은 사용자 이벤트 처리 함수 또는 외부 연결을 담당하는 사용자 Hook에서 시작한다. Promise 결과는 요청 세대와 함께 reducer action으로 전달한다. 렌더링 함수, state 갱신 함수와 reducer에서는 데스크톱 API를 호출하지 않는다.

### 화면 구성

단일 창은 다음 영역으로 구성한다.

- `RepositoryToolbar`: 저장소 경로, 폴더 선택, 비교 기준과 작업 브랜치
- `CommitHistoryPane`: 커밋 체크 상자, 현재 탐색 행, 페이지 추가 로딩과 선택 수
- `CommitDetails`: 현재 탐색 커밋의 전체 ID, 제목, 작성자와 시각
- `CompositeResultHeader`: 계산 실행·취소, 실제 비교 기준, 적용 순서와 작업 트리 상태
- `ChangedFilePane`: 추가·수정·삭제 상태와 저장소 상대 경로
- `DiffPane`: 선택 파일의 원본과 통합 결과를 보여 주는 Monaco diff editor
- `OperationStatus`: 빈 상태, 조회·계산 진행, 취소, 성공과 오류 안내

큰 화면은 상단 저장소 도구 아래에 커밋, 변경 파일, diff의 세 열을 표시한다. 창 폭과 화면 확대에 따라 각 영역을 세로 순서로 탐색할 수 있게 배치하고 가로·세로 스크롤 범위를 해당 영역에 한정한다. 레이아웃 정보와 색상은 CSS 사용자 정의 속성으로 관리하고 컴포넌트 스타일은 CSS Modules에 둔다. 동적으로 계산되는 Monaco 크기 외에는 JSX의 인라인 스타일을 사용하지 않는다.

### React 코드 작성 규칙

#### 컴포넌트와 모듈

- 기능 폴더 안에 컴포넌트, 상태, 사용자 Hook, 스타일과 테스트를 함께 둔다.
- 파일마다 하나의 주 컴포넌트를 두고 이름 있는 export를 사용한다. Electron·Forge 설정과 React 진입점처럼 도구 계약이 요구하는 위치만 예외로 기록한다.
- 컴포넌트와 타입은 PascalCase, 사용자 Hook은 `use`, 이벤트 props는 `on`, 내부 이벤트 처리 함수는 `handle` 접두사를 사용한다.
- props는 `Readonly` 또는 읽기 전용 속성으로 정의한다. 전달받은 배열과 객체도 읽기 전용 타입을 사용한다.
- 화면 표현 컴포넌트는 자료와 이벤트를 props로 받고 Electron API를 알지 못한다. 외부 요청 연결은 기능 경계의 Hook과 앱 controller가 맡는다.
- 공통 컴포넌트는 두 곳 이상에서 같은 의미와 변경 방향이 확인된 경우에만 추출한다.
- 기능의 공개 모듈 밖 파일을 다른 기능이 깊은 경로로 가져오지 않는다.

#### 렌더링 순수성과 불변성

- 컴포넌트와 사용자 Hook은 같은 props와 state에 같은 JSX를 반환한다.
- 렌더링 중 현재 시각, 난수, 새 ID 생성, 데스크톱 호출, 로그 기록과 외부 객체 변경을 수행하지 않는다.
- props, state, context, ref의 현재 값과 캐시된 자료를 직접 변경하지 않는다.
- 배열 정렬, 추가와 제거는 복사본 또는 새 배열을 만들고 reducer는 항상 새 상태를 반환한다.
- Git 출력, 경로와 진단 문구는 React 텍스트 노드로 렌더링한다. `dangerouslySetInnerHTML`은 사용하지 않는다.

#### Hook과 Effect

- Hook은 React 컴포넌트와 사용자 Hook의 최상위에서 같은 순서로만 호출한다.
- 조건문, 반복문, 이벤트 처리 함수, 일반 함수와 `try` 블록 안에서 Hook을 호출하지 않는다.
- Effect는 Electron 이벤트 구독, Monaco 모델, DOM 포커스 복원과 같은 외부 시스템 동기화에만 사용한다.
- props나 state에서 구할 수 있는 값을 Effect로 state에 복사하지 않는다.
- 사용자 동작은 해당 이벤트 처리 함수에서 수행한다.
- 모든 구독, 타이머, Monaco 모델과 취소 가능한 작업은 Effect 정리 함수에서 해제한다.
- Effect 의존성 lint를 끄지 않는다. 외부 계약 때문에 예외가 필요하면 이유와 회귀 테스트를 같은 변경에 포함한다.

#### 상태와 비동기 처리

- 관련된 화면 전이는 reducer action 하나로 처리하고 서로 모순되는 여러 boolean state를 만들지 않는다.
- 서버 또는 main 응답의 원본 자료를 한 곳에 보관하고 화면 계산값을 중복 저장하지 않는다.
- 비동기 action에는 요청 ID와 범위 revision을 포함한다. 완료 action은 reducer에서 현재 요청과 일치할 때만 반영한다.
- Promise는 모두 기다리거나 명시적으로 오류를 처리한다. 이벤트 처리 함수의 비동기 실패도 진단 action으로 변환한다.
- 사용자에게 보이는 오류는 문제 범위, 원인과 다음 행동을 포함한다. 알 수 없는 값은 안전한 일반 진단으로 변환한다.

#### 목록, ref와 성능

- 커밋 목록 key는 전체 커밋 ID, 파일 목록 key는 저장소 상대 경로를 사용한다. 배열 위치, 화면 문구, 난수와 현재 시각을 key로 사용하지 않는다.
- ref는 Monaco host, 포커스 복원과 측정처럼 DOM 수명 관리에만 사용한다. 렌더링 중 ref를 읽거나 변경하지 않는다.
- `useMemo`, `useCallback`과 `memo`는 측정된 렌더링 병목 또는 외부 구독의 안정적인 함수 참조가 필요한 지점에만 사용한다.
- 커밋은 100개 단위로 추가하고 Monaco 구현 코드는 첫 diff 표시 시 불러온다.
- 파일 전환 시 이전 Monaco model을 폐기하고 한 시점에 선택 파일의 원본·결과 model만 유지한다.

#### 오류 경계

- 앱 루트와 Monaco 영역에 오류 경계를 둔다.
- 자식 렌더링 오류는 복구 안내와 다시 열기 동작으로 변환한다.
- 오류 경계가 잡은 오류는 현재 Git 결과를 성공 상태로 바꾸지 않는다.

### 접근성 규칙

버튼, 체크 상자, 선택 목록과 진행 상태에는 기본 HTML 요소를 사용한다. 모든 컨트롤은 보이는 이름을 갖고 아이콘만 있는 컨트롤은 접근 가능한 이름을 추가한다. 커밋 체크 상태, 현재 탐색 행, 키보드 위치와 비활성 상태는 서로 다른 이름과 테두리 또는 기호로 표시한다.

Tab 순서는 저장소와 브랜치, 커밋, 계산 동작, 변경 파일, diff 순서를 따른다. 목록 내부 조작은 기본 체크 상자와 버튼 동작을 유지한다. 비동기 갱신 후 기존 요소가 남아 있으면 같은 요소에, 제거되었으면 해당 영역의 첫 관련 컨트롤에 포커스를 둔다.

진행과 성공 안내는 `aria-live="polite"`, 즉시 확인이 필요한 오류는 `role="alert"`로 알린다. 상태 갱신만으로 현재 포커스를 옮기지 않는다. 색상은 WCAG 2.2 AA 대비를 만족하고 상태 의미를 색상에만 의존하지 않는다. 200퍼센트 화면 확대, Windows 고대비 설정과 `prefers-reduced-motion`을 검증한다.

Monaco diff editor에는 원본과 통합 결과를 구분하는 이름을 제공하고 내장 접근 가능 diff 보기 기능을 유지한다. 앱 단축키가 Monaco의 키보드 탐색과 보조 기능을 가로채지 않게 한다.

### 자동 코드 규칙

ESLint flat config에 다음 검사를 적용한다.

- `typescript-eslint`의 `strictTypeChecked`와 `stylisticTypeChecked`
- `eslint-plugin-react-hooks`의 권장 React 규칙 전체
- `eslint-plugin-react`의 JSX key, 배열 위치 key와 위험한 HTML 삽입 방지 규칙
- `eslint-plugin-jsx-a11y`의 권장 접근성 규칙
- 처리하지 않은 Promise, 빠진 switch 분기와 value import로 작성된 type import 검사
- renderer의 Electron, Node.js, Git, 이력 및 합성 모듈 import 금지
- main·preload의 renderer import와 shared의 실행 환경 모듈 import 금지

React Hooks 권장 규칙 중 `rules-of-hooks`, `exhaustive-deps`, `purity`, `immutability`, `refs`, `set-state-in-render`, `set-state-in-effect`, `static-components`, `error-boundaries`를 오류로 검사한다. lint 비활성화 주석은 규칙 이름, 필요한 이유와 연결된 이슈가 있어야 하며 파일 전체 비활성화는 허용하지 않는다.

### Monaco 모델 수명과 파일 표현

성공 결과에서 파일을 선택하면 저장소 세션, 결과 요청 ID, 파일 경로와 원본·결과 구분으로 고유한 Monaco URI를 만든다. 수정 파일은 양쪽 내용을 사용하고 추가 파일은 원본을, 삭제 파일은 결과를 빈 문자열로 만든다. 파일 확장자에 알려진 언어가 있으면 해당 언어를 사용하고 알 수 없으면 일반 텍스트로 표시한다.

diff editor는 양쪽 편집을 끄고 줄 번호, 변경 구간 정렬과 자동 레이아웃을 켠다. 새 파일 선택, 새 결과, 저장소 변경, diff 오류와 화면 종료에서 두 model과 editor를 모두 폐기한다. 파일 내용은 renderer 상태에 장기 복제하지 않고 현재 결과의 선택 파일 참조로 사용한다.

### 테스트 구조와 합격 기준

TDD 순서는 OpenSpec 시나리오의 실패 테스트, 최소 구현, 구조 개선과 전체 회귀 검증을 따른다.

- `RepositoryHistoryService` 단위·통합 테스트: 저장소 판별, 브랜치, 공통 조상, first-parent 순서, 페이지, merge 표시, ref 이동과 Git 오류
- reducer·selector 단위 테스트: 모든 상태 전이, 범위 변경 초기화, 선택·탐색 분리, 늦은 응답 무시와 파일 기본 선택
- React Testing Library 테스트: 역할과 보이는 이름을 사용한 저장소, 브랜치, 커밋, 계산, 파일과 오류 동작
- preload 계약 테스트: 공개 함수 목록, 요청 자료형, 반환 진단과 원시 Electron API 비노출
- main 요청 테스트: 런타임 스키마, 세션·revision, 발신 창, 취소와 잘못된 입력 거부
- 보안 테스트: BrowserWindow 옵션, CSP, 탐색·새 창·권한 차단과 renderer import 경계
- Monaco adapter 테스트: 추가·수정·삭제 model, 읽기 전용 설정과 모든 종료 경로의 dispose
- Playwright Electron 테스트: 저장소 열기부터 커밋 선택, 계산, 파일 전환, 취소, 오류 복구와 창 종료까지의 주요 흐름
- 패키지 smoke 테스트: Windows package 또는 ZIP의 실행, 첫 창 표시와 정상 종료
- 기존 Git fixture 통합 테스트: UI 경로의 성공, 실패와 취소 후 branch, HEAD, staged, unstaged, untracked 상태 일치

컴포넌트 테스트는 `StrictMode`에서 렌더링하고 사용자 입력은 `user-event`로 수행한다. 우선 조회는 role, label과 text이며 테스트 전용 ID는 접근 가능한 조회가 없는 Monaco host와 명확한 기반 시설 경계에만 사용한다. 큰 DOM snapshot을 완료 기준으로 사용하지 않는다.

### 문서 연결

이 변경에는 개발 실행과 패키지 검증에 필요한 명령 설명만 포함한다. 설치부터 실제 저장소 사용, 화면별 사용법, 제한 사항과 문제 해결은 열린 문서화 이슈 #5에 후속 작업으로 추가한다. #5는 UI 문서가 병합된 뒤에도 계속 사용할 문서 추적 이슈로 유지한다.

## Risks / Trade-offs

- [Electron과 Monaco로 설치 및 패키지 크기가 커짐] → 정확한 버전을 고정하고 Monaco를 첫 diff 요청 시 불러오며 결과물 크기를 검증 기록에 남긴다.
- [큰 저장소에서 커밋 조회와 렌더링이 지연됨] → 고정된 커밋 ID를 기준으로 100개씩 읽고 사용자가 요청할 때 이전 페이지를 추가한다.
- [브랜치가 앱 사용 중 이동해 화면 입력과 Git 상태가 달라짐] → 브랜치 커밋 ID와 range revision을 검증하고 불일치 시 결과 생성을 중단한 뒤 새로 고침을 안내한다.
- [취소된 Git 작업이 늦게 완료됨] → main과 renderer가 요청 ID 및 revision을 함께 확인하고 현재 값과 다른 응답을 폐기한다.
- [Monaco model과 구독이 쌓여 메모리가 증가함] → adapter 한 곳에서 model, editor와 구독 수명을 관리하고 교체·오류·종료 테스트로 폐기를 확인한다.
- [개발 서버 정책과 운영 패키지 보안 정책이 달라짐] → 두 정책을 별도 설정하고 패키지 결과의 CSP와 BrowserWindow 옵션을 자동 검증한다.
- [서명되지 않은 Windows 결과물에 운영체제 경고가 표시됨] → 이 변경의 결과물을 로컬 검증용 ZIP으로 표시하고 서명 및 공개 배포는 별도 이슈에서 관리한다.
- [현재 코어가 지원하지 않는 Git 이력을 UI가 지원하는 것으로 보일 수 있음] → first-parent 목록과 선택 불가 표시를 사용하고 merge, binary와 합성 실패에 범위 및 다음 행동을 안내한다.

## Migration Plan

1. 기존 코어 검증을 유지한 상태에서 Electron Forge 설정, 실행 영역별 TypeScript 설정과 import 경계 검사를 추가한다.
2. 실패 테스트와 함께 저장소 이력 서비스, shared 계약, main 요청 처리와 preload API를 추가한다.
3. reducer와 표시 컴포넌트를 구현한 뒤 실제 API controller와 Monaco adapter를 연결한다.
4. 프로세스 경계, 보안, 접근성, Playwright 흐름과 Windows 패키지 smoke 검증을 통과시킨다.
5. 개발 실행 명령을 기록하고 상세 사용 문서 범위를 이슈 #5에 연결한다.

이 변경은 기존 코어 공개 동작에 추가되는 구조다. 되돌릴 때 데스크톱 진입점, 패키징 설정과 UI 전용 의존성을 제거해 기존 코어 빌드와 테스트 상태로 복구할 수 있다.

## Open Questions

없음.

## References

- [React 규칙](https://react.dev/reference/rules)
- [컴포넌트와 Hook 순수성](https://react.dev/reference/rules/components-and-hooks-must-be-pure)
- [상태 구조 선택](https://react.dev/learn/choosing-the-state-structure)
- [Effect 사용 기준](https://react.dev/learn/you-might-not-need-an-effect)
- [React Hooks ESLint 규칙](https://react.dev/reference/eslint-plugin-react-hooks)
- [React StrictMode](https://react.dev/reference/react/StrictMode)
- [Electron 보안 지침](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron process sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron 프로세스 간 통신](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron Forge 패키징](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Electron Forge Webpack + TypeScript](https://www.electronforge.io/templates/typescript-%2B-webpack-template)
- [typescript-eslint 엄격 설정](https://typescript-eslint.io/users/configs/)
- [Testing Library](https://testing-library.com/docs/)
- [키보드 인터페이스 접근성](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)
