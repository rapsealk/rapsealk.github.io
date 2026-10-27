---
title: "Windows 환경에서 virtualenv 사용하기"
date: "2021-03-23"
---

Python 프로젝트를 운용할 경우, 모듈들이 중복되거나 꼬이는 현상을 막기 위하여 독립된 공간이 필요할 때가 있다. 이럴 때 사용할 수 있는 것이 바로 virtualenv(이하 venv)다.

Windows 환경에서 virtualenv를 사용하기 위해서는 PowerShell을 "관리자 권한으로 실행"한 후 아래의 명령어를 실행시켜야 한다.

```cs
Set-ExecutionPolicy Unrestricted -Force
```

이후 여느 환경과 동일하게 사용하면 된다.

```python
source venv/Scripts/activate
```
