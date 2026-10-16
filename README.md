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