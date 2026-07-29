## Context

`CompositionWorkspaceManager`는 사용자 저장소를 임시 위치로 복제하고, 내용에 영향을
주는 Git 설정을 옮긴 뒤 비교 기준을 checkout한다. 네 단계 중 두 곳에서 판단과 실행이
한 메서드에 섞여 있다.

`applyContentConfiguration`은 설정을 적용하면서 "전체 checkout이 필요한지"를 불리언으로
돌려준다. 호출부는 그 불리언을 `prepareSelectedPaths`의 플래그 매개변수로 그대로
넘긴다. 즉 판단 기준(`EXTERNAL_DRIVER_PATTERN`)과 그 판단을 쓰는 곳 사이에 이름이
하나도 없다.

`file-tree.ts`의 `buildDirectoryTree`는 디렉터리를 `children` 배열과 `directories` 맵에
모두 넣는다. 맵은 같은 디렉터리를 두 번 만들지 않기 위한 것이고 배열은 표시 순서를
위한 것인데, 둘을 손으로 맞춰야 한다.

제약: 동작을 바꾸지 않는다. Git 명령의 종류, 순서와 인자는 그대로 둔다. 설정 탐색
패턴이 잡는 키 집합도 그대로 둔다.

## Goals / Non-Goals

**Goals:**

- 판단의 근거와 판단을 쓰는 곳에 이름을 붙여, 호출부만 읽어도 어떤 준비가 일어나는지
  알 수 있게 한다.
- 설정 탐색 대상 키 목록을 눈으로 읽고 테스트로 고정할 수 있게 한다.
- 트리 구성에서 두 자료 구조를 맞춰야 하는 불변식을 없앤다.

**Non-Goals:**

- 합성 계산의 동작 변경, 성능 최적화, 새 기능
- `git clone --local`의 드라이브 간 복사 비용 개선
- 메인 스펙과 사용자 문서 변경

## Decisions

### 1. 적용 결과를 값으로 돌려주고 판단은 이름 있는 질의로 분리

`applyContentConfiguration`은 "무엇을 적용했는지"만 사실로 돌려주고, "그래서 전체 작업
트리가 필요한지"는 별도 함수가 판단한다.

```
appliedConfiguration: { changedNames: readonly string[] }
needsFullWorkingTree(applied): boolean
```

판단 기준을 `sourceEntries` 전체가 아니라 **실제로 바꾼 키**에서 읽는 현재 동작을
유지한다. 대안으로 `sourceEntries`에 외부 드라이버 키가 있으면 항상 true로 두는 방법을
검토했으나, 워크스페이스가 이미 같은 값을 갖고 있던 경우의 결과가 달라지므로 동작 변경
없음 조건에 맞지 않는다. 이 판단 근거는 코드 주석으로 남긴다.

### 2. 플래그 대신 두 개의 이름 있는 준비 동작

`prepareSelectedPaths(..., requiresFullCheckout, ...)`을 다음 두 메서드로 나눈다.

- `checkoutFullWorkingTree(workspacePath, baseCommit, signal)`
- `checkoutSelectedPaths(workspacePath, baseCommit, changedPaths, signal)`

두 메서드 모두 마지막에 같은 detach checkout을 실행하므로 그 한 줄만 공유하는 private
메서드로 둔다. 분기는 호출부에서 `needsFullWorkingTree`의 결과로 한 번만 한다.

### 3. 설정 키 목록을 자료로 선언하고 패턴을 생성

정확한 키와 드라이버 이름이 들어가는 키를 나눠 선언하고, 리터럴은 escape 하고 `*`만
`.*`로 바꿔 하나의 alternation 패턴을 만든다.

```
CONTENT_CONFIG_KEYS      // core.autocrlf, merge.renormalize 처럼 고정된 키
CONTENT_CONFIG_KEY_GLOBS // merge.*.driver 처럼 이름이 들어가는 키
```

생성된 패턴은 Git의 `--get-regexp`에 그대로 넘어가므로, JS 전용 문법을 쓰지 않고
alternation, `\.`, `.*`, `^`, `$`만 사용한다. 대안으로 패턴을 한 덩어리 문자열로 두고
주석을 붙이는 방법이 있었지만, 그러면 "어떤 키를 잡는가"를 테스트로 고정할 대상이
없어서 자료 선언 쪽을 택했다.

패턴이 잡는 키와 잡지 않아야 하는 키를 단위 테스트로 고정한다. Git ERE와 JS 정규식은
이 부분 문법에서 같은 결과를 주므로 테스트는 JS `RegExp`로 검증하고, 실제 Git 동작은
기존 설정 보존 테스트가 계속 확인한다.

### 4. 삽입 순서를 유지하는 단일 맵

`MutableDirectory`의 `children` 배열과 `directories` 맵을 이름으로 색인되는 하나의
`children: Map<string, MutableNode>`로 합친다. `Map`은 삽입 순서를 유지하므로 표시
순서가 그대로 보존되고, 디렉터리 중복 확인과 자식 추가가 같은 자료를 본다. 최종
`FileTreeNode`는 이 맵에서 파생한다.

같은 디렉터리에 같은 이름의 파일과 디렉터리는 Git 경로 규칙상 동시에 존재할 수 없고
경로는 결과 안에서 유일하므로, 이름 하나를 key로 쓰는 것이 안전하다.

대안으로 배열과 맵을 유지하면서 삽입을 한 메서드로 좁히는 방법이 있었으나, 불변식이
남는 대신 코드만 늘어난다.

## Risks / Trade-offs

- [생성된 패턴이 기존 패턴과 다른 키 집합을 잡을 수 있음] → 기존 패턴이 잡던 키
  전부와 잡지 않던 근접 키를 테스트로 나열해 고정하고, 리팩터링 전후 패턴이 같은
  집합을 잡는지 확인한다.
- [단일 맵 전환이 표시 순서를 바꿀 수 있음] → `Map`의 삽입 순서 보장에 의존하며,
  기존 트리 구성 테스트가 순서를 확인한다. 순서 검증 테스트가 없으면 추가한다.
- [이름 있는 질의로 분리하면서 판단 시점이 달라질 수 있음] → 판단 입력을 "실제로
  바꾼 키"로 명시해 현재 동작과 동일하게 유지하고, 기존 통합 테스트로 확인한다.
