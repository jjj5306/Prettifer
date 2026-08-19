## Context

`Changed Files`는 검토할 파일을 고르는 곳이고, 그 파일의 커밋 이력을 여는 버튼은 화면 반대쪽 activity rail에 있다. 이력을 열면 `CompositeResultHeader`, `Changed Files`와 diff 검토를 담은 검토 영역 전체가 이력 화면으로 바뀌므로 이력을 보는 동안 어떤 파일을 보고 있었는지 화면에 남지 않는다.

renderer는 `activeRegion`으로 activity rail이 가리키는 영역을 추적하고, `fileHistoryStage` 지역 상태로 이력 목록과 커밋 변경 내용 중 무엇을 보여줄지 정한다. 이력 목록이 보이는 동안 `DiffPane`이 unmount되므로 선택 결과 diff의 스크롤과 커서 위치를 담은 참조도 함께 사라진다.

앱 버전은 renderer가 알 수 없다. renderer는 Node.js와 Electron 모듈을 쓰지 않고 preload가 공개한 typed API만 호출한다.

## Goals / Non-Goals

**Goals:**

- 선택 파일의 이력을 고른 자리 옆에서 열기
- 이력과 커밋 변경 내용을 diff 검토 영역에 표시하고 `Changed Files` 목록 유지
- 커밋 변경 내용 → 파일 이력 → 선택 결과 diff의 단계별 복귀
- 선택 결과로 돌아갈 때 diff 레이아웃, 스크롤과 커서 위치 복원
- activity rail을 Repository와 About Prettifer 두 항목으로 정리
- 앱 이름, 버전, 소개와 저장소 주소를 담은 소개 화면 제공
- 보기 토글 네 개와 diff 검토 화면 제목을 각각 구분되는 표현으로 정리

**Non-Goals:**

- 파일 이력 조회 범위, 정렬, 페이지 추가와 이름 변경 계보 동작 변경
- 그룹 규칙 편집 기능 변경. Config View의 기존 진입점을 유지한다
- diff 좌우·인라인 보기 전환 동작 변경
- 소개 화면에 업데이트 확인, 라이선스 전문이나 외부 링크 열기 추가

## Decisions

### 이력 진입점은 `Changed Files` 머리글의 별도 컨트롤

File History 컨트롤은 보기 토글 오른쪽에 자체 그룹으로 둔다. 보기 토글은 패널이 무엇을 나열하는지 고르는 `aria-pressed` 컨트롤이고, File History는 검토 영역을 바꾸는 동작이므로 같은 그룹에 넣으면 선택 상태의 의미가 섞인다.

선택 파일이 없으면 컨트롤을 `aria-disabled`로 표시하고 클릭 처리의 첫 단계에서 실행을 막는다. native `disabled` 버튼은 포커스를 받을 수 없어 왜 쓸 수 없는지 키보드로 확인할 수 없다. 이는 activity rail이 이미 쓰는 방식과 같다.

### 검토 화면은 기존 상태에서 계산한다

무엇을 보여줄지는 `fileHistory`와 `fileCommit` 상태에서 구한다. `fileHistory`가 `idle`이 아니면 검토 열은 파일 이력을, 그 위에 `fileCommit`까지 있으면 커밋 변경 내용을 표시한다. 단계를 따로 저장하는 `fileHistoryStage`는 제거한다. 같은 의미의 값을 두 곳에 두면 "이력을 닫았는데 단계는 커밋"처럼 서로 모순되는 조합이 생긴다.

선택 결과로 돌아가려면 `fileHistory`를 다시 `idle`로 만들어야 하므로 `fileHistory/closed` 액션과 `closeFileHistory` 동작을 추가한다. 파일을 다시 고르면 기존 `file/selected`가 이미 두 상태를 함께 비우므로 별도 처리는 필요하지 않다.

### activity rail은 영역 이동과 소개 화면만 담당

