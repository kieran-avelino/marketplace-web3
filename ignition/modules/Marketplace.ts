import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// taxa inicial 250 = 2,5%
export default buildModule("MarketplaceModule", (m) => {
  const feeBps = m.getParameter("feeBps", 250n);
  const marketplace = m.contract("Marketplace", [feeBps]);
  return { marketplace };
});
