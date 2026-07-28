# Prettifer 코어 퀵스타트

Prettifer 코어는 선형 Git 이력에서 선택한 커밋만 반영된 최종 파일 상태와 통합
diff를 계산합니다. 현재 API는 저장소 안에서 사용하는 개발자용 계약이며 버전 간
호환성을 보장하지 않습니다.

## 준비 사항

- Node.js `22.13+` 또는 `24+`
- Git `2.30+`
- 분석할 로컬 Git 저장소

```powershell
node --version
git --version
```

## 설치와 코어 빌드

Prettifer 저장소 루트에서 실행합니다.

```powershell
npm ci
npm run build:core
```

빌드가 끝나면 `dist/index.js`와
`examples/compose-selected-commits.mjs`를 사용할 수 있습니다.

## 비교 범위와 커밋 선택

다음 값을 실제 저장소에 맞게 바꿉니다.

```powershell
$TargetRepo = 'C:\work\my-repository'
$BaseRef = 'main'
$HeadRef = 'feature/my-work'

git -C $TargetRepo merge-base $BaseRef $HeadRef
git -C $TargetRepo log --oneline --reverse "$BaseRef..$HeadRef"
```

출력에서 합성할 커밋 해시를 고릅니다. 선택 커밋은 공통 조상 뒤에 있고
`$HeadRef`의 하나의 조상 흐름에 있어야 합니다.

```powershell
$FirstCommit = '첫-번째-커밋-해시'
$SecondCommit = '두-번째-커밋-해시'
```

## 통합 결과 생성

```powershell
node .\examples\compose-selected-commits.mjs `
  $TargetRepo `
  $BaseRef `
  $HeadRef `
  $FirstCommit `
  $SecondCommit
```

선택 해시는 명령 끝에 더 추가할 수 있습니다. 입력 순서와 관계없이 코어가
조상 관계에 따라 오래된 커밋부터 적용합니다.

## 입력값

| 값 | 설명 |
| --- | --- |
| `repositoryPath` | 분석할 로컬 Git 저장소의 절대 경로 |
| `baseRef` | 비교 기준 브랜치 또는 커밋 |
| `headRef` | 선택 가능한 커밋을 포함한 작업 브랜치 또는 커밋 |
| `selectedCommits` | 합성할 커밋 해시 목록. 하나 이상 필요 |

코어는 `baseRef`와 `headRef`의 공통 조상을 실제 비교 기준으로 사용합니다.

## 결과값

명령은 파일 결과 JSON을 출력하고 `--- unified diff ---` 아래에 통합 diff를
출력합니다.

| 값 | 설명 |
| --- | --- |
| `baseCommit` | 계산에 사용한 공통 조상의 전체 커밋 해시 |
| `selectedCommits` | 조상 순서로 정렬된 전체 커밋 해시 |
| `files` | 비교 기준과 달라진 파일의 최종 상태 |
| `unifiedDiff` | 비교 기준과 최종 합성 상태 사이의 Git diff |

파일 상태별 내용 계약은 다음과 같습니다.

| 상태 | `beforeContent` | `afterContent` |
| --- | --- | --- |
| `added` | `null` | 최종 텍스트 |
| `modified` | 기준 텍스트 | 최종 텍스트 |
| `deleted` | 기준 텍스트 | `null` |
| `binary: true` | `null` | `null` |

파일 목록은 경로 순서로 정렬됩니다. 같은 저장소 상태와 입력에는 같은 파일
내용과 통합 diff가 제공됩니다.

## 저장소 상태 보호

계산은 원본과 분리된 요청별 임시 clone에서 수행됩니다. 파일 내용 계산에 필요한
저장소 설정을 적용하고, 성공·실패·취소 뒤 해당 임시 디렉터리만 제거합니다.
일반 저장소는 선택 커밋이 변경한 경로만 준비합니다. 저장소 전용 merge 또는
filter 설정이 다른 저장소 파일을 요구하면 격리된 임시 clone의 전체 내용을
준비합니다.
다음 원본 상태는 유지됩니다.

- 현재 branch와 HEAD
- staged, unstaged와 untracked 파일
- 로컬 Git config와 다른 worktree 등록

## 지원 범위

- 하나의 조상 관계로 정렬할 수 있는 선형 이력
- 서로 인접하지 않은 커밋 선택
- 같은 파일을 여러 번 변경한 선택의 최종 상태
- 텍스트 파일의 추가, 수정과 삭제
- 바이너리 파일 식별
- 선택 변경 시 최신 계산 결과와 이전 계산 취소

## 제한 사항

- 여러 브랜치에 흩어진 커밋 선택
- merge commit의 기준 부모 선택
- 루트 커밋 비교
- 충돌 파일의 부분 결과
- 이름 변경 추론
- 공개 CLI와 패키지 API 호환성

## 문제 해결

### Git 실행 오류

```powershell
git --version
```

Git이 설치되어 있고 현재 터미널의 `PATH`에서 실행되는지 확인합니다.

### 커밋을 찾을 수 없음

```powershell
git -C $TargetRepo rev-parse --verify "$FirstCommit^{commit}"
git -C $TargetRepo rev-list --reverse "$BaseRef..$HeadRef"
```

두 번째 명령의 출력에 선택 커밋이 있어야 합니다.

### 선택 변경 적용 실패

오류에 표시된 커밋이 이전 커밋의 파일 생성이나 변경에 의존할 수 있습니다.
필요한 선행 커밋을 선택 목록에 추가하고 다시 실행합니다. 파일 잠금이나 권한
오류는 저장소와 실행 환경을 확인한 뒤 재시도합니다.

### 임시 작업 공간 정리 오류

오류에 표시된 임시 경로를 사용 중인 Git이나 편집기 작업을 종료한 뒤 다시
실행합니다. 원본 저장소의 worktree 등록은 정리 과정에서 변경되지 않습니다.
