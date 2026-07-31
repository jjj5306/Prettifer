## Context

`.file`, `.selectedFile`, `.directory`가 `width: 100%`를 갖는다. 두 보기가 같은 클래스를 쓰기
때문에, List View에 맞는 전체 너비 행이 Tree View에도 그대로 적용된다.

List View는 평평한 목록이라 전체 너비 행이 스캔하기 쉽다. Tree View는 들여쓰기와 안내선으로
계층을 읽으므로 행이 내용만큼만 차지해야 구조가 드러난다.

## Goals / Non-Goals

**Goals:**

- Tree View 행이 내용 너비만큼만 차지하게 한다.
- 긴 이름이 영역을 넘지 않게 한다.

**Non-Goals:**

- List View 행 너비 변경
- 계층 안내선, 접기 동작, 선택 표시 변경

## Decisions

### 1. 보기별로 너비 규칙을 나눈다

`.tree` 조상을 붙인 규칙으로 Tree View만 `width: fit-content`를 쓴다. 선택자에 클래스가 둘이라
기존 `.file`의 `width: 100%`를 특이도로 이긴다.

```
.tree .directory, .tree .file, .tree .selectedFile { width: fit-content; max-width: 100%; }
```

`max-width: 100%`가 긴 이름의 상한이다. `.path`가 이미 `overflow: hidden`과 ellipsis를 갖고
있어 잘림 표시는 그대로 동작한다.

대안으로 `justify-self: start`를 검토했다. 행이 grid 항목이므로 배치는 되지만, 행 내부가
`grid-template-columns: 1.25rem minmax(0, 1fr)`이어서 `1fr`이 남은 공간을 계속 채운다. 너비
자체를 내용에 맞추는 쪽이 의도를 직접 표현한다.

### 2. 선택 표시가 좁아지는 것을 받아들인다

행이 좁아지면 선택 배경과 왼쪽 강조선도 이름 길이만큼만 그려진다. 이것이 요청된 모습이며,
계층에서 어느 항목이 선택됐는지는 여전히 배경과 강조선으로 구분된다.

## Risks / Trade-offs

- [클릭 영역이 이름 길이로 줄어든다] → 짧은 이름의 행은 클릭 대상이 작아진다. 행 높이
  `1.9rem`은 그대로이므로 세로 여유는 유지된다. 요청된 동작이라 그대로 둔다.
- [List View와 Tree View의 행 모양이 달라진다] → 의도된 차이다. 두 보기의 목적이 다르다는 것을
  design과 스펙에 남긴다.
