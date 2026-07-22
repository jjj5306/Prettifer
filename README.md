# Prettifer

사람과 AI 에이전트가 선택한 Git 변경을 검토할 수 있도록 최종 파일 상태와
통합 diff를 만드는 도구입니다.

## Initial UX Mockup

이 목업은 Git 그래프에서 커밋을 선택하고, 변경 파일을 묶어 최종 결과를
좌우 diff로 검토하는 초기 제품 방향을 보여 줍니다. 화면 구성은 명세와 구현이
진행되면서 달라질 수 있습니다.

![Prettifer initial UX mockup](docs/assets/prettifer-initial-ux-mockup.png)

## Core

현재 코어는 하나의 선형 브랜치 이력에서 서로 떨어진 커밋을 선택하고, 선택한
변경만 반영된 최종 파일 상태와 하나의 통합 diff를 생성합니다. 계산은 분리된
임시 Git 작업 공간에서 실행되므로 사용 중인 브랜치, staged 변경, unstaged 변경과
untracked 파일을 그대로 유지합니다.

현재 실행 방법은 빌드 결과의 코어 클래스를 불러오는 개발자용 예제입니다.
공개 API의 호환성과 CLI 형식은 아직 보장되지 않습니다.

## Quick Start

### 1. 준비 사항

- Node.js `20.19+`, `22.13+` 또는 `24+`
- Git `2.30+`
- 분석할 로컬 Git 저장소

버전을 확인합니다.

```powershell
node --version
git --version
```

### 2. 설치와 빌드

Prettifer 저장소 루트에서 다음 명령을 실행합니다.

```powershell
npm ci
npm run build
```

빌드가 끝나면 `dist/index.js`와 실행 예제
`examples/compose-selected-commits.mjs`를 사용할 수 있습니다.

### 3. 분석할 커밋 선택

다음 값은 예시입니다. `$TargetRepo`, `$BaseRef`와 `$HeadRef`를 실제 저장소에
맞게 바꿉니다.

```powershell
$TargetRepo = 'C:\work\my-repository'
$BaseRef = 'main'
$HeadRef = 'feature/my-work'

git -C $TargetRepo log --oneline --reverse "$BaseRef..$HeadRef"
```

출력에서 합성할 커밋 해시를 고릅니다. 비연속 선택을 확인하려면 두 선택 커밋
사이에 선택하지 않을 커밋이 하나 이상 있도록 고릅니다.

```powershell
$FirstCommit = '첫-번째-커밋-해시'
$SecondCommit = '두-번째-커밋-해시'
```

선택한 커밋은 모두 기준 브랜치와 작업 브랜치의 공통 조상보다 뒤에 있어야 하며,
`$HeadRef`에서 접근할 수 있는 하나의 조상 관계에 있어야 합니다.

### 4. 통합 결과 생성

Prettifer 저장소 루트에서 실행합니다.

```powershell
node .\examples\compose-selected-commits.mjs `
  $TargetRepo `
  $BaseRef `
  $HeadRef `
  $FirstCommit `
  $SecondCommit
```

선택 해시는 명령 끝에 더 추가할 수 있습니다. 입력 순서는 결과에 영향을 주지
않으며, 코어가 조상 관계에 따라 오래된 커밋부터 적용합니다.

### 5. 결과 확인

명령은 먼저 JSON 형식의 파일 결과를 출력한 뒤 `--- unified diff ---` 아래에
통합 diff를 출력합니다.

```text
{
  "baseCommit": "...",
  "selectedCommits": ["...", "..."],
  "files": [
    {
      "path": "src/example.ts",
      "status": "modified",
      "beforeContent": "...",
      "afterContent": "..."
    }
  ]
}

