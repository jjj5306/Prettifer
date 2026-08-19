## Context

현재 데스크톱 앱은 비교 범위의 first-parent 커밋 목록과 사용자가 선택한 커밋의
통합 결과를 제공한다. renderer는 선택 파일과 통합 결과 diff를 관리하고, Git과
파일 시스템 접근은 typed preload API 뒤의 main 프로세스에서 수행한다. 이 변경은
대상 브랜치 HEAD에서 도달 가능한 선택 파일의 이력, rename 계보와 커밋별 diff를
추가하면서 기존 합성 선택 및 Monaco 탐색 상태를 보존해야 한다.

파일 이력은 큰 저장소와 얕은 복제에서도 사용할 수 있어야 하고, 파일·범위·저장소
전환 중 늦게 끝난 요청이 현재 상태를 덮지 않아야 한다. rename 판정은 현재 합성
결과와 같은 50% 유사도 및 1,000개 후보 상한을 사용한다.

## Goals / Non-Goals

**Goals:**

- 대상 브랜치의 선택 파일 계보를 오래된 순서로 페이지 탐색한다.
- rename 경로를 연결하고 삭제 후 재생성된 파일을 분리한다.
- 합성 과정에서 해당 파일에 정상 적용된 선택 커밋과 문제 커밋을 구분한다.
- 같은 diff 영역에서 커밋별 변경을 검토하고 통합 결과의 정확한 탐색 상태로 돌아간다.
- 얕은 복제의 확인 가능한 결과와 오래된 비동기 응답을 명시적으로 다룬다.
- renderer가 Node.js나 Electron 모듈에 직접 의존하지 않는 기존 보안 경계를 유지한다.

**Non-Goals:**

- 다른 브랜치에만 존재하는 커밋과 저장소 전체 Git 그래프 탐색
- 삭제 후 재생성된 파일의 내용 기반 계보 추정
- merge commit의 모든 부모를 비교하는 UI
- 바이너리 미리보기 또는 외부 비교 도구 실행
- 커밋 되돌리기, 적용 또는 저장소 전체 파일 이력 검색

## Decisions

### main 프로세스에 파일 이력 경계를 둔다

새 파일 이력 서비스가 Git 조회, rename 계보, 얕은 복제 판정과 커밋별 blob
메타데이터를 담당한다. desktop controller는 저장소 세션, revision, 요청 세대,
대상 HEAD와 경로를 검증한 뒤 서비스에 전달하고, preload는 사용자 동작별 typed
함수만 공개한다. renderer에서 Git 명령을 조합하는 대안은 보안 경계와 요청 검증을
약화하므로 사용하지 않는다.

### 대상 HEAD와 단일 파일 계보를 100개씩 조회한다

조회 기준은 range에 고정된 대상 HEAD commit과 현재 파일 경로다. Git rename 추적은
`--find-renames=50%`와 후보 상한 1,000을 명시하며, 각 페이지는 다음 항목 존재 여부를
확인하기 위해 101개까지 읽고 최대 100개를 반환한다. 누적 결과는 renderer에서
오래된 커밋부터 표시한다. 저장소 전체 그래프를 먼저 읽는 대안은 파일 하나를
검토하는 비용과 응답 시간을 불필요하게 키우므로 사용하지 않는다.

### rename만 같은 계보로 연결한다

각 항목은 커밋 시점의 이전·현재 경로와 변경 상태를 가진다. Git이 rename으로
확인한 경로만 앞선 항목과 연결하고, 삭제 뒤 같은 경로로 생성된 항목에서 현재
계보를 끝낸다. 후보 상한이나 유사도 때문에 연결하지 못한 경우에는 계보 경계를
반환한다. 내용 해시나 이름 유사도로 과거 파일을 추정하는 대안은 서로 다른 파일을
하나로 오인할 수 있어 사용하지 않는다.

### 합성 결과가 파일별 적용 출처를 제공한다

합성 과정은 선택 커밋을 순서대로 적용할 때 파일 계보별 정상 적용 커밋과 충돌로
제외된 커밋을 기록한다. 최종 결과 DTO는 선택 파일의 `contributingCommits`와 문제
커밋을 파일 이력 상태와 결합할 수 있게 제공한다. 최종 줄만 남았는지 다시 계산하는
대안은 되돌림과 덮어쓰기를 합성 과정에서 참여하지 않은 것으로 오해하고, 커밋마다
제외 합성을 반복해야 하므로 사용하지 않는다.

### merge 비교 부모는 합성 선택과 일치시킨다

