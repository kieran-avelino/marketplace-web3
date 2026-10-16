// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Marketplace descentralizado (Opção B)
// vendedor cadastra produto, comprador paga em ETH e a compra fica no histórico
contract Marketplace {
    struct Product {
        uint256 id;
        string name;
        string description;
        string imageURI;
        uint256 price; // em wei
        uint256 stock;
        address seller;
        bool active;
        uint256 ratingSum; // soma de todas as notas
        uint256 ratingCount; // quantas avaliações recebeu
    }

    struct Purchase {
        uint256 id;
        uint256 productId;
        address buyer;
        address seller;
        uint256 quantity;
        uint256 totalPaid;
        uint256 timestamp;
        bool rated; // true depois que o comprador avalia
    }

    address public immutable owner;
    uint256 public platformFeeBps; // 250 = 2,5%
    uint256 public constant MAX_FEE_BPS = 1000; // máx 10%

    uint256 public productCount;
    uint256 public purchaseCount;

    mapping(uint256 => Product) private products;
    mapping(uint256 => Purchase) private purchases;
    mapping(address => uint256[]) private purchasesByBuyer;
    mapping(address => uint256[]) private salesBySeller;
    mapping(address => uint256[]) private productsBySeller;
    mapping(address => uint256) public pendingWithdrawals; // saldo que cada um pode sacar

    bool private locked;

    event ProductAdded(uint256 indexed productId, address indexed seller, string name, uint256 price, uint256 stock);
    event ProductUpdated(uint256 indexed productId, uint256 price, uint256 stock, bool active);
    event ProductPurchased(
        uint256 indexed purchaseId,
        uint256 indexed productId,
        address indexed buyer,
        address seller,
        uint256 quantity,
        uint256 totalPaid
    );
    event ProductRated(uint256 indexed purchaseId, uint256 indexed productId, address indexed buyer, uint8 rating);
    event Withdrawal(address indexed account, uint256 amount);
    event PlatformFeeChanged(uint256 oldFeeBps, uint256 newFeeBps);

    modifier onlyOwner() {
        require(msg.sender == owner, "Apenas o dono da plataforma");
        _;
    }

    modifier productExists(uint256 _productId) {
        require(_productId > 0 && _productId <= productCount, "Produto inexistente");
        _;
    }

    modifier onlySeller(uint256 _productId) {
        require(products[_productId].seller == msg.sender, "Apenas o vendedor do produto");
        _;
    }

    // evita chamar a função de novo antes dela terminar
    modifier nonReentrant() {
        require(!locked, "Reentrancia bloqueada");
        locked = true;
        _;
        locked = false;
    }

    constructor(uint256 _platformFeeBps) {
        require(_platformFeeBps <= MAX_FEE_BPS, "Taxa acima do limite");
        owner = msg.sender;
        platformFeeBps = _platformFeeBps;
    }

    function addProduct(
        string calldata _name,
        string calldata _description,
        string calldata _imageURI,
        uint256 _price,
        uint256 _stock
    ) external returns (uint256) {
        require(bytes(_name).length > 0, "Nome obrigatorio");
        require(_price > 0, "Preco deve ser maior que zero");
        require(_stock > 0, "Estoque deve ser maior que zero");

        productCount++;
        products[productCount] = Product({
            id: productCount,
            name: _name,
            description: _description,
            imageURI: _imageURI,
            price: _price,
            stock: _stock,
            seller: msg.sender,
            active: true,
            ratingSum: 0,
            ratingCount: 0
        });
        productsBySeller[msg.sender].push(productCount);

        emit ProductAdded(productCount, msg.sender, _name, _price, _stock);
        return productCount;
    }

    function updateProduct(uint256 _productId, uint256 _price, uint256 _stock, bool _active)
        external
        productExists(_productId)
        onlySeller(_productId)
    {
        require(_price > 0, "Preco deve ser maior que zero");
        Product storage p = products[_productId];
        p.price = _price;
        p.stock = _stock;
        p.active = _active;
        emit ProductUpdated(_productId, _price, _stock, _active);
    }

    function buyProduct(uint256 _productId, uint256 _quantity)
        external
        payable
        productExists(_productId)
        nonReentrant
    {
        Product storage p = products[_productId];

        require(p.active, "Produto indisponivel");
        require(_quantity > 0, "Quantidade invalida");
        require(p.stock >= _quantity, "Estoque insuficiente");
        require(msg.sender != p.seller, "Vendedor nao pode comprar o proprio produto");
        require(msg.value == p.price * _quantity, "Valor enviado incorreto");

        // atualiza o estado antes de mexer no dinheiro
        p.stock -= _quantity;

        uint256 fee = (msg.value * platformFeeBps) / 10_000;
        pendingWithdrawals[p.seller] += msg.value - fee;
        pendingWithdrawals[owner] += fee;

        purchaseCount++;
        purchases[purchaseCount] = Purchase({
            id: purchaseCount,
            productId: _productId,
            buyer: msg.sender,
            seller: p.seller,
            quantity: _quantity,
            totalPaid: msg.value,
            timestamp: block.timestamp,
            rated: false
        });
        purchasesByBuyer[msg.sender].push(purchaseCount);
        salesBySeller[p.seller].push(purchaseCount);

        emit ProductPurchased(purchaseCount, _productId, msg.sender, p.seller, _quantity, msg.value);
    }

    // só quem comprou pode avaliar, e só uma vez por compra
    function rateProduct(uint256 _purchaseId, uint8 _rating) external {
        require(_purchaseId > 0 && _purchaseId <= purchaseCount, "Compra inexistente");

        Purchase storage c = purchases[_purchaseId];
        require(c.buyer == msg.sender, "Apenas o comprador pode avaliar");
        require(!c.rated, "Compra ja avaliada");
        require(_rating >= 1 && _rating <= 5, "Nota deve ser de 1 a 5");

        c.rated = true;

        Product storage p = products[c.productId];
        p.ratingSum += _rating;
        p.ratingCount++;

        emit ProductRated(_purchaseId, c.productId, msg.sender, _rating);
    }

    // o ETH fica no contrato até o vendedor sacar
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nada para sacar");

        pendingWithdrawals[msg.sender] = 0; // zera antes de enviar
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Falha no envio de ETH");

        emit Withdrawal(msg.sender, amount);
    }

    function setPlatformFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= MAX_FEE_BPS, "Taxa acima do limite");
        emit PlatformFeeChanged(platformFeeBps, _newFeeBps);
        platformFeeBps = _newFeeBps;
    }

    // funções de leitura (o front usa pra montar a tela)

    function getProduct(uint256 _productId) external view productExists(_productId) returns (Product memory) {
        return products[_productId];
    }

    function getAllProducts() external view returns (Product[] memory list) {
        list = new Product[](productCount);
        for (uint256 i = 0; i < productCount; i++) {
            list[i] = products[i + 1];
        }
    }

    // devolve soma e quantidade, o front divide pra achar a média
    function getRating(uint256 _productId)
        external
        view
        productExists(_productId)
        returns (uint256 sum, uint256 count)
    {
        Product storage p = products[_productId];
        return (p.ratingSum, p.ratingCount);
    }

    function getPurchase(uint256 _purchaseId) external view returns (Purchase memory) {
        require(_purchaseId > 0 && _purchaseId <= purchaseCount, "Compra inexistente");
        return purchases[_purchaseId];
    }

    function getPurchasesByBuyer(address _buyer) external view returns (Purchase[] memory) {
        return _toPurchases(purchasesByBuyer[_buyer]);
    }

    function getSalesBySeller(address _seller) external view returns (Purchase[] memory) {
        return _toPurchases(salesBySeller[_seller]);
    }

    function getProductsBySeller(address _seller) external view returns (uint256[] memory) {
        return productsBySeller[_seller];
    }

    // transforma lista de ids em lista de compras
    function _toPurchases(uint256[] storage ids) private view returns (Purchase[] memory list) {
        list = new Purchase[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = purchases[ids[i]];
        }
    }
}