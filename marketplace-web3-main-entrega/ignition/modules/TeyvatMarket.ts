import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// taxa da Guilda dos Aventureiros: 250 = 2,5%
export default buildModule("TeyvatMarketModule", (m) => {
  const feeBps = m.getParameter("feeBps", 250n);
  const market = m.contract("TeyvatMarket", [feeBps]);
  return { market };
});