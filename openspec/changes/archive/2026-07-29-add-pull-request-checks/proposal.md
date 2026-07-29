## Why

이 저장소의 Pull Request에는 검사가 하나도 없다. `.github/workflows/`에는 tag 트리거
릴리스 워크플로만 있어서 `gh pr checks`는 항상 비어 있고, 병합 판단의 근거는 작성자가 PR
본문에 적은 로컬 실행 결과뿐이다.

그 결과 두 가지가 저장소에서 확인되지 않는다. 검증을 실제로 실행했는지, 그리고 개발자
기계가 아닌 깨끗한 환경에서도 통과하는지다. 이 저장소는 이미 후자에서 세 번 실패했다.
package-lock의 선택적 의존성 항목 누락(#28), 실행 환경에 따라 달라지는 임시 경로
처리(#29, #30)다. 모두 로컬에서는 통과하던 변경이었다.

작업 비중이 큰 AI 에이전트는 자신이 만든 변경을 스스로 검증하고 보고한다. 사람이 아닌
게이트가 없으면 그 보고가 유일한 근거가 된다.

## What Changes

제품 동작은 바뀌지 않는다. 저장소 자동화만 추가한다.

- Pull Request(대상 `main`)와 `main` push에서 실행되는 검사 워크플로를 추가한다.
- 프로젝트가 병합 게이트로 정한 명령을 실행한다: lint, typecheck, 전체 유닛 테스트,
  Electron e2e.
- 정적 검사와 비용이 큰 e2e를 분리해, 값싼 신호가 느린 작업을 기다리지 않게 한다.
- 실패한 e2e의 추적 자료를 artifact로 남긴다.
- 같은 PR에 새 커밋이 올라오면 이전 실행을 취소한다.
- 기존 릴리스 워크플로의 runner OS, Node 버전과 action 고정 방식을 그대로 따른다.
- 개발자 문서에 검사 워크플로와 로컬 명령의 관계를 기록한다.

## Capabilities

### New Capabilities

없음. 저장소 자동화는 제품 capability가 아니다.

### Modified Capabilities

없음. 사용자가 관찰하는 동작이 바뀌지 않으므로 메인 스펙은 변경하지 않는다. 이 change의
검증 기준은 워크플로 실행 결과 자체이며, 실제 Pull Request에서 확인한다.

## Impact

- `.github/workflows/pull-request-checks.yml`: 신규
- `README.md` 또는 `AGENTS.md`: 검사 워크플로와 로컬 검증 명령의 관계 기록
- `.github/workflows/publish-release.yml`: 변경 없음
- 저장소 설정(필수 검사 지정, branch protection)은 이 change의 범위가 아니며 저장소
  소유자가 직접 설정한다
- secret을 요구하는 단계는 추가하지 않는다
