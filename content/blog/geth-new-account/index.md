---
title: "Geth 노드에 새로운 계정 추가하기"
date: "2018-08-01"
---

이더리움(Ethereum) 기반의 dApp을 만들면서 geth를 이용하여 프라이빗 노드를 실행하도록 했습니다. 우선 geth는 아래의 간단한 옵션을 추가하여 실행하도록 합니다.

  

```
~/ethereum$ geth --datadir . --rpcapi personal,db,eth,net,web3 console --rpc --dev
```

  

geth가 성공적으로 실행된다면 하나의 Etherbase 계정이 자동으로 생성될 것입니다. 이더리움 상의 트랜잭션은 기본적으로 두 개의 계좌 사이의 상호작용이기 때문에 하나 이상의 계정을 더 만들 필요가 있습니다. 따라서, 처음에는 아래와 같은 메서드를 통해 계정을 추가 생성하도록 했습니다.

  

const account \= await web3.eth.accounts.create(/\*

@entropy: at least 32 charactersd

\*/);

  

[web3.eth.accounts.create](https://web3js.readthedocs.io/en/1.0/web3-eth-accounts.html#create)는 계정의 복잡도를 높이기 위해 옵션으로 32자 이상의 문자열 entropy를 파라미터로 받습니다. 그리고 account 객체를 반환합니다. 그 형태는 아래와 같습니다.

  

web3.eth.accounts.create();
\> {
    address: "0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01",
    privateKey: "0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709",
    signTransaction: function(tx){...},
    sign: function(data){...},
    encrypt: function(password){...}
}

  

생성된 계정의 주소는 account.address의 형태로 접근할 수 있습니다.

  

  

○ ○ ○

  

  

하지만 문제점이 발생했습니다. 생성된 계정으로 트랜잭션을 발생시키려고 했으나 다음과 같은 에러를 발생시키며 동작하지 않았습니다.

  

const transaction \= await TokenContract.methods.airdrop(address, AIRDROP\_).send({

from: account.address,

gas: web3.utils.toWei('6000000', 'wei')

});  

  

  **sender account not recognized**    

  

web3.eth.accounts.create는 이더리움에서 사용하는 알고리즘을 이용하여 동일한 형태의 계정을 생성할 뿐, 네트워크에는 영향을 주지 않아서 그런 것으로 예상됩니다. 따라서 아래와 같이 [web3.eth.personal.newAccount](https://web3js.readthedocs.io/en/1.0/web3-eth-personal.html#newaccount)를 이용하여 계정을 생성해주도록 했습니다.

  

  

※ 주의: 이 글에서는 Web3 라이브러리 중 하나인 web3.js를 사용하고 있습니다. web3j등 다른 언어의 모듈을 사용할 경우 약간의 차이가 있을 수 있습니다.
