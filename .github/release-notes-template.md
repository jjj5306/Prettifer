## Prettifer {{TAG}}

Windows x64 빌드입니다. ZIP을 원하는 곳에 풀고 `prettifer.exe`를 실행하세요.
`PATH`에 Git `2.30+`이 있어야 합니다.

설치, 사용법과 문제 해결: [사용 안내](https://github.com/{{RELEASE_REPOSITORY}}/blob/main/README.ko.md)
· [English](https://github.com/{{RELEASE_REPOSITORY}}#readme)

{{CHANGES}}

### 내려받은 파일 확인

```powershell
Get-FileHash .\prettifer-win32-x64-{{VERSION}}.zip -Algorithm SHA256
```

위 명령의 결과가 아래 값과 같아야 합니다.

```
{{SHA256}}
```

### 이 빌드의 출처

[{{SOURCE_REPOSITORY}}@{{SHORT_SHA}}](https://github.com/{{SOURCE_REPOSITORY}}/commit/{{SHA}}) 커밋에서 빌드했습니다.
