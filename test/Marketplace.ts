import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const ETH = (v: string) => ethers.parseEther(v);
const FEE_BPS = 250n; // 2,5%

// deploy limpo pra cada teste
async function deploy() {
  const [owner, seller, buyer, other] = await ethers.getSigners();
  const market = await ethers.deployContract("Marketplace", [FEE_BPS]);
  return { market, owner, seller, buyer, other };
}

async function deployWithProduct() {
  const ctx = await deploy();
  await ctx.market
    .connect(ctx.seller)
    .addProduct("Camiseta Web3", "Algodao 100%", "ipfs://img", ETH("0.01"), 10n);
  return ctx;
}

describe("Marketplace", function () {
  describe("constructor", function () {
    it("define dono e taxa", async function () {
      const { market, owner } = await deploy();
      expect(await market.owner()).to.equal(owner.address);
      expect(await market.platformFeeBps()).to.equal(FEE_BPS);
    });

    it("rejeita taxa acima de 10%", async function () {
      await expect(ethers.deployContract("Marketplace", [1001n])).to.be.revertedWith("Taxa acima do limite");
    });
  });

  describe("cadastro de produtos", function () {
    it("cadastra produto e emite evento", async function () {
      const { market, seller } = await deploy();
      await expect(market.connect(seller).addProduct("Caneca", "Ceramica", "", ETH("0.005"), 5n))
        .to.emit(market, "ProductAdded")
        .withArgs(1n, seller.address, "Caneca", ETH("0.005"), 5n);

      const p = await market.getProduct(1n);
      expect(p.name).to.equal("Caneca");
      expect(p.seller).to.equal(seller.address);
      expect(p.active).to.equal(true);
      expect(await market.productCount()).to.equal(1n);
      expect((await market.getAllProducts()).length).to.equal(1);
    });

    it("valida nome, preco e estoque", async function () {
      const { market } = await deploy();
      await expect(market.addProduct("", "", "", 1n, 1n)).to.be.revertedWith("Nome obrigatorio");
      await expect(market.addProduct("X", "", "", 0n, 1n)).to.be.revertedWith("Preco deve ser maior que zero");
      await expect(market.addProduct("X", "", "", 1n, 0n)).to.be.revertedWith("Estoque deve ser maior que zero");
    });

    it("so o vendedor atualiza o produto", async function () {
      const { market, seller, other } = await deployWithProduct();
      await expect(market.connect(other).updateProduct(1n, ETH("0.02"), 3n, true)).to.be.revertedWith(
        "Apenas o vendedor do produto",
      );
      await expect(market.connect(seller).updateProduct(1n, ETH("0.02"), 3n, false))
        .to.emit(market, "ProductUpdated")
        .withArgs(1n, ETH("0.02"), 3n, false);
    });
  });

  describe("compra via ETH", function () {
    it("compra, baixa estoque, divide valor e grava historico", async function () {
      const { market, owner, seller, buyer } = await deployWithProduct();
      const total = ETH("0.02"); // 2 x 0.01

      await expect(market.connect(buyer).buyProduct(1n, 2n, { value: total }))
        .to.emit(market, "ProductPurchased")
        .withArgs(1n, 1n, buyer.address, seller.address, 2n, total);

      expect((await market.getProduct(1n)).stock).to.equal(8n);

      const fee = (total * FEE_BPS) / 10_000n;
      expect(await market.pendingWithdrawals(seller.address)).to.equal(total - fee);
      expect(await market.pendingWithdrawals(owner.address)).to.equal(fee);

      const history = await market.getPurchasesByBuyer(buyer.address);
      expect(history.length).to.equal(1);
      expect(history[0].quantity).to.equal(2n);
      expect((await market.getSalesBySeller(seller.address)).length).to.equal(1);
    });

    it("rejeita valor errado, estoque insuficiente, produto pausado e autocompra", async function () {
      const { market, seller, buyer } = await deployWithProduct();
      await expect(market.connect(buyer).buyProduct(1n, 1n, { value: ETH("0.005") })).to.be.revertedWith(
        "Valor enviado incorreto",
      );
      await expect(market.connect(buyer).buyProduct(1n, 11n, { value: ETH("0.11") })).to.be.revertedWith(
        "Estoque insuficiente",
      );
      await expect(market.connect(seller).buyProduct(1n, 1n, { value: ETH("0.01") })).to.be.revertedWith(
        "Vendedor nao pode comprar o proprio produto",
      );
      await expect(market.connect(buyer).buyProduct(99n, 1n, { value: ETH("0.01") })).to.be.revertedWith(
        "Produto inexistente",
      );
      await market.connect(seller).updateProduct(1n, ETH("0.01"), 10n, false);
      await expect(market.connect(buyer).buyProduct(1n, 1n, { value: ETH("0.01") })).to.be.revertedWith(
        "Produto indisponivel",
      );
    });
  });

  describe("saque", function () {
    it("vendedor saca o saldo e o saldo zera", async function () {
      const { market, seller, buyer } = await deployWithProduct();
      await market.connect(buyer).buyProduct(1n, 1n, { value: ETH("0.01") });
      const pending = await market.pendingWithdrawals(seller.address);

      await expect(market.connect(seller).withdraw()).to.changeEtherBalances(
        ethers,
        [seller, market],
        [pending, -pending],
      );
      expect(await market.pendingWithdrawals(seller.address)).to.equal(0n);
      await expect(market.connect(seller).withdraw()).to.be.revertedWith("Nada para sacar");
    });
  });

  describe("administracao", function () {
    it("so o dono altera a taxa", async function () {
      const { market, other } = await deploy();
      await expect(market.connect(other).setPlatformFee(100n)).to.be.revertedWith("Apenas o dono da plataforma");
      await expect(market.setPlatformFee(100n)).to.emit(market, "PlatformFeeChanged").withArgs(FEE_BPS, 100n);
    });
  });
});
