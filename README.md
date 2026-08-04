# Prettifer

Git 이력에서 선택한 커밋만 합성해 최종 파일 상태와 통합 diff를 검토하는 Windows 데스크톱 도구.

- [사용자 안내](https://github.com/jjj5306/prettifer-release)
- [최신 Windows 릴리스](https://github.com/jjj5306/prettifer-release/releases/latest)

## 작업 기준

| 순서 | 문서 | 용도 |
|---|---|---|
| 1 | [AGENTS.md](AGENTS.md) | 개발, 검증, 커밋, PR 규칙 |
| 2 | 연결된 GitHub 이슈 | 목표, 범위, 완료 기준 |
| 3 | [openspec/changes/](openspec/changes/) | 진행 중인 변경의 설계와 작업 목록 |
| 4 | [openspec/specs/](openspec/specs/) | 현재 구현된 동작 |

### OpenSpec

```text
openspec/
├─ config.yaml
├─ specs/                         현재 구현된 동작
└─ changes/
   ├─ <change-name>/              진행 중인 변경
   │  ├─ proposal.md
   │  ├─ design.md
   │  ├─ specs/<capability>/spec.md
   │  └─ tasks.md
   └─ archive/YYYY-MM-DD-<name>/  완료된 변경
```

작업 순서:

```text
propose → apply → verify → sync-specs → archive
```

- 신규 기능과 동작 변경: 구현 전 proposal, specs, design, tasks 확인
- 요구사항 변경: OpenSpec과 구현을 함께 갱신
- 메인 스펙: 구현이 끝난 동작만 반영
- 커밋: `/prettifer-commit`
- PR: `/prettifer-pr`

```powershell
npx openspec list
npx openspec status --change <name>
npx --no -- openspec validate --all --strict
```

OpenSpec CLI 버전은 `@fission-ai/openspec@1.6.0`으로 고정. `--no` 옵션은 설치된 의존성만 사용.

## 개발 환경

요구 사항:

- Windows
- Node.js `22.13+` 또는 `24+`
- Git `2.30+`

설치와 실행:

```powershell
npm ci
npm run desktop:start
```

저장소 경로를 실행 인자로 전달 가능:

```powershell
npm run desktop:start -- C:\work\repo
.\out\desktop\prettifer-win32-x64\prettifer.exe C:\work\repo
```

- 인자 없음: 저장소 선택 전 화면 표시
- 유효하지 않은 경로: 화면에 진단 표시

## 검증

```powershell
npm test
npm run lint
npm run typecheck
npm run test:desktop:e2e
npx --no -- openspec validate --all --strict
npm run audit:check
```

- `test:desktop:e2e`: Electron 패키징 후 Playwright 실행
- 실행 중인 Prettifer가 패키지 디렉터리를 잠그면 앱 종료 후 재실행
- CI 실패 자료: `playwright-results` artifact의 trace와 스크린샷
- CI 설정: [.github/workflows/pull-request-checks.yml](.github/workflows/pull-request-checks.yml)

## 릴리스

태그 push 시 [.github/workflows/publish-release.yml](.github/workflows/publish-release.yml)이 Windows ZIP을
[배포 저장소](https://github.com/jjj5306/prettifer-release)에 게시.

```powershell
npm version 0.3.0 --no-git-tag-version
# CHANGELOG.md에 ## v0.3.0 절 추가
git tag v0.3.0
git push origin v0.3.0
```

게시 조건:

- 태그와 `package.json` 버전 일치
- `CHANGELOG.md`에 해당 버전 절 존재

미리 보기:

```powershell
node scripts/changelog-section.mjs 0.3.0
node scripts/release-notes.mjs --version 0.3.0 `
  --sha256 <hex64> --source-sha <hex40>
```

CHANGELOG 형식:

- 버전 제목: `## v<version>`
- 분류 제목: `추가`, `변경`, `수정`, `보안`
- 짧은 목록으로 사용자 영향 기록
- 내부 이슈 번호, 브랜치 이름, 소스 경로 제외
- 작업 과정과 홍보성 문구 제외

게시된 릴리스 노트 수정:

```powershell
node scripts/release-notes.mjs --version 0.2.0 --sha256 <hex64> --source-sha <hex40> --out notes.md
gh release edit v0.2.0 --repo jjj5306/prettifer-release --notes-file notes.md
```

패키지 생성:

```powershell
npm run desktop:package
npm run desktop:make
```

## 코어 라이브러리

- 공개 API와 CLI 형식은 아직 안정성 보장 없음
- 입력, 결과, 오류 해결: [코어 퀵스타트](docs/core-quickstart.md)

```powershell
npm run build:core
node .\examples\compose-selected-commits.mjs <repoPath> <baseRef> <headRef> <commit...>
```

## 저장소 구조

```text
build/            webpack 설정
tsconfig/         TypeScript 설정
scripts/          저장소 검사 스크립트
security/         보안 권고 허용 목록
docs/             개발 문서와 화면 기준 이미지
examples/         코어 라이브러리 예제
openspec/         명세와 변경 기록
src/              제품 코드
test/             테스트
```

루트에는 각 도구가 고정 위치에서 읽는 설정과 문서만 유지.

## 코드 구조

```text
src/
├─ history/        저장소 이력과 비교 범위
├─ composition/    선택 커밋 합성과 결과 수집
├─ symbols/        심볼 판정, 검색, 파일 읽기
├─ grouping/       경로 prefix 규칙과 변경 파일 그룹화
├─ base-tree/      비교 기준 커밋의 추적 경로 조회
├─ git/            Git 실행 경계
└─ desktop/
   ├─ main/        Git, 파일 시스템, 결과 계산
   ├─ preload/     renderer용 typed API
   ├─ shared/      프로세스 간 계약
   └─ renderer/    React UI
```

- renderer의 Node.js·Electron 직접 사용 금지
- main/preload/renderer 의존성은 ESLint와 TypeScript 설정으로 검사

## 화면 기준

| Tree View | List View |
|---|---|
| ![Tree View](docs/assets/prettifer-desktop-workbench-tree-view.png) | ![List View](docs/assets/prettifer-desktop-workbench-list-view.png) |

## 지원 범위

### 지원

- 선형 이력의 비연속 커밋 선택
- 선택 커밋의 최종 파일 상태와 통합 diff 생성
- 텍스트 파일 추가·수정·삭제 및 바이너리 파일 구분
- 이전 계산 취소와 최신 결과만 표시
- 계산 중 저장소 상태와 Git 메타데이터 보존
- 병합 커밋 기준 부모 선택
- 실패 파일을 분리한 부분 결과
- 실행 인자로 저장소 열기
- 좌우·인라인 diff 보기 전환과 스크롤 위치 유지
- Java, C/C++, TypeScript, JavaScript 심볼 정의·참조 탐색
- 선택 결과 밖의 파일을 비교 기준 시점 내용으로 표시
- 저장소별 경로 prefix 규칙으로 변경 파일 그룹화(Config View)
- 저장소 전체 구조 안에서 변경 위치 확인과 변경되지 않은 파일 검토(Full Tree)

### 미지원

- 정규식과 glob 기반 그룹 규칙
- 그룹 규칙의 팀 간 공유
- 파일별 커밋 흐름
- 커밋별 변경 파일 탐색
- 조상 관계가 없는 커밋의 적용 순서 지정
- 전체 Git 그래프와 불완전 이력 진단
- rename 추론과 루트 커밋 비교
- 타입 기반 오버로드 해석과 스코프 추적
- 저장소 열기 외의 공개 CLI
- 설치 프로그램, 코드 서명, 자동 업데이트
