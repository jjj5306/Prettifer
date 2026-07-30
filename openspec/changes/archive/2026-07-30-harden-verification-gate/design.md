## Context

PR 검사 워크플로(#37)는 동작하지만, "검사가 초록불이면 병합해도 된다"는 신뢰를 아직 주지
못한다. 세 가지 원인이 서로 독립적이다.

- 간헐적으로 실패하는 e2e가 하나 있다. 전체 e2e 3회 실행 중 1회 실패했고, 단독 6회 반복은
  모두 통과했다.
- 릴리스 워크플로가 검증 명령 세 개를 한 `run:` 블록에 담아 lint와 typecheck 실패를 가린다.
- OpenSpec 형식 검증이 검사에 없다. CLI가 전역 설치이고, npm 레지스트리의 `openspec`은
  이 도구가 아닌 빈 패키지다.

제약: 제품 동작을 바꾸지 않는다. 간헐적 실패를 재시도나 대기 시간으로 덮지 않는다.

## Goals / Non-Goals

**Goals:**

- 검사 실패가 항상 변경의 문제를 뜻하게 만든다.
- 릴리스 경로에서도 검증 실패가 실제로 릴리스를 막게 한다.
- 형식 검증을 깨끗한 환경에서 실행 가능하게 만들어 검사에 넣는다.

**Non-Goals:**

- Playwright `retries` 도입. 이 저장소의 e2e는 유닛 테스트가 놓친 실제 버그를 두 번 잡은
  층이므로, 간헐적 실패를 초록불로 바꾸면 그 가치를 잃는다.
- 제품 코드 변경, 메인 스펙 변경
- OpenSpec CLI 버전 올리기(1.6.0 유지). 검증 규칙이 달라지면 이번 변경과 무관한 실패가 섞인다.

## Decisions

### 1. 릴리스 검증 step을 명령마다 분리

Windows runner의 기본 shell은 `pwsh`이고, GitHub Actions는 스크립트 끝에
`if ((Test-Path -LiteralPath variable:\LASTEXITCODE)) { exit $LASTEXITCODE }`만 덧붙인다.
따라서 한 `run:` 블록의 여러 명령 중 **마지막 명령의 종료 코드만** step 결과가 된다.
로컬 pwsh로 확인했다.

```
cmd /c "exit 3"   -> $LASTEXITCODE 3
cmd /c "exit 0"   -> $LASTEXITCODE 0
runner가 보는 종료 코드: 0
```

`pull-request-checks.yml`은 이미 명령마다 step을 나눴다. 릴리스 워크플로도 같은 형태로
맞춘다. 트리거, 태그 검증, 자산 수집과 게시 로직은 건드리지 않는다.

### 2. OpenSpec CLI를 버전 고정 devDependency로

`npm view openspec`은 `name = 'openspec', version = '0.0.0'`인 **다른 패키지**다. 이 저장소가
쓰는 것은 `@fission-ai/openspec`이며 지금까지 전역 설치로만 존재했다. 즉 `npx openspec`은
기계에 따라 다른 것을 실행하고, 깨끗한 runner에서는 의도한 도구가 아닌 것을 내려받는다.

`@fission-ai/openspec@1.6.0`을 정확한 버전으로 devDependency에 넣는다. README가 안내하던
버전이자 현재 모든 스펙을 검증한 버전이다. 최신은 1.7.0이지만, 검증 규칙 변화가 섞이면
원인 구분이 어려워지므로 올리지 않는다.

검사 step은 `npx --no -- openspec validate --all --strict`를 쓴다. `--no`는 레지스트리에서
내려받지 않겠다는 뜻이므로, 의존성이 빠지면 조용히 엉뚱한 패키지를 실행하는 대신 즉시
실패한다.

`package-lock.json`은 처음부터 다시 생성했다. 의존성만 추가했을 때와 새로 생성했을 때 모두
`@emnapi/*`, `encoding` 항목이 빠지는데, 이는 lock을 처음 만든 npm과 지금 npm(11.6.2)의
선택적 의존성 처리가 다르기 때문이다. CI도 Node 24(npm 11.x)를 쓰므로 같은 npm이 해석한
lock이 더 일관된다. 기존 패키지 버전 변화는 macOS 전용 선택적 의존성 `fsevents`
2.3.2 → 2.3.3 하나뿐이고, `npm ci`로 깨끗한 설치를 확인했다.

### 3. 간헐적 e2e 실패

멈추는 연산을 게이트에서 제거한다. 원인 규명 과정과 결론은 "간헐적 실패 원인" 절에 기록한다.

## Risks / Trade-offs

- [OpenSpec strict 검증이 델타 없는 change를 거부] → tooling·문서 전용 change는 정당하게
  델타가 없다. 이 저장소는 AGENTS.md §3.2 10단계에 따라 PR 전에 archive하고, archive된
  change는 검증 대상에서 빠지므로 실제로는 문제가 되지 않는다. 이 change 자신도 그 순서를
  따른다. 여러 PR로 나뉘는 작업이 생기면 그때 step 범위를 재검토한다.
- [lock 재생성이 CI 설치를 깨뜨릴 수 있음] → 과거 실패(#28)와 같은 부류다. 기존 패키지
  버전 변화가 없음을 확인했고, `npm ci`를 로컬에서 실행해 확인했다. 최종 확인은 이 PR의
  검사에서 이뤄진다.
- [CLI 버전을 1.6.0에 고정] → 1.7.0의 개선을 받지 못한다. 올리는 것은 검증 규칙 변화를
  따로 확인해야 하는 별도 작업이다.

## 간헐적 실패 원인

### 배제한 후보

각 후보를 실험으로 배제했다.

| 후보 | 실험 | 결과 |
|---|---|---|
| `.first()`가 여러 sash 중 엉뚱한 것을 잡는다 | diff editor 안의 `.monaco-sash.vertical` 개수와 부모를 측정 | sash는 **1개**(`monaco-diff-editor side-by-side`의 자식)뿐이므로 모호성이 없다 |
| sash 위치가 측정 후 움직인다 | 레이아웃 안정 후 120ms 간격 6회 측정 | x=867로 6회 동일. 안정 후 움직이지 않는다 |
| 드래그가 느린 환경에서 동작하지 않는다 | CDP `Emulation.setCPUThrottlingRate`로 1·4·10·20배 감속 후 동일한 드래그 수행 | 4회 모두 성공. base 434→272, result 435→597로 요구치(100)보다 큰 162 변화 |
| 파일 선택 직후 중간 레이아웃이 측정된다 | 선택 시점부터 `requestAnimationFrame`으로 2.5초간 폭 추적 | 상태 변화 1개. 이 fixture는 변경 파일이 하나여서 앱이 이미 자동 선택해 두었고 레이아웃이 정착된 상태였다 |

### 확정한 원인

전체 e2e를 반복 실행해 재현했다. 실패는 크기 조절 단언이 아니라 **문서용 스크린샷 캡처**에서
발생했다.

```
TimeoutError: page.screenshot: Timeout 30000ms exceeded.
Call log:
  - taking page screenshot
  - waiting for fonts to load...
  - fonts loaded
```

`test/e2e/desktop-flow.e2e.ts:146`, 즉 첫 번째 `page.screenshot({ fullPage: true, scale: "css" })`다.
글꼴 대기까지 끝난 뒤 캡처 자체가 멈췄다.

이 스크린샷들은 단언이 아니다. README의 화면 기준 이미지를 다시 만들기 위한 산출물이며
`test.info().outputPath(...)`로 gitignore된 `test-results/`에 저장된다. 즉 제품 동작과 무관한
단계가 기능 검증 테스트를 실패시키고 있었다.

추가로 확인한 사실은 다음과 같다.

- 이 앱의 문서는 스크롤되지 않는다. `documentElement.scrollHeight === clientHeight === 720`,
  `scrollWidth === clientWidth === 1280`이다. 따라서 `fullPage: true`는 viewport 캡처와 **같은
  픽셀**을 만들고, 얻는 것 없이 `captureBeyondViewport` 경로만 쓴다.
- 단독 실행에서는 두 방식 모두 12회 중 0회 실패, 60~76ms로 빠르다. 즉 `fullPage`가 본질적으로
  느린 것이 아니라, 전체 실행 중 창이 합성(compositing)되지 않는 상태에서 캡처가 멈춘다.

### 언제 멈추는가

실행 조건별로 결과가 갈렸다.

| 실행 조건 | 횟수 | 실패 |
|---|---|---|
| `electron-forge package` 직후 첫 e2e 실행 | 3 | 2 |
| 패키징 없이 e2e만 반복 | 10 | 0 |

관측한 두 번의 실패는 모두 webpack 패키징 빌드가 끝난 직후 실행에서 발생했고, 패키징 없이
연속 실행한 10회는 전부 통과했다. 즉 빌드가 끝난 직후 기계가 아직 포화된 상태에서 캡처가
프레임을 받지 못해 멈춘다.

이 점이 중요한 이유는 `npm run test:desktop:e2e`가 `electron-forge package && playwright test`이기
때문이다. CI는 항상 이 실패하기 쉬운 순서로 실행한다. 지금까지 runner에서 3회 통과했지만
위험은 실재한다.

### 수정

문서용 스크린샷 6개를 제거했다. 근거는 다음과 같다.

- 단언이 아니다. 제거 후에도 레이아웃 측정, 글꼴, 보기 전환의 `aria-pressed`, 선택 파일 유지,
  200% 확대에서의 가로 스크롤·잘린 컨트롤 검사가 모두 그대로 남는다.
- 소비자가 없다. `test.info().outputPath(...)`는 gitignore된 `test-results/`에 쓰고, 저장소
  어디에서도 이 파일 이름을 참조하지 않는다.
- README의 화면 기준 이미지를 만들지도 않는다. 커밋된 `docs/assets/*.png`는 **1600x1280**이고
  이 캡처는 1280x720 또는 1920x1080이다. README도 이들을 "목업"이라고 부른다. 즉 재생성
  용도라는 처음 가정은 틀렸다.
- 실패 시 진단은 Playwright의 `trace: "retain-on-failure"`가 이미 담당한다.

`fullPage: true`가 무의미했다는 점도 함께 사라진다. 대기 시간을 늘리거나 재시도를 넣지
않았고, 멈추는 연산 자체를 게이트에서 없앴다. 남은 `page.screenshot`은 renderer 시작 오류
경로의 진단용 1개뿐이며 정상 경로에서 실행되지 않는다.

### 수정 확인

실패하기 쉬운 순서(`electron-forge package` 직후 e2e)로 반복 실행했다. 수정 전 이 조건에서
3회 중 2회 실패했다.

| 조건 | 횟수 | 실패 |
|---|---|---|
| 수정 전, 패키징 직후 e2e | 3 | 2 |
| 수정 후, 패키징 직후 e2e | 7 | 0 |

같은 패턴을 다른 e2e에서도 찾았다. `desktop-package-smoke.e2e.ts`의 정상 경로에도 단언이
아닌 `page.screenshot({ fullPage: true })`가 하나 있어 함께 제거했다. 이제 프레임 합성에
의존하는 연산은 renderer 시작 오류 경로의 진단용 스크린샷 하나뿐이며, 정상 경로에서는
실행되지 않는다.