선택된 merge commit은 합성에 지정한 mainline 부모를 사용하고, 선택되지 않은 merge
commit은 첫 번째 부모를 기본으로 사용해 그 기준을 DTO와 화면에 표시한다. 선택된
merge에 mainline 부모가 없으면 커밋별 diff 요청을 거부하고 Commit History에서 부모를
정하도록 진단한다. 파일 이력 안에 별도 부모 선택기를 두는 대안은 동일 커밋에 두
개의 서로 다른 선택 상태를 만든다.

### 탐색 패널 전환과 diff 검토 모드를 분리한다

Activity Rail의 File History는 왼쪽 Changed Files 자리를 같은 폭으로 전환한다.
파일 이력 커밋 실행은 오른쪽 영역의 `composite`와 `historyCommit` 검토 모드만 바꾸며,
선택 파일과 선택 커밋 상태는 변경하지 않는다. 커밋별 diff를 별도 창에 여는 대안은
한 화면 검토와 기존 반응형 작업 흐름을 깨뜨리므로 사용하지 않는다.

### 통합 diff와 파일 이력 위치를 명시적으로 보존한다

historyCommit 모드에 들어가기 전에 Monaco의 view state, diff 레이아웃과 현재 파일
식별자를 저장한다. 복귀 시 동일한 통합 결과 identity에 view state를 복원한다.
File History 목록은 안정적인 전체 commit ID를 key로 사용하고 roving tabindex의 현재
commit ID 및 scroll 위치를 보존한다. 컴포넌트를 숨긴 채 두 editor를 계속 유지하는
대안은 메모리 사용과 model 수명을 불필요하게 늘리므로 상태 snapshot과 복원을
사용한다.

### 요청 identity와 제한된 캐시로 오래된 응답을 격리한다

파일 이력 상태는 repositorySessionId, sessionRevision, rangeRevision, headCommit,
lineage path와 requestId를 identity로 사용한다. File History를 열 때만 조회하고,
동일 identity의 확인된 페이지와 탐색 위치를 세션 동안 재사용한다. 파일·범위·저장소
변경은 진행 중 요청을 취소하고 identity가 다른 응답을 폐기한다. 전역 또는 디스크
캐시는 branch 이동과 저장소 변경에서 오래된 자료를 재사용할 위험이 있어 두지 않는다.

### 부분 이력과 신뢰할 수 없는 실패를 구분한다

얕은 저장소 여부를 확인해 Git이 반환한 경계까지의 이력을 `partial`로 제공하고,
원인과 fetch 안내를 함께 반환한다. 객체 누락이나 손상처럼 페이지 전체의 신뢰성을
확인할 수 없는 Git 실패는 성공 항목과 섞지 않고 진단으로 반환한다. 실패 전 stdout을
부분 결과로 채택하는 대안은 완전한 commit record와 rename 경계를 보장하지 못한다.

### 바이너리는 메타데이터만 전달한다

커밋별 변경 조회는 binary 판정 시 blob 내용을 renderer로 전달하지 않고 상태, 두
경로, 비교 부모와 확인 가능한 blob 크기만 반환한다. 기존 통합 diff와 같은 방식으로
텍스트 해석을 피하며, 바이너리 미리보기는 별도 capability로 남긴다.

## Risks / Trade-offs

- [Git의 rename heuristic이 실제 파일 정체성과 다를 수 있음] → 합성 결과와 같은
  고정 기준을 사용하고 계보 경계와 rename 경로를 사용자에게 표시한다.
- [긴 파일 이력의 반복 조회가 느릴 수 있음] → 패널을 열 때만 100개씩 조회하고 같은
  HEAD와 계보의 페이지를 세션 캐시에 보관한다.
- [페이지 경계의 rename 연결이 어긋날 수 있음] → 각 페이지 요청이 HEAD와 현재 경로를
  기준으로 계보를 재현하고 경계 token을 검증한다.
- [파일별 적용 출처 기록이 합성 결과 계약을 넓힘] → readonly DTO와 schema 검증을
  추가하고 기존 결과 소비자는 새 필드를 한 곳의 selector에서 해석한다.
- [Monaco view state 복원이 model 교체 시 실패할 수 있음] → 통합 결과 identity와 파일
  path를 함께 검증하고 adapter 단위 테스트 및 E2E로 스크롤·커서 복귀를 보호한다.
- [얕은 복제 안내가 전체 이력처럼 오인될 수 있음] → partial 상태를 목록과 같은
  맥락에 지속적으로 표시하고 fetch 다음 행동을 제공한다.

## Migration Plan

새 계약 필드와 handler를 main, shared, preload, renderer 순서로 추가한 뒤 기존 화면에
File History 진입점을 연결한다. 기존 저장 자료의 변환은 없다. 문제가 생기면 새
Activity Rail 항목과 파일 이력 handler를 제거하면 기존 Commit History, Changed Files와
통합 diff 흐름으로 되돌릴 수 있다.

## Open Questions

없음.
