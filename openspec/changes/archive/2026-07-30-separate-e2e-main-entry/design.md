## Context

`src/desktop/main/index.ts`가 앱 수명주기, 세션 보안, 의존성 조립을 모두 하면서 세 곳에서
`process.env`를 읽는다.

```
const gitPath = e2eGitPath(process.env);
... new DesktopCompositionController(..., e2eCompositionDelay(process.env), ...)
const folders = createFolderSelectionBoundary({ show: ... }, process.env);
```

즉 `e2e-boundary.ts`가 운영 번들에 포함된다.

제약이 두 가지 있다.

- main 진입점은 Forge가 주입하는 `MAIN_WINDOW_WEBPACK_ENTRY`와
  `MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY` 전역에 의존한다. Forge 빌드 밖에서 따로 번들할 수 없다.
- 패키지 smoke 테스트는 실제 배포 산출물(asar, fuse, 재작성된 main 경로)을 검증해야 하므로
  운영 진입점으로 실행해야 한다.

## Goals / Non-Goals

**Goals:**

- 배포 번들에서 테스트 전용 코드를 없앤다.
- 두 진입점이 수명주기와 보안 설정을 공유해 조립 코드가 중복되지 않게 한다.
- 주입점과 수명주기를 단위 테스트로 고정한다.

**Non-Goals:**

- 제품 동작·화면 변경
- 저장소 경로를 명령행 인자로 받는 기능 추가(아래 위험 항목 참고)
- 코드 서명, 자동 업데이트

## Decisions

### 1. 조립 지점을 분리하고 주입점을 매개변수로 받는다

`desktop-application.ts`가 세션 보안 설정과 창 수명주기를 담고, 다음을 주입받는다.

- `selectFolder(): Promise<string | null>`
- `gitPath?: string`
- `beforeComposition(): Promise<void>`

운영 진입점은 실제 대화상자만 넘기고 나머지는 기본값을 쓴다. 테스트 진입점은
`e2e-boundary.ts`로 환경 변수에서 세 값을 만들어 넘긴다. `e2e-boundary.ts`는 테스트
진입점에서만 import되므로 운영 번들의 의존성 그래프에 들어가지 않는다.

### 2. Electron 표면도 주입해 수명주기를 테스트한다

창 생성, `loadURL` 실패, 창 종료, IPC 정리는 지금 실행 없이는 확인할 수 없다. 조립 지점이
`BrowserWindow` 생성자와 `ipcMain`, 세션 설정을 주입받게 해서 가짜 구현으로 검증한다.
운영 진입점이 실제 Electron 모듈을 넘기므로 운영 경로는 그대로다.

### 3. 진입점 두 개를 한 번의 Forge 빌드로 만든다

Forge의 webpack 플러그인은 main 설정을 `merge(기본값, mainConfig)`로 합치므로 우리 설정의
`output.filename`이 이긴다. 진입점을 객체로 선언하고 `[name].js`로 출력한다.

```
entry: { index: 운영, "index-e2e": 테스트 }
output: { filename: "[name].js" }
```

`.webpack/x64/main/index.js`와 `index-e2e.js`가 나온다. 흐름 테스트는 후자를 실행한다.

대안으로 환경 변수로 진입점을 바꿔 두 번 빌드하는 방법을 검토했다. 패키징이 가장 느린
단계인데 두 배가 되고, 두 번째 빌드가 첫 산출물을 덮어써서 smoke 테스트 대상이 사라진다.

### 4. 배포 패키지에서 테스트 번들을 제거한다

`packagerConfig.ignore`는 webpack 플러그인이 자체적으로 설정하므로 건드리지 않고, 이미 main
경로를 재작성하는 `packageAfterCopy` 훅에서 테스트 번들과 소스맵을 지운다. 지운 사실을
테스트로 확인한다.

### 5. smoke 테스트의 범위를 좁힌다

운영 진입점은 저장소 경로를 주입받을 방법이 없으므로, 패키지 smoke는 "배포 산출물이 실행되고
화면이 뜨고 정상 종료한다"까지만 확인한다. 저장소를 열고 결과를 만드는 전체 흐름은 테스트
진입점을 쓰는 흐름 테스트가 담당한다. 이슈 #10이 정한 역할 분담과 같다.

## Risks / Trade-offs

- [패키지된 앱이 결과를 만드는 것까지는 더 이상 확인되지 않는다] → 이번 분리의 직접적인 대가다.
  asar·fuse 환경에서 Git 실행과 합성이 되는지는 흐름 테스트(비패키지)와 smoke 테스트(패키지
  기동)로 나뉘어 검증되고, 둘을 한 번에 덮는 지점이 없어진다. 저장소 경로를 명령행 인자로
  받는 제품 기능을 넣으면 다시 덮을 수 있으나 새 제품 표면이므로 별도 이슈로 남긴다.
- [주입 표면이 커진다] → 조립 지점이 Electron 타입을 직접 쓰지 않고 좁은 인터페이스만 받게
  해서, 가짜 구현이 작게 유지되도록 한다.
- [테스트 번들이 실수로 배포될 수 있다] → 제거를 훅에서 하고, 배포 산출물에 파일이 없음을
  테스트로 확인한다.

## 실행 검증

| 확인 | 결과 |
|---|---|
| 운영 번들의 `PRETTIFER_E2E` 문자열 | **0건** |
| 테스트 번들의 `PRETTIFER_E2E` 문자열 | 있음 |
| 패키지 asar의 `.webpack/main` 내용 | `index.js`, `package.json`만. 테스트 번들과 소스맵 없음 |
| 개발 앱 기동 (운영 진입점) | `http://localhost:3000/main_window` 200, 약 10초 |
| lint, typecheck | 무경고 |
| 유닛 테스트 | 275 passed (40 files). 수명주기 6건, 패키징 제거 1건 신규 |
| e2e | 12 passed. 흐름 11건은 테스트 진입점, smoke 1건은 패키지된 운영 진입점 |
| 릴리스 ZIP | 생성됨 |

수명주기 테스트는 가짜 host로 다음을 고정한다. 창 생성과 가드 적용, 요청 채널 등록,
`ready-to-show` 이후에만 창 표시, `loadURL` 실패 시 정리와 창 파괴, 창 종료 시 핸들러 해제,
`destroy`가 `closed`를 유발해도 정리가 한 번만 실행되는 것, 그리고 창이 살아 있을 때는 요청이
주입점까지 도달하고 종료 후에는 거부되는 것.

smoke 테스트는 범위를 좁힌 만큼 패키징이 깨뜨릴 수 있는 지점을 직접 확인한다. 패키지 번들에서
화면이 렌더링되는지, preload가 노출한 API가 `window.prettifer`로 도달하는지, renderer에
`process`가 없는지, 콘솔·페이지 오류가 없는지, 정상 종료하는지다.
