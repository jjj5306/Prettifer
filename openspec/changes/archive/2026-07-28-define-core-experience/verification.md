## 현재 구현 연결

| 작업 | 구현 및 검증 |
| --- | --- |
| 2.3 | `CommitHistoryPane.tsx`, `commit-history-pane.test.tsx`의 추가 페이지와 키보드 위치 유지 |
| 3.1–3.2 | `selection-planner.test.ts`, `app-state.test.ts`, `commit-history-pane.test.tsx`의 비연속 선택과 탐색 상태 분리 |
| 3.7–3.10 | `composite-diff-service.test.ts`, `worktree-preservation.test.ts`, `CompositeResultHeader.tsx`의 최종 결과와 범위 표시 |
| 3.14 | `composite-diff-coordinator.test.ts`, `use-app-controller.test.tsx`의 동일 입력 및 최신 요청 결과 |
| 3.15–3.16 | `CompositeResultHeader.tsx`, `composite-diff-coordinator.ts`, `worktree-preservation.test.ts`의 진행·취소와 상태 보존 |
| 6.3 | `desktop-flow.e2e.ts`의 "shows progress and cancels a calculation that runs past one second" |

## 후속 이슈 연결

| 범위 | 이슈 | 원래 작업 |
| --- | --- | --- |
| 변경 파일 그룹화 | #13 | 4.x |
| 선택 파일의 전체 커밋 흐름 | #14 | 5.x |
| 커밋별 변경 파일 탐색 | #15 | 5.x |
| 부분 통합 결과와 파일별 문제 상태 | #16 | 3.11–3.13 |
| merge commit 기준 부모 | #17 | 3.5–3.6 |
| 조상 관계가 없는 커밋 적용 순서 | #18 | 3.5–3.6 |
| 전체 Git 그래프와 브랜치·태그 탐색 | #22 | 1.1, 2.1, 2.2 |
| 루트 커밋을 빈 저장소 기준으로 비교 | #23 | 3.3, 3.4 |
| 이름 변경 파일을 하나의 비교로 표시 | #24 | 5.7, 5.8 |

## 폐기한 범위

| 범위 | 원래 작업 | 폐기 이유 |
| --- | --- | --- |
| 불완전한 히스토리 안내 | 1.3, 2.4 | 사용자 결정으로 제품 범위에서 제외. 얕은 복제와 누락 자료 진단은 다루지 않는다 |
| 그룹별 변경 파일 탐색 | 4.x 일부 | 사용자 결정으로 제외. 그룹화 자체는 #13에서 다룬다 |
| 요구사항–자동 검증 연결 항목 | 6.1 | 남은 범위를 GitHub 이슈로 분리해 change 내부에서 추적할 대상이 없다 |

## 결론

43개 작업은 완료, 이관 또는 폐기로 모두 정리되었다. 구현된 동작은 메인 스펙
6개 capability에 반영되어 있고 남은 범위는 위 후속 이슈가 추적한다. 따라서 이
change를 아카이빙한다.