rail 항목은 Repository 하나이고, About Prettifer는 영역이 아니라 화면을 여는 동작이므로 `WorkbenchRegion`이 아닌 별도 콜백으로 다룬다. 파일 이력 진입은 `Changed Files` 머리글로 옮기지만 `activeRegion`은 그대로 사용한다. 이력을 열면 `fileHistory` 영역이 현재 영역이 되고, 그 표시로 `FileHistoryPane`이 포커스를 되돌릴 위치를 판단한다.

`rules`는 rail 항목으로만 존재했으므로 `WorkbenchRegion`에서 제거한다. 남은 영역은 모두 자기 패널을 하나씩 가지므로 `rules`를 `files`로 접던 `currentPanel`도 제거하고 `currentRegion` 하나만 남긴다.

### 소개 화면은 native `<dialog>`

`showModal()`로 열면 포커스 잡기, Escape 닫기와 닫은 뒤 포커스 복원을 브라우저가 처리한다. 직접 만든 오버레이는 같은 동작을 다시 구현해야 하고 빠뜨리기 쉽다. 열림 여부는 renderer 상태로 두고, 그 상태를 DOM 요소의 `showModal()`과 `close()`에 맞추는 데만 effect를 쓴다.

### 앱 버전은 main이 읽고 preload 계약으로 전달

버전은 Electron `app.getVersion()`이 가진 값이므로 main에서 읽고 `readAppInfo` 요청으로 전달한다. renderer 번들에 빌드 시점 상수를 심는 대안은 renderer webpack 설정과 테스트 실행기 양쪽에 같은 정의를 두어야 하고, 실제 실행 중인 앱의 버전이 아니라 번들을 만든 시점의 값을 보여준다.

조회에 실패하면 소개 화면은 이름, 소개와 저장소 주소를 계속 표시하고 버전만 확인할 수 없음을 알린다. 소개 화면은 검토 흐름과 무관하므로 실패가 다른 화면을 막지 않아야 한다.

### 선택 결과 diff의 위치는 화면 밖에 보관

이력 목록이 보이는 동안 `DiffPane`은 unmount되므로 저장한 편집기 위치를 컴포넌트 안의 ref에 두면 복귀할 때 잃는다. 위치는 `repositorySessionId`, 요청 ID와 경로를 키로 하는 모듈 수준 맵에 보관한다. `FileHistoryPane`이 목록 스크롤 위치를 같은 방식으로 보관하고 있어 두 화면이 같은 규칙을 따른다.

### 보기 토글 아이콘과 검토 화면 제목

`ViewIcon`은 네 보기를 모두 분기해 Config View는 규칙 그룹, Full Tree는 저장소 뿌리에서 뻗는 구조를 나타내는 서로 다른 도형을 쓴다. 지금은 Config View와 Full Tree가 같은 기본 분기를 공유해 같은 아이콘을 그린다.

diff 검토 화면의 기본 제목은 `Differentia Codicis`로 바꾼다. 추가 파일, 이름 변경 파일과 파일 이력 커밋 화면의 제목은 검토 대상 자체를 가리키므로 그대로 둔다.

## Risks / Trade-offs

- [Escape 한 번으로 선택 결과까지 돌아가던 계약이 두 단계로 바뀜] → 명세 시나리오와 키보드 테스트를 함께 고쳐 두 단계 복귀를 검증한다.
- [머리글에 컨트롤이 하나 늘어 좁은 창에서 제목과 개수가 밀릴 수 있음] → File History 컨트롤을 아이콘 한 칸 폭으로 두고 좁은 폭에서 제목이 줄어드는지 확인한다.
- [모듈 수준 맵에 편집기 위치가 남음] → 키에 저장소 세션과 요청 ID를 포함해 다른 세션이나 다른 결과의 위치를 복원하지 않는다.
- [소개 화면 때문에 main 프로세스 요청이 하나 늘어남] → 입력이 없는 읽기 전용 요청으로 두고 기존 요청과 같은 방식으로 발신 화면을 검증한다.
- [`aria-disabled` 컨트롤이 Tab 순서에 남음] → 쓸 수 없는 이유를 키보드로 확인해야 하는 요구사항을 우선하고, 실행이 막히는지 단위 테스트로 보호한다.
