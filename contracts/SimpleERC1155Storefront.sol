// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {
    ERC1155Interface
} from "seaport-types/src/interfaces/AbridgedTokenInterfaces.sol";

import {ContractOffererInterface} from "seaport-types/src/interfaces/ContractOffererInterface.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ItemType} from "seaport-types/src/lib/ConsiderationEnums.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReceivedItem, Schema, SpentItem} from "seaport-types/src/lib/ConsiderationStructs.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";  
import {EscrowFactory} from "./EscrowFactory.sol";
import {SimpleEscrow} from "./SimpleEscrow.sol";

// Custom errors
error NoTokensAvailable(uint256 tokenId);
error AlreadyInitialized();
error StorefrontNotReady();
error InsufficientTokenBalance(uint256 tokenId);
error InvalidSettleDeadline(uint256 newDeadline, uint256 minDeadline);
error EmptySpentItems();
error NotSeaport();
error InsufficientBalance(uint256 requested, uint256 available);
error TransferFailed();

contract SimpleERC1155Storefront is ContractOffererInterface, Ownable, ERC165 {

    struct TokenListing {
        uint256 tokenId;
        uint256 price;
        address paymentToken; 
        uint256 listingTime;
    }

    address public designatedArbiter;
    EscrowFactory public escrowFactory;
    SimpleEscrow public escrowContract;
    address public immutable SEAPORT;
    uint256 public immutable MIN_SETTLE_TIME;
    uint256 public settleDeadline;
    
    bool public ready;

    bool private _initialized;



    mapping(uint256 => TokenListing) public listings;
    uint256[] public listedTokenIds;

    ERC1155Interface public erc1155Token;

    event StorefrontOrderFulfilled(
        uint256 tokenId,
        uint256 amount,
        address buyer,
        address paymentToken,
        uint256 price,
        address escrowContract
    );

    event ReadyStateChanged(bool newState);
    event SettleDeadlineUpdated(uint256 newSettleDeadline);
    event ERC1155TokenAddressChanged(address indexed oldAddress, address indexed newAddress);
    event ListingAdded(uint256 indexed tokenId, uint256 price, address indexed paymentToken);
    event ListingUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice, address oldPaymentToken, address indexed newPaymentToken);
    event ListingRemoved(uint256 indexed tokenId, uint256 price, address indexed paymentToken);

    constructor(
        address seaport,
        address _designatedArbiter,
        address _escrowFactory,
        address _erc1155Token,
        uint256 _minSettleTime,
        uint256 _initialSettleDeadline
    ) Ownable(msg.sender) {
        SEAPORT = seaport;
        designatedArbiter = _designatedArbiter;
        escrowFactory = EscrowFactory(_escrowFactory);
        erc1155Token = ERC1155Interface(_erc1155Token);
        MIN_SETTLE_TIME = _minSettleTime;
        if (_initialSettleDeadline < _minSettleTime) {
            revert InvalidSettleDeadline(_initialSettleDeadline, _minSettleTime);
        }        settleDeadline = _initialSettleDeadline;
        ready = false;
        _initialized = false;
    }

    function initialize() external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        _createNewEscrowContract();
    }

    receive() external payable {}

    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        virtual 
        override(ERC165, ContractOffererInterface) 
        returns (bool) 
    {
        return
            interfaceId == type(ContractOffererInterface).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function setERC1155TokenAddress(address _newERC1155Token) external onlyOwner {
        // TODO: think more about how to handle existing listings when calling this
        address oldAddress = address(erc1155Token);
        erc1155Token = ERC1155Interface(_newERC1155Token);
        ready = false; 
        emit ERC1155TokenAddressChanged(oldAddress, _newERC1155Token);
    }

    function setSettleDeadline(uint256 _newSettleDeadline) external onlyOwner {
        if (_newSettleDeadline < MIN_SETTLE_TIME) {
            revert InvalidSettleDeadline(_newSettleDeadline, MIN_SETTLE_TIME);
        }
        settleDeadline = _newSettleDeadline;
        emit SettleDeadlineUpdated(_newSettleDeadline);
    }

    function setDesignatedArbiter(address _newArbiter) external onlyOwner {
        designatedArbiter = _newArbiter;
    }

    function toggleReady() external onlyOwner {
        ready = !ready;
        emit ReadyStateChanged(ready);
    }

    function listToken(uint256 tokenId, uint256 price, address paymentToken) external onlyOwner {
        if (erc1155Token.balanceOf(address(this), tokenId) == 0) {
            revert InsufficientTokenBalance(tokenId);
        }
        listings[tokenId] = TokenListing(tokenId, price, paymentToken, block.timestamp);
        listedTokenIds.push(tokenId);
        erc1155Token.setApprovalForAll(SEAPORT, true); // Might move this to setERC1155TokenAddress

        emit ListingAdded(tokenId,price,paymentToken);
    }

    function updateListing(uint256 tokenId, uint256 newPrice, address newPaymentToken) external onlyOwner {
        TokenListing memory oldListing = listings[tokenId];
        listings[tokenId].price = newPrice;
        listings[tokenId].paymentToken = newPaymentToken;
        listings[tokenId].listingTime = block.timestamp;

        emit ListingUpdated(tokenId, oldListing.price, newPrice, oldListing.paymentToken, newPaymentToken);
    }

    function removeListing(uint256 tokenId) external onlyOwner {
        TokenListing memory listing = listings[tokenId];
        delete listings[tokenId];
        for (uint256 i = 0; i < listedTokenIds.length; i++) {
            if (listedTokenIds[i] == tokenId) {
                listedTokenIds[i] = listedTokenIds[listedTokenIds.length - 1];
                listedTokenIds.pop();
                break;
            }
        }
            emit ListingRemoved(tokenId, listing.price, listing.paymentToken);
    }

    function previewOrder(
        address,
        address,
        SpentItem[] calldata spentItems,
        SpentItem[] calldata,
        bytes calldata
    ) external view override returns (SpentItem[] memory offer, ReceivedItem[] memory consideration) {
        if (!ready) revert StorefrontNotReady();
        if (spentItems.length == 0) revert EmptySpentItems();
        
        uint256 tokenId = spentItems[0].identifier;
        
        // Check if the storefront has at least one token
        if (erc1155Token.balanceOf(address(this), tokenId) < 1) {
            revert NoTokensAvailable(tokenId);
        }

        TokenListing memory listing = listings[tokenId];

        offer = new SpentItem[](1);
        offer[0] = SpentItem({
            itemType: ItemType.ERC1155,
            token: address(erc1155Token),
            identifier: tokenId,
            amount: 1
        });

        consideration = new ReceivedItem[](1);
        consideration[0] = ReceivedItem({
            itemType: listing.paymentToken == address(0) ? ItemType.NATIVE : ItemType.ERC20,
            token: listing.paymentToken,
            identifier: 0,
            amount: listing.price,
            recipient: payable(address(escrowContract))
        });

        return (offer, consideration);
    }

    function generateOrder(
        address fulfiller,
        SpentItem[] calldata spentItems,
        SpentItem[] calldata,
        bytes calldata
    ) external override returns (SpentItem[] memory offer, ReceivedItem[] memory consideration) {
        if (!ready) revert StorefrontNotReady();
        if (msg.sender != SEAPORT) revert NotSeaport();
        if (spentItems.length == 0) revert EmptySpentItems();

        uint256 tokenId = spentItems[0].identifier;
        TokenListing memory listing = listings[tokenId];

        offer = new SpentItem[](1);
        offer[0] = SpentItem({
            itemType: ItemType.ERC1155,
            token: address(erc1155Token),
            identifier: tokenId,
            amount: 1
        });

        consideration = new ReceivedItem[](1);
        consideration[0] = ReceivedItem({
            itemType: listing.paymentToken == address(0) ? ItemType.NATIVE : ItemType.ERC20,
            token: listing.paymentToken,
            identifier: 0,
            amount: listing.price,
            recipient: payable(address(escrowContract))
        });

        // Set the payer in the escrow contract
        escrowContract.setPayer(fulfiller, settleDeadline);


        return (offer, consideration);
    }

    function ratifyOrder(
        SpentItem[] calldata offer,
        ReceivedItem[] calldata consideration,
        bytes calldata, // context
        bytes32[] calldata, // orderHashes
        uint256 //contractNonce
    ) external override returns (bytes4) {
        if (msg.sender != SEAPORT) revert NotSeaport();
        
        emit StorefrontOrderFulfilled(
            offer[0].identifier,      // tokenId
            offer[0].amount,          // amount
            consideration[0].recipient, // buyer
            consideration[0].token,    // paymentToken
            consideration[0].amount,   // price
            address(escrowContract)    // escrowContract
        );

        _createNewEscrowContract();

        return this.ratifyOrder.selector;
    }

    function changeOwnership(address newOwner) external onlyOwner {
        transferOwnership(newOwner);
    }

    function createNewEscrowContract() external onlyOwner {
        _createNewEscrowContract();
    }

    function _createNewEscrowContract() internal {
        address escrowAddress = escrowFactory.createEscrow(
            owner(),
            address(this),
            designatedArbiter
        );

        escrowContract = SimpleEscrow(payable(escrowAddress));
    }


    function rescueETH(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }
        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    function getArbiter() public view returns (address) {
        return designatedArbiter;
    }

    function getEscrowContract() public view returns (address) {
        return address(escrowContract);
    }

    function rescueERC20(address tokenAddress, uint256 amount) external onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (amount > balance) {
            revert InsufficientBalance(amount, balance);
        }
        if (!token.transfer(owner(), amount)) revert TransferFailed();
    }

    function rescueERC721(address tokenAddress, uint256 tokenId) external onlyOwner {
        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
    }

    function rescueERC1155(address tokenAddress, uint256 id, uint256 amount) external onlyOwner {
        IERC1155(tokenAddress).safeTransferFrom(address(this), owner(), id, amount, "");
    }

    function onERC721Received(address, address, uint256, bytes memory) public virtual returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes memory) public virtual returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory) public virtual returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function getSeaportMetadata()
        external
        pure
        override
        returns (string memory name, Schema[] memory schemas)
    {
        schemas = new Schema[](1);
        schemas[0].id = 1337;
        schemas[0].metadata = new bytes(0);

        return ("SimpleERC1155Storefront", schemas);
    }
}