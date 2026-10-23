import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const ETH = (v: string) => ethers.parseEther(v);
const FEE_BPS = 250n; // taxa da Guilda: 2,5%

// owner = Arconte, seller = mercador, buyer = viajante
async function deploy() {
  const [owner, seller, buyer, other] = await ethers.getSigners();
  const market = await ethers.deployContract("TeyvatMarket", [FEE_BPS]);
  return { market, owner, seller, buyer, other };
}

async function deployWithProduct() {
  const ctx = await deploy();
  await ctx.market
    .connect(ctx.seller)
    .addProduct("Conselho do Andarilho", "Livro de EXP pra subir de nivel", "ipfs://conselho-do-andarilho", ETH("0.01"), 10n);
  return ctx;
}

// item cadastrado + 1 compra feita pelo viajante (compra id 1)
async function deployWithPurchase() {
  const ctx = await deployWithProduct();
  await ctx.market.connect(ctx.buyer).buyProduct(1n, 1n, { value: ETH("0.01") });
  return ctx;
}

describe("TeyvatMarket", function () {
  describe("constructor", function () {
    it("define o Arconte e a taxa da Guilda", async function () {
      const { market, owner } = await deploy();
      expect(await market.owner()).to.equal(owner.address);
      expect(await market.platformFeeBps()).to.equal(FEE_BPS);
    });

    it("rejeita taxa acima de 10%", async function () {
      await expect(ethers.deployContract("TeyvatMarket", [1001n])).to.be.revertedWith(
        "Taxa da Guilda acima do limite",
      );
    });
  });

  describe("cadastro de itens", function () {
    it("cadastra item e emite evento", async function () {
      const { market, seller } = await deploy();
      await expect(
        market.connect(seller).addProduct("Madame Doce", "Prato favorito dos viajantes de Mondstadt", "", ETH("0.005"), 5n),
      )
        .to.emit(market, "ProductAdded")
        .withArgs(1n, seller.address, "Madame Doce", ETH("0.005"), 5n);

      const p = await market.getProduct(1n);
      expect(p.name).to.equal("Madame Doce");
      expect(p.seller).to.equal(seller.address);
      expect(p.active).to.equal(true);
      expect(await market.productCount()).to.equal(1n);
      expect((await market.getAllProducts()).length).to.equal(1);
    });

    it("valida nome, preco e estoque", async function () {
      const { market } = await deploy();
      await expect(market.addProduct("", "", "", 1n, 1n)).to.be.revertedWith("O item precisa de um nome");
      await expect(market.addProduct("X", "", "", 0n, 1n)).to.be.revertedWith("O preco deve ser maior que zero");
      await expect(market.addProduct("X", "", "", 1n, 0n)).to.be.revertedWith("O estoque deve ser maior que zero");
    });

    it("so o mercador atualiza o item", async function () {
      const { market, seller, other } = await deployWithProduct();
      await expect(market.connect(other).updateProduct(1n, ETH("0.02"), 3n, true)).to.be.revertedWith(
        "Apenas o mercador deste item",
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

    it("rejeita valor errado, estoque insuficiente, item pausado e autocompra", async function () {
      const { market, seller, buyer } = await deployWithProduct();
      await expect(market.connect(buyer).buyProduct(1n, 1n, { value: ETH("0.005") })).to.be.revertedWith(
        "Valor em ETH incorreto",
      );
      await expect(market.connect(buyer).buyProduct(1n, 11n, { value: ETH("0.11") })).to.be.revertedWith(
        "Estoque insuficiente",
      );
      await expect(market.connect(seller).buyProduct(1n, 1n, { value: ETH("0.01") })).to.be.revertedWith(
        "Mercador nao pode comprar o proprio item",
      );
      await expect(market.connect(buyer).buyProduct(99n, 1n, { value: ETH("0.01") })).to.be.revertedWith(
        "Esse item nao existe em Teyvat",
      );
      await market.connect(seller).updateProduct(1n, ETH("0.01"), 10n, false);
      await expect(market.connect(buyer).buyProduct(1n, 1n, { value: ETH("0.01") })).to.be.revertedWith(
        "Item indisponivel no momento",
      );
    });
  });

  describe("avaliacao pos-compra", function () {
    it("viajante avalia, emite evento e atualiza as estrelas do item", async function () {
      const { market, buyer } = await deployWithPurchase();

      await expect(market.connect(buyer).rateProduct(1n, 4))
        .to.emit(market, "ProductRated")
        .withArgs(1n, 1n, buyer.address, 4);

      const [sum, count] = await market.getRating(1n);
      expect(sum).to.equal(4n);
      expect(count).to.equal(1n);
      expect((await market.getPurchase(1n)).rated).to.equal(true);
    });

    it("soma varias avaliacoes de compras diferentes", async function () {
      const { market, buyer, other } = await deployWithPurchase();
      await market.connect(other).buyProduct(1n, 1n, { value: ETH("0.01") });

      await market.connect(buyer).rateProduct(1n, 5);
      await market.connect(other).rateProduct(2n, 3);

      const [sum, count] = await market.getRating(1n);
      expect(sum).to.equal(8n);
      expect(count).to.equal(2n);
    });

    it("so o viajante daquela compra pode avaliar", async function () {
      const { market, seller, other } = await deployWithPurchase();
      await expect(market.connect(other).rateProduct(1n, 5)).to.be.revertedWith(
        "Apenas o viajante da compra pode avaliar",
      );
      await expect(market.connect(seller).rateProduct(1n, 5)).to.be.revertedWith(
        "Apenas o viajante da compra pode avaliar",
      );
    });

    it("nao deixa avaliar a mesma compra duas vezes", async function () {
      const { market, buyer } = await deployWithPurchase();
      await market.connect(buyer).rateProduct(1n, 5);
      await expect(market.connect(buyer).rateProduct(1n, 1)).to.be.revertedWith("Compra ja avaliada");
    });

    it("rejeita nota fora de 1 a 5 estrelas", async function () {
      const { market, buyer } = await deployWithPurchase();
      await expect(market.connect(buyer).rateProduct(1n, 0)).to.be.revertedWith("Nota deve ser de 1 a 5 estrelas");
      await expect(market.connect(buyer).rateProduct(1n, 6)).to.be.revertedWith("Nota deve ser de 1 a 5 estrelas");
    });

    it("rejeita compra que nao existe", async function () {
      const { market, buyer } = await deployWithPurchase();
      await expect(market.connect(buyer).rateProduct(99n, 5)).to.be.revertedWith("Compra inexistente");
    });
  });

  describe("saque", function () {
    it("mercador saca as Moras e o saldo zera", async function () {
      const { market, seller, buyer } = await deployWithProduct();
      await market.connect(buyer).buyProduct(1n, 1n, { value: ETH("0.01") });
      const pending = await market.pendingWithdrawals(seller.address);

      await expect(market.connect(seller).withdraw()).to.changeEtherBalances(
        ethers,
        [seller, market],
        [pending, -pending],
      );
      expect(await market.pendingWithdrawals(seller.address)).to.equal(0n);
      await expect(market.connect(seller).withdraw()).to.be.revertedWith("Nenhuma Mora para sacar");
    });
  });

  describe("administracao", function () {
    it("so o Arconte altera a taxa da Guilda", async function () {
      const { market, other } = await deploy();
      await expect(market.connect(other).setPlatformFee(100n)).to.be.revertedWith("Apenas o Arconte da loja");
      await expect(market.setPlatformFee(100n)).to.emit(market, "PlatformFeeChanged").withArgs(FEE_BPS, 100n);
    });
  });
});