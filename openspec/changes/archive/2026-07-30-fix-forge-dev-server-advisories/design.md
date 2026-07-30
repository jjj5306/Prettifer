## Context

`npm audit`의 실제 구성을 먼저 확인했다. 표면상 숫자와 원인 개수가 다르다.

조사 시점의 `npm audit`은 **34 high**를 보고했지만, 구별되는 권고는 **2개 패키지 7건**이었다.

| 패키지 | 등급 | 권고 수 | 취약 범위 |
|---|---|---|---|
| `brace-expansion` | high | 1 | `<=5.0.7` |
| `webpack-dev-server` | moderate | 6 | `<=5.2.5` |

34라는 숫자는 `brace-expansion`의 high 권고가 의존 체인을 따라 상위 패키지로 전파되며 각
패키지마다 한 건으로 집계된 결과다. `brace-expansion` 문제를 해소하면 남는 것은
`webpack-dev-server` moderate 2건이며, 이는 이슈 #9가 처음 기록한 내용과 정확히 일치한다.
즉 이슈 #9의 대상은 `webpack-dev-server`이고, `brace-expansion`은 그 뒤에 유입된 별개 문제다.

설치 경로는 단일하다.

```
prettifer -> @electron-forge/plugin-webpack@7.11.2 -> webpack-dev-server@4.15.2
```

제약: 개발 실행(`electron-forge start`), 패키징(`electron-forge package`), 릴리스 산출물
생성(`electron-forge make`)이 모두 계속 동작해야 한다. CSP, renderer sandbox, preload 경계와
Electron fuse 설정은 건드리지 않는다.

## Goals / Non-Goals

**Goals:**

- `webpack-dev-server` 권고를 audit에서 제거한다.
- 채택한 조합이 개발·패키징·릴리스 경로에서 동작함을 실행으로 확인한다.
- 다음 사람이 이 고정을 재확인하고 걷어낼 수 있게 근거와 절차를 남긴다.

**Non-Goals:**

- `brace-expansion` 권고 해소(별도 이슈)
- Forge Webpack 구성에서 다른 플러그인으로의 이전
- 제품 화면 기능, 코드 서명, 자동 업데이트, 공개 배포

## Decisions

### 1. `webpack-dev-server`를 5.2.6으로 override

선택지를 먼저 좁혔다.

| 방안 | 결과 |
|---|---|
| Forge를 올려 해결 | 불가. 7.11.2가 최신이며 여전히 `^4.0.0`을 선언한다 |
| Forge 선언 범위(`^4.x`) 안에서 해결 | 불가. 모든 4.x가 `<=5.2.5`에 포함되어 취약하다 |
| 다른 Forge 플러그인으로 이전 | 이번 범위 밖. webpack 기반 빌드(ts-loader, Monaco 번들, 글꼴 자산) 전체를 다시 만들어야 한다 |
| `webpack-dev-server`를 안전한 버전으로 override | 채택 |

즉 **Forge가 선언한 범위 안에는 안전한 버전이 존재하지 않는다.** 이슈 #9은 "지원되지 않는
버전 조합을 사용하지 않는다"를 완료 기준에 두었는데, 그 의도는 "호환되는 안정 버전 없이
강제 변경하면 개발 실행과 패키징 계약이 깨질 수 있다"는 우려였다. 그래서 깨지지 않는다는
것을 선언이 아니라 실행으로 확인하는 쪽을 택했다.

버전은 5.2.6으로 고정한다. 권고 6건 중 가장 넓은 취약 범위가 `<=5.2.5`이므로 5.2.6이 조건을
만족하는 가장 낮은 버전이다. 6.x는 더 큰 변경이므로 필요 이상으로 위험을 키운다.

### 2. 호환성을 API 사용 지점에서 확인

Forge가 `webpack-dev-server`를 어떻게 쓰는지 확인했다.

```
new WebpackDevServer(this.devServerOptions(), compiler)
```

넘기는 옵션은 `hot`, `devMiddleware.writeToDisk`, `historyApiFallback`, `port`,
`setupExitSignals`, `static`, `headers`뿐이다. 모두 5.x에 존재하며 생성자 서명도 4.x와 같다.
5.x가 제거한 `onBeforeSetupMiddleware`, `onAfterSetupMiddleware`, `https`는 사용하지 않는다.

CSP는 Forge가 `headers`의 `Content-Security-Policy`로 직접 넣고, 이 변경은 그 코드를 건드리지
않으므로 개발용 CSP 계약도 그대로 유지된다.

### 3. `selfsigned`도 함께 고정해야 한다

