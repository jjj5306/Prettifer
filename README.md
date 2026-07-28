# Prettifer

Git 이력에서 서로 떨어진 커밋을 골라, 선택한 변경만 반영된 최종 파일 상태와
하나의 통합 diff를 만들어 검토하는 Windows 데스크톱 도구입니다.

이 문서는 **저장소에서 작업하는 사람과 AI 에이전트를 위한 안내**입니다.
사용자용 설치 방법, 기능 소개와 버그 리포트는 배포용 저장소를 참고하세요.

## 시작하기 전에 읽을 문서

작업을 시작하는 에이전트는 다음 순서로 읽습니다.

| 순서 | 문서 | 내용 |
|---|---|---|
| 1 | [AGENTS.md](AGENTS.md) | 이슈 기반 작업, SDD/TDD, 코드 품질, 커밋과 PR 규칙 |
| 2 | [openspec/specs/](openspec/specs/) | **현재 구현된 동작의 기준**. 항상 진실이어야 함 |
| 3 | [openspec/changes/](openspec/changes/) | 진행 중인 변경 제안 |
| 4 | 연결된 GitHub 이슈 | 목적, 범위, 완료 기준 |

## OpenSpec 워크플로

이 저장소는 OpenSpec 기반 SDD(Spec-Driven Development)로 개발합니다. 명세가
구현의 기준이며, 코드보다 명세를 먼저 확정합니다.

### 디렉터리 구조

```text
openspec/
├─ config.yaml            스키마(spec-driven)와 프로젝트 컨텍스트, 작성 규칙
├─ specs/                 메인 스펙 - 현재 구현된 동작만 담는다
│  └─ <capability>/spec.md
└─ changes/
   ├─ <change-name>/      진행 중인 변경
   │  ├─ proposal.md      왜 / 무엇을 / 어떤 capability
   │  ├─ design.md        어떻게 / 결정과 근거 / 위험
   │  ├─ specs/<capability>/spec.md   delta spec (ADDED/MODIFIED/REMOVED/RENAMED)
   │  └─ tasks.md         검증 가능한 구현 단위
   └─ archive/YYYY-MM-DD-<change-name>/   완료되어 아카이빙된 변경
```

**메인 스펙(`openspec/specs/`)에는 실제로 구현된 동작만 둡니다.** 미구현
아이디어는 change나 GitHub 이슈에 두고, 메인 스펙에 섞지 않습니다.

### 진행 순서

```text
propose ──▶ apply ──▶ verify ──▶ sync-specs ──▶ archive
제안 작성    구현       검증        메인 스펙 반영    변경 보관
```

| 단계 | 스킬 | 하는 일 |
|---|---|---|
| propose | `/openspec-propose` | change 생성과 proposal, design, specs, tasks 작성 |
| apply | `/openspec-apply-change` | tasks를 순서대로 구현하고 체크박스 갱신 |
| verify | `/openspec-verify-change` | 완전성, 정확성, 일관성 검증 |
| sync | `/openspec-sync-specs` | delta spec을 메인 스펙에 반영 |
| archive | `/openspec-archive-change` | 완료된 change를 `changes/archive/`로 이동 |

아이디어 단계에서는 `/openspec-explore`로 먼저 정리할 수 있습니다.
커밋은 `/prettifer-commit`, PR은 `/prettifer-pr` 스킬을 사용합니다.

### 기본 규칙

- 구현 전에 proposal, specs, design, tasks를 읽습니다.
- 구현 중 요구사항이 바뀌면 OpenSpec을 함께 갱신합니다.
- 구현이 끝난 change만 아카이빙합니다. 진행 중인 change는 sync하지 않습니다.
- 명세와 구현이 다르면 방치하지 않고 요구사항을 확인한 뒤 일치시킵니다.

```powershell
npx openspec list                          # change 목록과 진행률
npx openspec status --change <name>        # 아티팩트 완료 상태
npx openspec validate --all --strict       # 전체 검증
```

## 개발 환경 퀵스타트

### 요구 사항

- Node.js `22.13+` 또는 `24+`
- Git `2.30+`
- Windows (데스크톱 앱과 Playwright Electron 검증 기준 환경)

```powershell
node --version
git --version
```

### 설치와 실행

```powershell
npm ci
npm run desktop:start
```

### 검증

작업 완료 전에 다음을 모두 통과해야 합니다.

```powershell
npm test                                   # 유닛 테스트
npm run lint                               # ESLint
npm run typecheck                          # 프로세스 경계별 TypeScript 검사
npm run test:desktop:e2e                   # 패키징 + Playwright Electron
npx openspec validate --all --strict       # OpenSpec
```

`npm run test:desktop:e2e`는 `electron-forge package`를 먼저 실행합니다.
Prettifer 앱이 실행 중이면 `out/desktop/prettifer-win32-x64`가 잠겨 패키징이
실패하므로 앱을 닫고 실행합니다.

### 패키지 산출물

```powershell
npm run desktop:package                    # out/desktop/prettifer-win32-x64/
npm run desktop:make                       # out/desktop/make/zip/win32/x64/
```

### 코어 라이브러리

코어만 따로 쓰려면 빌드 후 예제를 실행합니다. 공개 API와 CLI 형식은 아직
보장하지 않습니다.

```powershell
npm run build
node .\examples\compose-selected-commits.mjs <repoPath> <baseRef> <headRef> <commit...>
```

## 코드 구조

```text
src/
├─ history/        저장소 이력과 비교 범위 조회
├─ composition/    통합 결과 계산 (임시 worktree, sparse checkout, 선택 적용)
├─ git/            Git 실행 경계
└─ desktop/
   ├─ main/        Electron main - Git, 파일 시스템, 결과 계산
   ├─ preload/     typed API만 노출
   ├─ shared/      main과 renderer가 공유하는 계약
   └─ renderer/    React UI (기능별 폴더에 컴포넌트/상태/스타일/테스트)
```

프로세스 경계는 ESLint `no-restricted-imports`와 프로세스별 TypeScript 설정으로
강제합니다. renderer는 Node.js와 Electron 모듈을 직접 쓰지 않고 preload가 공개한
typed API만 호출합니다.

## 화면 기준

데스크톱 앱은 graphite 계열 어두운 배경과 보라색 강조색을 사용하고 화면 문구는
영어로 제공합니다. 아래 목업은 색상과 시각 밀도의 기준입니다.

| Tree View | List View |
|---|---|
| ![Tree View](docs/assets/prettifer-desktop-workbench-tree-view.png) | ![List View](docs/assets/prettifer-desktop-workbench-list-view.png) |

## 현재 지원 범위

메인 스펙에 기록된 동작이 기준입니다. 아직 구현하지 않은 항목은 GitHub 이슈로
관리합니다.

**지원함**

- 하나의 조상 관계로 정렬할 수 있는 선형 이력에서 비연속 커밋 선택
- 같은 파일을 여러 번 변경한 선택의 최종 상태 합성
- 텍스트 파일의 추가, 수정, 삭제와 바이너리 파일 식별
- 선택 변경 시 최신 계산 결과 게시와 이전 계산 취소
- 계산 중 사용자 branch, HEAD, staged/unstaged/untracked 상태 보존

**아직 지원하지 않음**

- 변경 파일 그룹화 · 파일별 커밋 흐름 · 커밋별 변경 파일 탐색
- 충돌 파일의 부분 결과와 파일별 문제 상태
- merge commit 기준 부모 선택 · 조상 관계 없는 커밋의 적용 순서 확인
- rename 추론, 루트 커밋 비교
- 공개 CLI, 설치 프로그램, 코드 서명, 자동 업데이트
