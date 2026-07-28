## 1. 개발 규칙과 데스크톱 기반

- [x] 1.1 Electron, Forge, React, Monaco, Zod와 테스트 패키지의 최신 안정 버전, Node.js 호환 범위와 유지보수 상태를 확인한다
- [x] 1.2 확인한 정확한 의존성 버전과 Electron Forge TypeScript + Webpack 구성을 `package.json`과 lockfile에 추가한다
- [x] 1.3 main, preload, renderer와 shared 계약의 모듈 폴더 및 진입점을 만든다
- [x] 1.4 core, main, preload와 renderer별 TypeScript 설정을 만들고 renderer에서 Node.js 타입을 사용할 수 없음을 검증한다
- [x] 1.5 React Hooks, JSX, 접근성, 처리되지 않은 Promise와 실행 영역별 import 경계를 검사하는 ESLint flat config를 추가한다
- [x] 1.6 `AGENTS.md`에 design의 React·Electron 코드 작성 규칙과 lint 예외 기록 기준을 반영한다
- [x] 1.7 `desktop:start`, `desktop:package`, `desktop:make`, `test:desktop` 명령과 전체 build·typecheck 연결을 추가한다
- [x] 1.8 빈 React StrictMode 화면의 개발 실행, lint, typecheck와 기존 코어 테스트가 함께 통과하는지 확인한다

## 2. 저장소와 커밋 이력 조회

- [x] 2.1 로컬 브랜치, 긴 first-parent 이력, merge commit, 움직이는 branch ref와 잘못된 폴더를 포함한 Git fixture를 추가한다
- [x] 2.2 저장소 판별, 최상위 경로, 현재 브랜치와 Git 실행 파일 오류의 실패 테스트를 작성한다
- [x] 2.3 저장소 정보 조회와 사용자가 이해할 수 있는 진단을 `RepositoryHistoryService`에 구현한다
- [x] 2.4 로컬 브랜치 이름·커밋 ID와 두 브랜치의 공통 조상 조회 실패 테스트를 작성한다
- [x] 2.5 로컬 브랜치 및 공통 조상 조회를 안전한 Git 인자와 NUL 구분 출력으로 구현한다
- [x] 2.6 first-parent 최신순 커밋 정보, merge 표시와 100개 페이지의 실패 테스트를 작성한다
- [x] 2.7 고정된 head 커밋 ID를 사용하는 커밋 페이지와 다음 위치 계산을 구현한다
- [x] 2.8 branch ref 이동과 오래된 페이지·합성 입력 거부의 실패 테스트를 작성한다
- [x] 2.9 range revision 검증과 새 이력 불러오기 진단을 구현한다
- [x] 2.10 저장소 조회 테스트와 기존 Git 통합 테스트를 함께 실행해 회귀가 없음을 확인한다

## 3. 프로세스 경계와 보안

- [x] 3.1 저장소 세션, 브랜치 범위, 커밋 페이지, 통합 요청·응답과 진단의 Zod 스키마 실패 테스트를 작성한다
- [x] 3.2 직렬화 가능한 shared 스키마와 TypeScript 자료형을 구현하고 Node.js·Electron·DOM 의존성이 없음을 확인한다
- [x] 3.3 폴더 선택 취소, 유효한 저장소, 잘못된 폴더와 새 세션 교체의 main 처리 실패 테스트를 작성한다
- [x] 3.4 정규화된 경로와 창 수명에 묶인 저장소 세션 관리를 main에 구현한다
- [x] 3.5 올바른 현재 창, 잘못된 발신 화면, 잘못된 schema와 만료된 session·revision 요청의 실패 테스트를 작성한다
- [x] 3.6 이름 있는 요청 handler, 발신 화면 검사와 세션 자료 대조를 main에 구현한다
- [x] 3.7 preload 공개 함수 목록과 원시 `ipcRenderer`·이벤트 객체 비노출의 실패 테스트를 작성한다
- [x] 3.8 저장소 선택, 브랜치·커밋 조회, 통합 결과 생성과 취소만 제공하는 typed preload API를 구현한다
- [x] 3.9 BrowserWindow 격리·sandbox, CSP, 권한, 탐색과 새 창 차단의 실패 테스트를 작성한다
- [x] 3.10 main 창 보안 설정과 개발·운영 CSP를 구현한다
- [x] 3.11 renderer의 Electron·Node.js·코어 직접 import와 shared의 실행 환경 import가 lint에서 실패하는지 검증한다
- [x] 3.12 프로세스 경계 테스트, 보안 테스트, lint와 typecheck를 함께 실행한다

