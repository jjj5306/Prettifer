## 현재 구현 연결

| 작업 | 구현 및 검증 |
| --- | --- |
| 2.3 | `CommitHistoryPane.tsx`, `commit-history-pane.test.tsx`의 추가 페이지와 키보드 위치 유지 |
| 3.1–3.2 | `selection-planner.test.ts`, `app-state.test.ts`, `commit-history-pane.test.tsx`의 비연속 선택과 탐색 상태 분리 |
| 3.7–3.10 | `composite-diff-service.test.ts`, `worktree-preservation.test.ts`, `CompositeResultHeader.tsx`의 최종 결과와 범위 표시 |
| 3.14 | `composite-diff-coordinator.test.ts`, `use-app-controller.test.tsx`의 동일 입력 및 최신 요청 결과 |
| 3.15–3.16 | `CompositeResultHeader.tsx`, `composite-diff-coordinator.ts`, `worktree-preservation.test.ts`의 진행·취소와 상태 보존 |

## 후속 이슈 연결

| 범위 | 이슈 |
| --- | --- |
| 변경 파일 그룹화 | #13 |
| 선택 파일의 전체 커밋 흐름 | #14 |
| 커밋별 변경 파일 탐색 | #15 |
| 부분 통합 결과와 파일별 문제 상태 | #16 |
| merge commit 기준 부모 | #17 |
| 조상 관계가 없는 커밋 적용 순서 | #18 |

## 남은 작업

- 1.1, 2.1, 2.2, 2.4: 전체 Git 그래프, 브랜치와 태그, 불완전한 이력의
  확인 범위와 원인
- 1.3: 얕은 복제와 누락된 Git 자료를 포함한 불완전 이력 검증 저장소
- 3.3, 3.4: 루트 이력을 빈 저장소 상태와 비교하는 계산
- 5.7, 5.8: 이름 변경 파일의 이전 경로와 현재 경로를 보존하는 좌우 비교
- 6.1, 6.3: 요구사항과 자동 검증의 연결 및 1초를 넘는 계산의 처리 범위와 취소
