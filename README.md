# Marketplace Web3

Trabalho da 2ª avaliação prática (Opção B): loja descentralizada com cadastro de produtos, compra em ETH e histórico de compras.

## Como rodar

```bash
npm install
npm run compile
npm test
npm run gas
```

## Pastas

- `contracts/` contrato em Solidity
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
