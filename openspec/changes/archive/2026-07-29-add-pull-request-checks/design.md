## Context

`.github/workflows/`에는 tag 트리거 릴리스 워크플로 하나만 있다. Pull Request에는 검사가
없고, 병합 판단은 작성자가 PR 본문에 적은 로컬 실행 결과에 의존한다.

AGENTS.md §7이 작업 완료 전 확인 항목을 정하고 있다. 그중 기계가 판단할 수 있는 것은
lint, type check, 테스트, 그리고 OpenSpec 형식 검증이다. 앞의 세 가지를 이번에 자동화하고,
OpenSpec 형식 검증은 아래 5번의 이유로 제외한다. 나머지(요구사항 일치, 이슈 범위, 문서
정합성)는 사람 또는 에이전트의 판단이 필요하므로 PR 자체 리뷰가 계속 담당한다.

검증 명령의 실제 구성은 다음과 같다.

- `npm run lint` → `eslint .`
- `npm run typecheck` → 5개 tsconfig에 대한 `tsc --noEmit`
- `npm test` → `vitest run` (renderer, main, 통합 테스트 전체 39 파일)
- `npm run test:desktop:e2e` → `electron-forge package && playwright test --config=playwright.electron.config.ts`

`npm test`가 `test/desktop`을 이미 포함하므로 `test:desktop:unit`을 따로 실행할 필요는 없다.
e2e는 실행 전 `electron-forge package`로 실제 패키지를 만들어야 하고, 그 webpack 빌드가
이 워크플로에서 가장 비싼 단계다.

제약:

- 앱은 Windows 전용 Electron 앱이므로 runner는 `windows-latest`여야 한다.
- 기존 릴리스 워크플로가 `actions/checkout@v5`, `actions/setup-node@v5`, `node-version: "24"`,
  `cache: npm`, `npm ci`를 쓴다. Node 24는 package-lock.json을 작성한 npm major에 맞춘
  것으로, 과거 CI 설치 실패(#28)의 재발 방지 조건이다.
- secret을 요구하는 단계를 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- Pull Request에서 병합 게이트의 기계 검증 가능 부분을 자동으로 실행하고 결과를 검사로
  남긴다.
- 실패한 검사에서 원인을 사후에 확인할 수 있게 한다.
- 로컬에서 개발자가 실행하는 명령과 CI가 실행하는 명령을 같게 유지한다.

**Non-Goals:**

- 저장소 설정 변경(필수 검사 지정, branch protection). 소유자가 직접 설정한다.
- 커버리지, 성능 측정, 다중 OS·Node matrix
- 릴리스 워크플로 수정
- 사람 판단이 필요한 검토 항목의 자동화

## Decisions

### 1. 검증 명령마다 별도 step

Windows runner의 기본 shell은 `pwsh`이고, GitHub Actions는 스크립트 끝에
`if ((Test-Path -LiteralPath variable:\LASTEXITCODE)) { exit $LASTEXITCODE }`만 덧붙인다.
따라서 하나의 `run:` 블록에 여러 명령을 나열하면 **마지막 명령의 종료 코드만** step 결과가
된다. 로컬 pwsh로 확인했다.

```
cmd /c "exit 3"   → $LASTEXITCODE 3
cmd /c "exit 0"   → $LASTEXITCODE 0
runner가 보는 종료 코드: 0
```

즉 `npm run lint`가 실패해도 뒤의 `npm test`가 통과하면 step이 초록색이 된다. 이 워크플로는
검증 명령을 각각 별도 step으로 둔다. 실패 지점이 검사 목록에서 바로 보이는 이점도 있다.

기존 릴리스 워크플로의 "Verify the source" step이 정확히 이 형태로 세 명령을 한 블록에
담고 있다. 이 change의 범위가 아니므로 여기서는 고치지 않고 후속 작업으로 남긴다.

### 2. 정적 검사와 e2e를 두 job으로 분리

`verify` job은 lint, typecheck와 유닛 테스트를 실행한다. `desktop-e2e` job은 패키지 빌드와
Playwright Electron 테스트를 실행한다.

두 job은 서로 의존하지 않고 병렬로 돈다. lint 오류를 e2e 빌드가 끝날 때까지 기다려서 알게
되는 상황을 막는 것이 목적이다. `needs`로 직렬화하면 값싼 신호가 빨라지지 않고 전체 시간만
늘어난다.

대안으로 하나의 job에 모두 담는 방법을 검토했다. `npm ci`를 한 번만 하고 캐시도 한 번만
쓰므로 총 runner 분은 줄지만, 피드백이 가장 느린 단계에 묶인다. 두 job의 `npm ci` 중복
비용은 npm 캐시로 상당 부분 회수된다.

### 3. Playwright 브라우저를 설치하지 않음

이 저장소의 e2e는 `_electron.launch`로 앱의 Electron 바이너리를 직접 띄운다. Chromium 등
Playwright 번들 브라우저를 쓰지 않으므로 `npx playwright install`이 필요하지 않다. 첫 실제
실행에서 이 가정을 확인한다.

### 4. 실패 시 Playwright 추적 자료를 artifact로 업로드

`playwright.electron.config.ts`가 `trace: "retain-on-failure"`이고, 테스트가
`test.info().outputPath(...)`로 스크린샷을 남긴다. 두 산출물 모두 `test-results/` 아래에
생긴다. e2e job이 실패했을 때만 그 디렉터리를 업로드해, 로컬 재현 없이 원인을 볼 수 있게
한다.

### 5. OpenSpec 형식 검증은 이번 범위에서 제외

AGENTS.md §7은 "OpenSpec change가 형식 검증을 통과한다"도 완료 조건으로 정한다. 기계 검증이
가능한 항목이므로 처음에는 `npx openspec validate --all --strict`를 step으로 두려 했으나,
확인 결과 CI에서 안전하게 실행할 수 없다.

이 저장소가 쓰는 CLI는 전역 설치된 `@fission-ai/openspec@1.6.0`이고 프로젝트 의존성이
아니다. 그런데 npm 레지스트리에서 `openspec`이라는 이름의 패키지는 **다른 패키지**이며 빈
0.0.0 버전이다.

```
npm ls -g   → @fission-ai/openspec@1.6.0
npm view openspec  → name = 'openspec', version = '0.0.0'
```

즉 깨끗한 runner에서 `npx openspec`은 의도한 도구가 아닌 무관한 패키지를 내려받는다. 로컬에서
동작하는 이유는 전역 설치뿐이다. 이를 CI에 넣으려면 `@fission-ai/openspec`을 버전 고정된
devDependency로 추가해야 한다.

의존성 추가는 이슈 #37의 범위(lint, typecheck, 유닛 테스트, e2e)를 넘고, 이 저장소는 과거
package-lock 관련 CI 설치 실패(#28)를 겪은 적이 있다. 따라서 이번에는 넣지 않고 후속 작업으로
남긴다. OpenSpec 검증은 계속 작성자가 로컬에서 실행하고 PR 본문에 결과를 남긴다.

부수 발견으로, AGENTS.md §3.2가 지시하는 `openspec validate`는 현재 전역 설치에 의존한다.
기계마다 결과가 달라질 수 있다는 뜻이므로 위 후속 작업에서 함께 다루는 것이 좋다.

### 6. 같은 PR의 이전 실행 취소

`concurrency.group`을 워크플로 이름과 `github.ref`로 두고 `cancel-in-progress: true`를 쓴다.
`main` push에서는 취소되면 기록이 남지 않으므로, group에 `github.event_name`을 넣지 않고
`github.ref`만 쓰면 PR의 head ref 단위로 취소된다. `main` push는 서로 다른 ref가 아니라
같은 ref이므로 연속 push 시 이전 실행이 취소될 수 있다. 검사 목적상 최신 커밋의 결과만
필요하므로 허용한다.

### 7. 최소 권한과 timeout

`permissions: contents: read`만 준다. 검사는 저장소에 쓰지 않는다. job마다
`timeout-minutes`를 두어 멈춘 실행이 runner를 오래 잡지 않게 한다.

## Risks / Trade-offs

- [Electron 앱이 runner에서 창을 띄우지 못함] → `windows-latest`는 데스크톱 세션이 있어
  Electron이 실행된다. 릴리스 워크플로가 이미 같은 runner에서 `desktop:make`까지 수행한다.
  다만 e2e는 실제 창을 띄우므로 첫 실행에서 확인이 필요하다. 실패 시 원인을 artifact로
  받는다.
- [e2e가 공유 runner에서 느려져 timeout] → Playwright config가 `workers: 1`,
  `fullyParallel: false`, 테스트 60초/단언 15초다. 로컬에서 패키지 빌드 포함 약 1분이며,
  job timeout은 그보다 넉넉하게 둔다.
- [두 job이 `npm ci`를 각각 실행해 총 시간이 늘어남] → 값싼 신호의 지연을 없애는 대가로
  받아들인다. npm 캐시로 설치 비용을 줄인다.
- [OpenSpec 형식 검증이 자동화되지 않음] → 위 5번의 이유로 이번 범위에서 제외했다. 그
  결과 change 형식 오류는 여전히 사람 또는 에이전트가 로컬에서 잡아야 한다.
- [검사가 통과해도 사람 판단 항목은 검증되지 않음] → 이 워크플로는 AGENTS.md §7의 기계
  검증 가능 부분만 담당한다. 요구사항 일치와 문서 정합성은 계속 PR 자체 리뷰가 담당한다.

## 실제 실행 확인

PR #38의 첫 실행에서 설계의 위험 항목을 모두 확인했다.

- `Lint, types and unit tests` 통과, 3분 6초. 깨끗한 runner에서 `npm ci`가 성공하고
  lint, typecheck와 유닛 테스트 268개가 모두 통과했다.
- `Electron end-to-end tests` 통과, 4분 16초. e2e 11개가 `11 passed (1.1m)`로 끝났다.
  즉 `windows-latest`에서 Electron 창을 띄우는 검증이 동작하고, Playwright 번들 브라우저
  설치 없이 `_electron.launch`가 가능하며, 글꼴·배율·Monaco 기하 단언도 runner에서 성립한다.
- 두 job이 병렬로 실행되어 값싼 신호가 e2e를 기다리지 않는 것을 확인했다.

검증 명령의 실패가 검사 실패로 이어지는지는 임시 PR #39로 확인했다. `Array<string>`은
유효한 TypeScript지만 `@typescript-eslint/array-type` 위반이므로 lint만 실패하고 typecheck와
테스트는 통과한다. 즉 검증 명령을 한 step에 묶었다면 초록불이 되었을 경우다. 결과는 `Lint`
step에서 실패하고 `Type check`와 `Unit tests`가 건너뛰어졌으며 검사 전체가 실패했다. 확인
후 PR과 브랜치를 삭제했다.