--- unified diff ---
diff --git a/src/example.ts b/src/example.ts
...
```

`files`에는 선택한 변경을 모두 합성한 최종 파일 상태가 한 번씩 나타납니다.
선택하지 않은 커밋만 만든 변경은 결과에 포함되지 않습니다.

## Usage Manual

### 입력값

| 값 | 설명 |
|---|---|
| `repositoryPath` | 분석할 로컬 Git 저장소의 절대 경로 |
| `baseRef` | 비교 기준을 찾는 기준 브랜치 또는 커밋. 보통 `main`을 사용 |
| `headRef` | 선택 가능한 커밋이 포함된 작업 브랜치 또는 커밋 |
| `selectedCommits` | 합성할 커밋 해시 목록. 하나 이상 필요 |

코어는 `baseRef`와 `headRef`의 공통 조상을 실제 비교 기준으로 사용합니다.
커밋 선택이 바뀌어도 같은 저장소 상태와 두 ref가 유지되면 비교 기준도 같습니다.

### 결과값

| 값 | 설명 |
|---|---|
| `baseCommit` | 계산에 사용한 공통 조상의 전체 커밋 해시 |
| `selectedCommits` | 조상 순서로 정렬되고 전체 해시로 확인된 선택 목록 |
| `files` | 비교 기준에서 달라진 파일의 최종 상태 목록 |
| `unifiedDiff` | 비교 기준과 최종 합성 상태 사이의 Git 통합 diff |

각 파일 결과는 다음 값을 제공합니다.

| 값 | 설명 |
|---|---|
| `path` | 저장소 루트 기준 파일 경로 |
| `status` | `added`, `modified`, `deleted` 중 하나 |
| `beforeContent` | 비교 기준의 파일 내용. 추가 파일은 `null` |
| `afterContent` | 합성된 최종 파일 내용. 삭제 파일은 `null` |

파일 목록은 경로 순서로 정렬됩니다. 저장소 상태와 입력이 같으면 파일 순서,
내용과 통합 diff도 같습니다.

### 작업 중인 저장소 보호

합성은 공통 조상에서 시작하는 요청별 임시 Git worktree에서 실행됩니다. 성공,
선택 오류, 변경 적용 실패와 취소가 발생해도 분석 대상 저장소의 다음 상태를
변경하지 않습니다.

- 현재 브랜치와 HEAD
- staged 변경
- unstaged 변경
- untracked 파일

### 지원 범위

- 하나의 조상 관계로 정렬할 수 있는 선형 이력
- 서로 인접하지 않은 커밋 선택
- 같은 파일을 여러 번 변경한 선택의 최종 상태 합성
- 텍스트 파일의 추가, 수정과 삭제
- 선택 변경 시 최신 계산 결과 게시와 이전 계산 취소

### 현재 제한 사항

- 여러 브랜치에 흩어진 커밋 선택
- merge commit의 기준 부모 선택
- 루트 커밋 비교
- 충돌 파일의 부분 결과와 자동 복구
- rename 추론
- binary 파일 내용 표현
- 공개 CLI, 패키지 배포와 사용자 화면

## Troubleshooting

### Git 실행 파일 또는 버전 오류

```powershell
git --version
```

Git `2.30+`가 설치되어 있고 현재 터미널의 `PATH`에서 실행되는지 확인합니다.
예제는 시작할 때 Git 환경을 확인하고 설치 또는 설정에 필요한 안내를 출력합니다.

### 커밋을 찾을 수 없음

입력한 ref와 커밋 해시가 분석 대상 저장소에 있는지 확인합니다.

```powershell
git -C $TargetRepo rev-parse --verify "$FirstCommit^{commit}"
git -C $TargetRepo rev-list --reverse "$BaseRef..$HeadRef"
```

두 번째 명령의 출력에 선택 커밋이 있어야 합니다.

### 현재 비교 범위에 포함되지 않는 커밋

공통 조상과 작업 브랜치를 확인합니다.

```powershell
git -C $TargetRepo merge-base $BaseRef $HeadRef
git -C $TargetRepo branch --contains $FirstCommit
```

`baseRef`, `headRef` 또는 선택 커밋을 같은 브랜치 흐름에 맞게 지정한 뒤 다시
실행합니다.

### 선택 변경을 적용할 수 없음

선택한 커밋이 선택하지 않은 중간 변경에 의존하면 합성 과정에서 충돌이 발생할
수 있습니다. 오류에 표시된 커밋과 파일을 확인하고 필요한 선행 커밋을 선택 목록에
추가한 뒤 다시 실행합니다. 현재 범위에서는 충돌 파일의 부분 결과를 제공하지
않습니다.

### 임시 작업 공간 정리 오류

오류 메시지에 남은 임시 경로가 표시됩니다. 해당 경로를 사용 중인 Git이나 편집기
작업을 종료한 뒤 다시 실행합니다.

## Development

전체 프로젝트를 검증합니다.

```powershell
npm test
npm run typecheck
npm run lint
npm run build
openspec validate build-composite-diff-core --strict
```
