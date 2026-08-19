## 1. 이력 진입점 이동

- [ ] 1.1 `Changed Files` 머리글의 File History 컨트롤 위치, 이름과 사용 조건을 검증하는 실패 renderer 테스트를 작성한다
- [ ] 1.2 선택 파일이 없을 때 컨트롤이 실행되지 않고 조건을 안내하는 실패 테스트를 작성한다
- [ ] 1.3 File History 컨트롤을 보기 토글과 구분되는 그룹으로 머리글에 추가한다
- [ ] 1.4 컨트롤 실행이 선택 파일의 이력 조회를 시작하고 이력 목록으로 포커스를 옮기게 한다

## 2. 검토 영역의 이력 흐름

- [ ] 2.1 이력과 커밋 변경 내용이 검토 열에 표시되고 `Changed Files` 목록이 유지되는 실패 renderer 테스트를 작성한다
- [ ] 2.2 커밋 변경 내용 → 파일 이력 → 선택 결과 diff의 단계별 복귀를 검증하는 실패 테스트를 작성한다
- [ ] 2.3 `fileHistory/closed` 액션과 `closeFileHistory` 동작을 추가한다
- [ ] 2.4 `fileHistoryStage` 지역 상태를 제거하고 검토 화면을 `fileHistory`, `fileCommit` 상태에서 계산한다
- [ ] 2.5 선택 결과 diff의 편집기 위치를 화면 밖 저장소로 옮겨 이력에서 돌아올 때 복원한다
- [ ] 2.6 키보드로 이력 목록과 커밋 변경 내용을 오가는 두 단계 Escape 복귀를 구현한다

## 3. Activity Rail 정리와 소개 화면

- [ ] 3.1 rail이 Repository와 About Prettifer만 제공하는 실패 renderer 및 접근성 테스트를 작성한다
- [ ] 3.2 소개 화면의 내용, 키보드 열기·닫기와 포커스 복원을 검증하는 실패 테스트를 작성한다
- [ ] 3.3 버전 조회 실패에도 나머지 소개 내용이 표시되는 실패 테스트를 작성한다
- [ ] 3.4 rail에서 File History와 Group Rules 항목을 제거하고 About Prettifer 항목을 추가한다
- [ ] 3.5 `WorkbenchRegion`에서 `rules`를 제거하고 `currentPanel`을 정리한다
- [ ] 3.6 `readAppInfo` 요청을 shared 계약, main 핸들러와 preload API에 추가한다
- [ ] 3.7 native `<dialog>`로 소개 화면을 구현하고 renderer 상태와 동기화한다

## 4. 문구와 아이콘 정리

- [x] 4.1 diff 검토 화면 제목이 `Differentia Codicis`인 실패 테스트를 작성한다
- [x] 4.2 네 보기 토글이 서로 다른 아이콘을 표시하는 실패 테스트를 작성한다
- [x] 4.3 검토 화면 기본 제목을 변경하고 추가·이름 변경·이력 커밋 화면 제목은 유지한다
- [x] 4.4 `ViewIcon`이 네 보기를 각각 분기하도록 Config View와 Full Tree 아이콘을 나눈다

## 5. 검증 및 마무리

- [ ] 5.1 변경 파일, 파일 이력, activity rail과 diff 검토 단위·접근성 테스트를 통과시킨다
- [ ] 5.2 파일 선택 → 이력 → 커밋 변경 → 복귀 흐름의 Electron 테스트를 갱신한다
- [ ] 5.3 lint, type check, 전체 테스트, OpenSpec strict 검증과 패키징을 실행한다
- [ ] 5.4 이슈 #99의 진행 상태와 검증 결과를 갱신한다
