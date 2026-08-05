## Why

Commit History의 초기화 두 개가 화면의 서로 다른 곳에 떨어져 있다. 선택 초기화는 제목 줄의
`N selected` 뒤에 붙어 제목과 상태 표시 사이에 끼어 있고, 불러온 커밋 초기화는 `Load 100 older
commits` 옆의 별도 칸에 놓인다. 같은 성격의 되돌리기인데 한눈에 묶여 보이지 않는다.

두 컨트롤 모두 글자 라벨이라 자리도 넓게 차지한다. Commit History는 높이가 고정된 가로 바여서
커밋 카드가 쓸 수 있는 폭이 그만큼 줄어든다.

## What Changes

- 두 초기화를 Commit History 제목 줄의 한 동작 묶음으로 모은다.
- 글자 라벨을 아이콘으로 바꾼다.
- 마우스를 올리면 그 초기화가 무엇을 되돌리고 무엇을 남기는지 설명이 나타난다.
- 아이콘만 있는 버튼을 이름으로 구별할 수 있게 한다.
- 되돌릴 것이 없으면 감추는 규칙은 그대로 둔다.

## Capabilities

### New Capabilities

없음. 이미 정의된 두 초기화의 표시 방식만 정한다.

### Modified Capabilities

- `desktop-repository-navigation`: 두 초기화가 놓이는 자리와 표시 형태가 요구사항으로 정해진다.

## Impact

- `src/desktop/renderer/history/CommitHistoryPane.tsx`: 초기화 두 개를 제목 줄의 동작 묶음으로 이동
- `src/desktop/renderer/history/CommitHistoryPane.module.css`: 동작 묶음과 아이콘 버튼 크기
- 초기화의 동작은 바뀌지 않는다. 상태와 컨트롤러는 건드리지 않는다