## 4. React 상태와 비동기 수명

- [x] 4.1 저장소, 비교 범위와 통합 결과의 허용된 상태 조합을 나타내는 reducer 실패 테스트를 작성한다
- [x] 4.2 구분된 상태, action과 순수 reducer를 구현한다
- [x] 4.3 선택 커밋 ID, 탐색 커밋 ID와 선택 파일 경로를 분리하고 계산값을 중복 저장하지 않는 selector 실패 테스트를 작성한다
- [x] 4.4 커밋·파일 selector, 선택 수와 버튼 활성 상태 계산을 구현한다
- [x] 4.5 저장소·범위 변경, 계산 취소와 늦은 응답이 하위 상태를 정확히 제거하는 실패 테스트를 작성한다
- [x] 4.6 session revision, range revision과 request ID가 일치하는 응답만 적용하도록 reducer를 구현한다
- [x] 4.7 가짜 desktop API로 성공, 취소, 진단과 연결 실패를 재현하는 controller Hook 실패 테스트를 작성한다
- [x] 4.8 사용자 이벤트에서 API를 호출하고 모든 Promise 실패를 진단 action으로 바꾸는 controller Hook을 구현한다
- [x] 4.9 루트와 Monaco 영역의 렌더링 오류 경계 실패 테스트를 작성하고 복구 화면을 구현한다
- [x] 4.10 모든 상태·Hook 테스트를 StrictMode에서 실행하고 React Hooks lint를 통과시킨다

## 5. 저장소와 커밋 화면

- [x] 5.1 첫 화면, 폴더 선택 성공·취소·오류와 이전 저장소 유지의 사용자 실패 테스트를 작성한다
- [x] 5.2 `RepositoryToolbar`와 저장소 빈 상태·진단 화면을 구현한다
- [x] 5.3 로컬 브랜치 목록, 현재 브랜치, 비교 기준·작업 브랜치와 공통 조상 표시의 사용자 실패 테스트를 작성한다
- [x] 5.4 브랜치 범위 컨트롤과 범위 로딩·오류·비어 있음 상태를 구현한다
- [x] 5.5 커밋 정보, merge 선택 불가, 페이지 추가와 위치 유지의 사용자 실패 테스트를 작성한다
- [x] 5.6 `CommitHistoryPane`과 100개 단위 이전 커밋 추가 로딩을 구현한다
- [x] 5.7 비연속 체크 선택, 현재 탐색 커밋과 선택 0개 안내의 사용자 실패 테스트를 작성한다
- [x] 5.8 합성 체크 상태, 현재 탐색 행과 `CommitDetails`를 서로 다른 표시로 구현한다
- [x] 5.9 저장소·브랜치·커밋 화면의 키보드 순서, 포커스 복원과 상태 이름을 접근성 테스트로 검증한다
- [x] 5.10 200퍼센트 확대, Windows 고대비와 줄어든 동작 설정에서 주요 컨트롤을 탐색할 수 있는지 검증한다

## 6. 통합 결과와 좌우 diff

