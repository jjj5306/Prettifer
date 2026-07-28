# 시나리오 검증 연결

이 문서는 `build-electron-react-desktop-ui` 변경의 각 사용자 시나리오를 자동 검증 항목에 연결한다.

## 저장소와 커밋 탐색

| 시나리오 | 자동 검증 항목 |
| --- | --- |
| 패키지 앱 실행 | `test/e2e/desktop-package-smoke.e2e.ts` — 패키지 앱 실행, 주요 흐름, 정상 종료 |
| 유효한 저장소 선택 | `test/e2e/desktop-flow.e2e.ts` — 저장소 열기와 결과 검토 |
| 폴더 선택 취소 | `test/desktop/main/e2e-boundary.test.ts` — 선택 취소 보존; `test/desktop/renderer/state/app-state.test.ts` — 기존 저장소 상태 유지 |
| Git 저장소가 아닌 폴더 선택 | `test/e2e/desktop-flow.e2e.ts` — 잘못된 폴더 안내 후 정상 저장소로 복구 |
| Git 실행 파일을 사용할 수 없음 | `test/e2e/desktop-flow.e2e.ts` — 원인과 다음 행동 표시 |
| 비교 기준과 작업 브랜치 선택 | `test/desktop/renderer/repository/repository-toolbar.test.tsx` — 선택 범위 요청과 공통 조상 표시 |
| 현재 브랜치 확인 | `test/desktop/renderer/repository/repository-toolbar.test.tsx` — 현재 브랜치와 로컬 브랜치 표시 |
| 비교 범위를 만들 수 없음 | `test/desktop/renderer/repository/repository-toolbar.test.tsx` — 범위 오류와 다음 행동 표시 |
| 비교 범위 변경 | `test/desktop/renderer/state/app-state.test.ts` — 선택과 이전 결과 제거 |
| 커밋 정보 확인 | `test/desktop/renderer/history/commit-history-pane.test.tsx` — 제목, ID, 작성자, 시각 표시 |
| merge commit 확인 | `test/e2e/desktop-flow.e2e.ts` — 병합 커밋 선택 차단과 안내 |
| 비교 범위에 커밋이 없음 | `test/desktop/renderer/history/commit-history-pane.test.tsx` — 빈 범위 안내 |
| 이전 커밋 추가 로딩 | `test/integration/repository-history.test.ts` — 100개 단위 고정 범위 조회; `test/desktop/renderer/history/commit-history-pane.test.tsx` — 추가 로딩 동작 |
| 조회 중 브랜치 이동 | `test/integration/repository-history.test.ts` — 오래된 범위와 합성 입력 거부; `test/desktop/renderer/state/app-state.test.ts` — stale 전환과 선택 제거 |
| 비연속 커밋 선택 | `test/e2e/desktop-flow.e2e.ts` — 떨어진 커밋 두 개 선택과 합성 |
| 선택하지 않은 커밋 탐색 | `test/desktop/renderer/history/commit-history-pane.test.tsx` — 합성 선택과 현재 탐색 구분 |
| 모든 선택 해제 | `test/desktop/renderer/history/commit-history-pane.test.tsx` — 빈 선택 안내 |
| 키보드로 커밋 선택 | `test/desktop/renderer/history/commit-history-pane.test.tsx` — 스페이스 키 선택 |
| 비동기 조회 후 위치 유지 | `test/desktop/renderer/history/commit-history-pane.test.tsx` — 마지막 페이지 로딩 후 포커스 복원 |
| 화면 200퍼센트 확대 | `test/e2e/desktop-flow.e2e.ts` — 실제 Electron 화면 확대와 루트 가로 넘침 확인 |

## 통합 결과와 좌우 diff

