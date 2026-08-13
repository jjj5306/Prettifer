## 1. 도움말 계약 테스트

- [x] 1.1 Activity Rail 항목의 이름, 동작 설명과 접근성 연결을 검증하는 실패 renderer 테스트를 작성한다
- [x] 1.2 사용할 수 없는 항목이 선행 조건을 설명하고 실행되지 않는 실패 테스트를 작성한다
- [x] 1.3 마우스 호버와 키보드 포커스에서 도움말이 표시되는 실패 Electron 테스트를 작성한다

## 2. Activity Rail 도움말 구현

- [x] 2.1 항목별 기본 동작 설명과 비활성 조건 설명을 Activity Rail 메타데이터에 추가한다
- [x] 2.2 버튼과 도움말을 안정적인 ID 및 aria-describedby로 연결한다
- [x] 2.3 비활성 항목을 aria-disabled로 표시하고 클릭 및 키보드 실행을 차단한다
- [x] 2.4 호버와 포커스에서 도움말을 Activity Rail 오른쪽에 표시하는 스타일을 추가한다

## 3. 검증 및 문서화

- [x] 3.1 renderer 및 접근성 테스트를 통과시키고 기존 Activity Rail 이동 동작의 회귀가 없는지 확인한다
- [x] 3.2 패키징된 Electron 앱에서 세 도움말과 비활성 조건 안내를 검증한다
- [x] 3.3 lint, type check, 전체 테스트, build와 OpenSpec strict 검증을 실행한다
- [x] 3.4 이슈 #96의 진행 상태와 검증 결과를 갱신한다

## 4. Activity Rail 진입점 단순화

- [x] 4.1 Activity Rail이 Repository, File History와 Group Rules만 제공하는 실패 renderer 및 접근성 테스트를 작성한다
- [x] 4.2 두 번째 File History 버튼과 독립 화면 진입 흐름을 검증하는 실패 Electron 테스트를 작성한다
- [x] 4.3 Commit History, Changed Files와 Diff Review 레일 항목을 제거하고 File History를 두 번째 위치와 이력 아이콘으로 이동한다
- [x] 4.4 File History 진입과 복귀 과정에서 선택 및 diff 상태를 보존한다
- [x] 4.5 관련 테스트, 전체 검증과 이슈 #96 진행 상태를 새 범위에 맞게 갱신한다

## 5. 선택 변경 파일의 File History 흐름

- [x] 5.1 선택 결과와 선택 파일을 File History 선행 조건으로 검증하는 실패 renderer 테스트를 작성한다
- [x] 5.2 변경 파일 선택 → 파일 이력 → 커밋 변경 내용의 실패 Electron 테스트를 작성한다
- [x] 5.3 전체 파일 선택 단계와 비교 대상 파일 트리용 API 확장을 제거한다
- [x] 5.4 선택 파일의 이력과 커밋 변경 내용을 전체 폭의 2단계 화면으로 구현한다
- [x] 5.5 짧은 파일 이력을 상단 콘텐츠 높이로 배치하고 선택 결과 복귀 동작을 구현한다
- [x] 5.6 관련 테스트, 전체 검증과 이슈 #96 및 PR #97을 새 범위에 맞게 갱신한다