- [x] 6.1 현재 선택의 계산 시작, 중복 실행 방지, 선택 변경 취소와 늦은 응답 무시의 사용자 실패 테스트를 작성한다
- [x] 6.2 `CompositeResultHeader`의 실행·취소·다시 계산 동작을 구현한다
- [x] 6.3 main의 저장소 세션과 기존 `CompositeDiffCoordinator` 연결 실패 테스트를 작성한다
- [x] 6.4 요청별 취소와 정리, 성공 자료 및 안전한 진단 변환을 main에 구현한다
- [x] 6.5 비교 기준, 적용 순서, 선택 수, 작업 트리 보존과 변경 없음 상태의 사용자 실패 테스트를 작성한다
- [x] 6.6 결과 범위와 상태를 표시하는 `CompositeResultHeader` 및 `OperationStatus`를 완성한다
- [x] 6.7 변경 파일 경로 정렬, 추가·수정·삭제 표시, 첫 파일 선택과 키보드 전환의 실패 테스트를 작성한다
- [x] 6.8 `ChangedFilePane`과 선택 파일 상태 전이를 구현한다
- [x] 6.9 Monaco의 수정·추가·삭제 model, 읽기 전용 옵션과 모든 종료 경로 dispose의 실패 테스트를 작성한다
- [x] 6.10 Monaco adapter와 지연 로딩 `DiffPane`을 구현한다
- [x] 6.11 원본·결과 이름, 접근 가능한 diff 보기와 상태 live region의 접근성 테스트를 작성한다
- [x] 6.12 계산·파일·diff 영역의 키보드 흐름과 오류 후 관련 컨트롤 이동을 구현한다
- [x] 6.13 화면 경계를 통한 성공, 실패와 취소 뒤 branch, HEAD, staged, unstaged, untracked 상태 보존 통합 테스트를 작성한다
- [x] 6.14 사용자 Git 작업 상태 보존 테스트와 기존 코어 전체 회귀 테스트를 통과시킨다

## 7. 앱 전체 흐름과 패키지

- [x] 7.1 Playwright Electron용 Git fixture와 가짜 폴더 선택 경계를 준비한다
- [x] 7.2 앱 실행, 저장소 열기, 브랜치 범위 선택, 비연속 커밋 합성과 파일 전환 전체 흐름 테스트를 작성한다
- [x] 7.3 계산 취소, 지원 범위 오류, Git 실행 오류와 다시 시도 전체 흐름 테스트를 작성한다
- [x] 7.4 다른 저장소와 범위로 바꾼 뒤 이전 응답이 표시되지 않는 전체 흐름 테스트를 작성한다
- [x] 7.5 Electron 콘솔 오류, 처리되지 않은 Promise와 renderer Node.js 접근이 없는지 전체 흐름에서 확인한다
- [x] 7.6 창 보안 설정, preload 공개 범위, 요청 발신자, CSP, 탐색 차단과 Electron fuse 회귀 검사를 실행한다
- [x] 7.7 Windows package를 만들고 첫 창 표시, 주요 흐름과 정상 종료 smoke 테스트를 통과시킨다
- [x] 7.8 Windows ZIP 결과물을 만들고 파일 위치, 크기와 실행 검증 결과를 기록한다

## 8. 최종 품질과 문서 연결

- [x] 8.1 개발 실행과 패키지 검증에 필요한 최소 명령을 README 개발 항목에 추가한다
- [x] 8.2 문서화 이슈 #5에 이슈 #7의 설치, 퀵스타트, 화면 사용법과 문제 해결 후속 항목을 연결하고 이슈를 열린 상태로 유지한다
- [x] 8.3 React 파일 구조, 상태 중복, Effect 사용, Hook 위치, 안정적인 key, 불변성, 접근성과 import 경계를 자체 리뷰한다
- [x] 8.4 Electron 창 설정, preload 공개 범위, 요청 schema·발신자 검증, CSP와 탐색 차단을 자체 리뷰한다
- [x] 8.5 `npm ci`, lint, typecheck, 단위·통합·컴포넌트·Electron 테스트와 build를 깨끗한 환경에서 실행한다
- [x] 8.6 `desktop:package`와 `desktop:make`를 다시 실행하고 생성된 앱의 smoke 검증을 반복한다
- [x] 8.7 `openspec validate build-electron-react-desktop-ui --strict`를 통과시키고 모든 시나리오를 테스트 항목에 연결한다
- [x] 8.8 GitHub 이슈 #7의 완료 기준과 실제 결과, 검증 기록, 남은 위험 및 이슈 #5 링크를 최종 확인한다