정적 확인만으로 끝나지 않았다. wds만 5.2.6으로 올리자 **`npm ci`가 깨졌다.**

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json ... are in sync.
npm error Missing: @noble/hashes@1.4.0 from lock file
```

원인은 wds의 의존성 계보 변화다. wds 5.2.6은 `selfsigned: ^5.5.0`을 선언하고, selfsigned는
5.x에서 `node-forge`를 버리고 `pkijs`/`@peculiar/x509`로 갈아탔다. 그 서브트리에서
`pkijs`는 `@noble/hashes`를 `1.4.0`으로 정확히 고정하는데 같은 트리의 `@exodus/bytes`는
`^1.8.0 || ^2.0.0`을 peer로 요구한다. 충족 불가 조합이라 `npm install`이 만든 트리와 `npm ci`가
계산하는 트리가 어긋난다.

`selfsigned`를 `2.4.1`(node-forge 기반)로 고정하면 `pkijs`가 트리에서 완전히 사라지고
`npm ci`가 통과한다. selfsigned는 wds가 HTTPS 개발 서버를 띄울 때만 쓰이고 이 프로젝트는
그 옵션을 켜지 않으므로, 실제 실행 경로에는 영향이 없다.

이 결정의 대가는 명확하다. **범위를 벗어난 고정이 하나에서 둘로 늘고, 그중 하나는
다운그레이드다.** 이슈 #9이 금지한 형태이므로 사용자에게 확인받고 진행했다.

### 4. 실행으로 검증

정적 확인만으로는 충분하지 않다고 보고 다섯 경로를 실제로 실행했다. 결과는 "실행 검증" 절에
기록한다.

## Risks / Trade-offs

- [Forge가 선언한 `^4.0.0` 범위를 벗어난다] → Forge가 실제로 사용하는 API 표면이 5.x에
  그대로 있음을 확인하고, 개발 서버 기동·패키징·릴리스 ZIP 생성·e2e를 실행해 확인했다. 다만
  Forge가 향후 4.x 전용 동작에 의존하기 시작하면 이 고정이 깨질 수 있다. 그래서 재확인 절차를
  문서에 남긴다.
- [override가 오래 남아 잊힌다] → README에 두 고정이 존재하는 이유와 걷어낼 조건을 표로
  적는다. `webpack-dev-server`는 Forge가 안전한 범위를 선언하면, `selfsigned`는 상위의
  `@noble/hashes` peer 충돌이 해소되면 제거한다.
- [`selfsigned` 다운그레이드가 HTTPS 개발 서버를 쓰게 되면 문제가 된다] → 지금은 그 옵션을
  켜지 않는다. 켜야 할 일이 생기면 이 고정을 먼저 재검토해야 한다는 점을 README에 남긴다.
- [`brace-expansion` 권고가 남는다] → 이번 범위가 아니며 별도 이슈로 분리한다. 강제 override는
  불가함을 확인했다(아래).

### `brace-expansion`을 이번에 함께 고치지 않는 이유

시도했고 깨졌다. 기록해 둔다.

`brace-expansion`은 5.0.8에서 권고가 해소되지만, 그 버전은 기본 함수 export를 named export로
바꿨다. 트리의 `minimatch` 3.x·9.x는 이 모듈을 함수로 호출하므로 override 시 즉시 깨진다.

```
TypeError: expand is not a function
  at new Minimatch (node_modules/minimatch/minimatch.js:156:8)
  at doMatch (node_modules/@eslint/config-array/dist/cjs/index.cjs:422:13)
```

`npm run lint`가 실행조차 되지 않고 유닛 테스트 12건이 실패했다. 생태계의 해법은 `minimatch`
10.x가 의존 대상을 `@isaacs/brace-expansion@^5.0.0`으로 바꾼 것이다. 즉 해소는 `minimatch`를
쓰는 상위 패키지들(eslint 9.x, Electron Forge의 `@electron/node-gyp`, `@electron/universal`)이
올라와야 가능하고, 지금은 그 조합이 없다. 별도 이슈에서 다룬다.

## 실행 검증

두 고정을 적용한 상태에서 다음을 실행했다.

| 경로 | 명령 | 결과 |
|---|---|---|
| 깨끗한 설치 | `npm ci` | 통과 (selfsigned 고정 없으면 실패) |
| 개발 서버 | `electron-forge start` | `http://localhost:3000/main_window` 200, 약 10초 |
| 정적 검사 | `npm run lint`, `npm run typecheck` | 무경고 |
| 유닛 | `npm test` | 268 passed (39 files) |
| Electron 전체 흐름 | `npm run test:desktop:e2e` | 11 passed (패키지 smoke 포함) |
| 릴리스 산출물 | `npm run desktop:make` | ZIP 생성 |

CSP, preload 경계와 fuse 설정은 코드를 건드리지 않았고, 해당 회귀 테스트(`import-boundaries`,
`forge-config`)는 위 268개에 포함되어 통과한다.

audit 결과는 다음과 같이 바뀐다.

| | 적용 전 | 적용 후 |
|---|---|---|
| 구별되는 권고 | 7건 (`brace-expansion` 1, `webpack-dev-server` 6) | 1건 (`brace-expansion`) |
| npm 집계 | 34 high | 33 high |

집계 숫자가 34에서 33으로만 줄어드는 이유는 `brace-expansion`의 high 권고가 의존 체인을 따라
33개 패키지로 전파되어 계속 집계되기 때문이다. 즉 audit 출력이 조용해지는 것은
`brace-expansion`이 해소된 뒤이며, 그것은 별도 이슈에서 다룬다.
