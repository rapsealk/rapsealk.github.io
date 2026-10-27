---
title: "Kotlin 키워드 정리"
date: "2020-01-24"
---

Java에서 사용하던 키워드 중 Kotlin에서 대응되는 키워드 목록을 (**Java** -> **Kotlin**) 형태로 나열해보려 한다.

\* **native** -> **external**

Java에서는 JNI(Java Native Interface)를 이용하여 C++로 작성된 함수를 실행할 때 **native** 키워드를 이용해서 함수를 선언해준다.

```java
public native void print_hello();
```

Kotlin에서는 **external** 키워드를 이용하여 아래와 같이 선언할 수 있다.

```kotlin
public external fun print_hello()
```

...