| 시나리오 | 자동 검증 항목 |
| --- | --- |
| 통합 결과 만들기 | `test/e2e/desktop-flow.e2e.ts` — 비연속 선택 합성과 파일 diff 검토 |
| 결과 생성 후 선택 변경 | `test/desktop/renderer/controller/use-app-controller.test.tsx` — 선택 변경 시 계산 취소; `test/desktop/renderer/state/app-state.test.ts` — 이전 결과 제거 |
| 계산 중 선택 또는 범위 변경 | `test/desktop/renderer/controller/use-app-controller.test.tsx` — 진행 작업 취소; `test/desktop/renderer/state/app-state.test.ts` — 현재 범위 응답만 반영 |
| 사용자가 계산 취소 | `test/e2e/desktop-flow.e2e.ts` — 계산 취소 후 재실행 가능 상태 |
| 취소 응답보다 계산 완료가 늦게 도착 | `test/desktop/renderer/state/app-state.test.ts` — 현재 요청과 범위가 일치하는 결과만 반영 |
| 성공 결과 확인 | `test/desktop/renderer/composition/composite-result-header.test.tsx` — 실제 기준, 적용 순서, 작업 트리 보존 표시 |
| 변경 파일이 없는 결과 | `test/desktop/renderer/composition/composite-result-header.test.tsx` — 성공과 변경 없음 표시 |
| 여러 변경 파일 확인 | `test/desktop/renderer/files/changed-file-pane.test.tsx` — main 결과 순서 유지와 추가·수정·삭제 표시 |
| 키보드로 파일 변경 | `test/desktop/renderer/files/changed-file-pane.test.tsx` — 키보드 활성화로 파일 전환 |
| 수정 파일 비교 | `test/desktop/renderer/diff/monaco-diff-adapter.test.ts` — 수정 모델과 읽기 전용 옵션 |
| 추가 파일 비교 | `test/desktop/renderer/diff/monaco-diff-adapter.test.ts` — 빈 원본과 추가 결과 모델 |
| 삭제 파일 비교 | `test/desktop/renderer/diff/monaco-diff-adapter.test.ts` — 삭제 원본과 빈 결과 모델 |
| diff 편집 시도 | `test/desktop/renderer/diff/monaco-diff-adapter.test.ts` — 원본과 결과 모두 편집 차단 |
| 보조 기술로 diff 열기 | `test/desktop/renderer/accessibility/workspace-accessibility.test.tsx` — 이름 있는 읽기 전용 diff와 키보드 순서 |
| 지원 범위를 벗어난 커밋 | `test/e2e/desktop-flow.e2e.ts` — 병합 커밋 선택 차단과 설명; `test/integration/repository-history.test.ts` — 위조된 공통 조상, side-branch 및 merge commit 입력 거부 |
| 변경 적용 실패 | `test/integration/worktree-preservation.test.ts` — 적용 실패 진단과 작업 상태 보존 |
| 화면 경계 호출 실패 | `test/desktop/renderer/controller/use-app-controller.test.tsx` — 연결 실패를 사용자 진단으로 변환 |
| 이전 요청이 나중에 완료됨 | `test/desktop/main/desktop-composition-controller.test.ts` — 최신 요청만 게시 |
| 다른 저장소를 연 뒤 이전 응답 도착 | `test/e2e/desktop-flow.e2e.ts` — 새 저장소 상태 유지와 이전 결과 차단 |
| 작업 중인 저장소에서 결과 검토 | `test/integration/desktop-composition-boundary.test.ts` — 성공 뒤 브랜치, HEAD, 스테이징, 수정, 미추적 상태 보존 |
| 오류 또는 취소 후 상태 확인 | `test/integration/desktop-composition-boundary.test.ts` — 실패와 취소 뒤 사용자 Git 상태 보존 |
| 계산 상태 변경 알림 | `test/desktop/renderer/composition/composite-result-header.test.tsx` — 계산 중, 취소, 완료와 오류 상태 알림 |
| 오류 후 키보드 이동 | `test/desktop/renderer/diff/diff-pane.test.tsx` — 오류 안내, 다시 열기, diff 포커스 복원 |

## 실행 기준

- `npm test`: 핵심, 프로세스 경계, 상태, 컴포넌트와 통합 검증
- `npm run test:desktop`: 데스크톱 전용 검증과 Playwright Electron 전체 흐름
- `npm run lint`: React Hooks, 접근성 보조 규칙과 실행 영역별 import 경계
- `npm run typecheck`: core, shared, main, preload와 renderer 타입 경계
- `npm run build`: 핵심 빌드와 Windows 앱 패키지 생성
