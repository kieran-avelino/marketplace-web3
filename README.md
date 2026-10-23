# TeyvatMarket

Trabalho da 2ª avaliação prática (Opção B): mercado descentralizado inspirado em Genshin Impact.

Os mercadores de Teyvat cadastram itens, os viajantes compram pagando em ETH (as nossas Moras) e todas as compras ficam registradas no histórico. Depois da compra, o viajante pode avaliar o item de 1 a 5 estrelas. A Guilda dos Aventureiros fica com uma taxa de cada venda.

## Como rodar

```bash
npm install
npm run compile
npm test
npm run gas
```

## Pastas

- `contracts/` contrato `TeyvatMarket` em Solidity
- `test/` testes
- `ignition/modules/` script de deploy
- `frontend/` interface Web3 (`index.html`, ethers.js + MetaMask)
- `hardhat.config.ts` configuração (Sepolia)

## Deploy na Sepolia

Precisa configurar as variáveis antes (uma por vez):

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY
npm run deploy:sepolia
```

Usar uma carteira só de teste, nunca a principal.

## Contrato publicado (Sepolia)

- Endereço: `0xB5f5945aaB733399871027A3ec526e3690beD4Fd`
- Etherscan (código verificado): https://sepolia.etherscan.io/address/0xB5f5945aaB733399871027A3ec526e3690beD4Fd#code
- Transação de deploy: `0xee71e8ae49cfac99549d033a6a463b9a6667ed28308d339e1632e58aeb959ee9`

## Como abrir o frontend

Com a MetaMask instalada e na rede Sepolia, na raiz do projeto:

```bash
npx serve frontend
```

Abrir `http://localhost:3000`. O endereço do contrato está na constante `CONTRACT_ADDRESS` do `index.html`.
