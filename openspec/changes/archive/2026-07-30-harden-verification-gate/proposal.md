## Why

이슈 #37로 Pull Request 검사를 추가했지만 게이트로 신뢰하기에는 세 가지가 남았다.

1. e2e 하나가 간헐적으로 실패한다(#40). 무작위로 빨간불이 되는 검사는 게이트가 아니다.
   실패하면 사람이 "또 그거겠지" 하고 넘기게 되고, 그 순간 게이트는 의미를 잃는다.
2. 릴리스 워크플로의 검증 step이 lint와 typecheck 실패를 가린다(#41). 공개 배포
   저장소로 나가는 경로에 게이트가 사실상 없다.
3. AGENTS.md가 완료 조건으로 정한 OpenSpec 형식 검증이 검사에 빠져 있다(#42). CLI가
   전역 설치라서 깨끗한 환경에서 실행할 수 없었기 때문이다.

세 항목 모두 "검증했다고 말할 수 있는 근거"에 관한 것이므로 하나의 변경으로 묶는다.

## What Changes

제품 동작은 바뀌지 않는다. 검증 경로만 바꾼다.

- 간헐적으로 실패하는 e2e의 원인을 규명해 제거한다. 재시도나 대기 시간 증가로 덮지
  않는다.
- 릴리스 워크플로의 검증 step을 명령마다 나눈다.
- OpenSpec CLI를 버전 고정 devDependency로 만들고, PR 검사에 형식 검증을 추가한다.
- 전역 설치를 전제로 한 README와 AGENTS.md 안내를 실제 실행 방식으로 갱신한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

없음. 사용자가 관찰하는 동작이 바뀌지 않는 검증 경로 변경이므로 메인 스펙은 변경하지
않는다. 이 change의 검증 기준은 실제 검사 실행 결과와 e2e 반복 실행 결과다.

## Impact

- `test/e2e/desktop-flow.e2e.ts`: 간헐적 실패의 원인 제거
- `.github/workflows/publish-release.yml`: 검증 step 분리
- `.github/workflows/pull-request-checks.yml`: OpenSpec 형식 검증 step 추가
- `package.json`, `package-lock.json`: `@fission-ai/openspec` 버전 고정 devDependency
- `README.md`, `AGENTS.md`: OpenSpec CLI 실행 방식 안내
- 제품 코드(`src/`)는 변경하지 않는다
