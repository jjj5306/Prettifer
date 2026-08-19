## 1. 파일 이력 계약과 검증 자료

- [x] 1.1 파일 이력 페이지, commit 변경, rename 경계, partial 상태와 진단 DTO의 실패 테스트를 shared contract에 추가한다
- [x] 1.2 파일 생성·수정·rename·삭제 후 재생성·merge·바이너리·100개 초과 이력을 만드는 Git fixture와 검증 테스트를 추가한다
- [x] 1.3 얕은 복제와 누락 객체 실패를 재현하는 fixture 또는 Git runner 경계 테스트를 추가한다

## 2. main 파일 이력 서비스

- [x] 2.1 대상 HEAD에서 도달 가능한 단일 파일 계보를 100개씩 조회하고 오래된 순서 자료를 반환하는 실패 통합 테스트를 작성한다
- [x] 2.2 50% 유사도와 1,000개 후보 상한으로 rename을 연결하고 삭제 후 재생성을 분리하는 실패 통합 테스트를 작성한다
- [x] 2.3 merge의 선택 mainline 또는 기본 첫 부모 기준과 부모 미지정 진단의 실패 테스트를 작성한다
- [x] 2.4 텍스트 commit diff와 바이너리 변경 메타데이터를 읽는 실패 테스트를 작성한다
- [x] 2.5 얕은 복제의 partial 결과와 신뢰할 수 없는 Git 실패 진단의 실패 테스트를 작성한다
- [x] 2.6 파일 이력 서비스가 2.1–2.5의 조회, 계보, merge, binary와 오류 테스트를 통과하도록 구현한다

## 3. 파일별 합성 기여 출처

- [x] 3.1 정상 적용, 충돌 제외, 이후 덮어쓰기와 되돌림에서 파일별 기여 커밋을 검증하는 실패 테스트를 작성한다
- [x] 3.2 rename 계보와 merge mainline을 포함한 파일별 정상 적용 및 문제 출처를 합성 결과에 기록한다
- [x] 3.3 composite 결과 DTO와 schema에 readonly 파일별 기여 출처를 추가하고 기존 합성·부분 결과 회귀 테스트를 통과시킨다

## 4. 데스크톱 프로세스 경계

- [x] 4.1 저장소 세션, revision, range, 대상 HEAD, 경로, page token과 mainline 입력 검증의 실패 테스트를 작성한다
- [x] 4.2 파일 이력 목록, 추가 페이지, commit 변경 조회와 취소 handler를 main controller와 IPC 등록에 구현한다
- [x] 4.3 preload가 사용자 동작별 typed 파일 이력 함수만 공개하고 임의 채널이나 Electron 객체를 노출하지 않는 테스트를 추가한다
- [x] 4.4 저장소·범위·파일 변경과 취소 뒤 오래된 main 응답이 폐기되는 경계 테스트를 통과시킨다

## 5. renderer 상태와 controller

- [x] 5.1 idle, loading, ready, partial, error, pagination과 cache identity 상태 전이의 실패 reducer 테스트를 작성한다
- [x] 5.2 File History를 열 때만 조회하고 같은 세션·HEAD·계보를 재사용하는 controller 실패 테스트를 작성한다
- [x] 5.3 파일·범위·저장소 변경 시 요청 취소와 identity가 다른 응답 폐기를 구현하고 테스트를 통과시킨다
- [x] 5.4 composite와 historyCommit 검토 모드 전환이 파일 및 통합 선택 상태를 바꾸지 않는 selector와 reducer 테스트를 작성하고 구현한다

## 6. File History 탐색 화면

- [x] 6.1 Activity Rail의 File History 활성 조건, 현재 영역 표시와 Changed Files 패널 전환의 실패 renderer 테스트를 작성한다
- [x] 6.2 File History 패널의 시간순 목록, 경로 변경, 기여·문제·partial·loading·error·pagination 상태를 렌더링한다
- [x] 6.3 위·아래, Home, End, Enter, Space와 Escape 조작 및 roving tabindex의 실패 접근성 테스트를 작성하고 구현한다
- [x] 6.4 페이지 추가와 패널 전환 뒤 전체 commit ID 기준 포커스 및 목록 스크롤 복원을 테스트하고 구현한다
- [x] 6.5 1280×720, 200% 확대, forced-colors와 좁은 화면에서 파일 이력과 diff에 접근 가능한 반응형 스타일 테스트를 추가한다

## 7. 커밋별 diff와 상태 복원

- [x] 7.1 텍스트, 추가, 삭제, rename, merge와 바이너리 commit 변경 표시의 실패 DiffPane 테스트를 작성한다
- [x] 7.2 파일 이력 commit 변경을 같은 diff 영역에 읽기 전용으로 표시하고 기준 부모와 binary 안내를 제공한다
- [x] 7.3 Monaco adapter의 view state snapshot·restore 실패 테스트를 작성하고 diff 레이아웃, 스크롤과 커서 복원을 구현한다
- [x] 7.4 통합 결과 복귀 뒤 선택 파일, diff identity, File History 포커스와 스크롤이 유지되는 renderer 통합 테스트를 통과시킨다

## 8. 통합 검증과 문서

- [x] 8.1 실제 Git 저장소에서 파일 선택, rename 계보, 기여 상태, commit diff와 통합 결과 복귀를 검증하는 데스크톱 통합 테스트를 추가한다
- [x] 8.2 키보드만으로 File History를 열고 commit 변경을 검토한 뒤 원래 diff 위치로 돌아오는 E2E 테스트를 추가한다
- [x] 8.3 얕은 복제 partial 안내, binary 메타데이터와 오래된 응답 격리의 요구사항별 회귀 테스트를 실행한다
- [x] 8.4 README 또는 사용자 문서에 File History 진입, 범위, rename·partial 기준과 키보드 조작을 반영한다
- [x] 8.5 OpenSpec strict 검증, 관련 unit·integration·renderer·E2E 테스트, lint, type check와 build를 실행하고 tasks 상태를 실제 결과와 일치시킨다
