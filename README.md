# SimpleERC1155Storefront Project

## Overview

This project implements a decentralized marketplace for ERC1155 tokens with an integrated escrow system. It's built to work with OpenSea's Seaport protocol, providing a secure and flexible platform for listing and selling ERC1155 tokens.

## Key Components

1. **SimpleERC1155Storefront**: The main contract that interacts with Seaport and manages token listings.
2. **SimpleERC1155StorefrontFactory**: A factory contract for creating new SimpleERC1155Storefront contracts.
3. **ReceiptERC1155**: An ERC1155 token contract that serves as a receipt for purchases, with additional features.
4. **ReceiptERC1155Factory**: A factory contract for creating new ReceiptERC1155 contracts.
5. **SimpleEscrow**: A contract that holds funds in escrow for each transaction.
6. **EscrowFactory**: A factory contract for creating new escrow contracts.

## Smart Contracts

### SimpleERC1155Storefront

This contract implements the [`ContractOffererInterface`](https://github.com/ProjectOpenSea/seaport/blob/main/docs/SeaportDocumentation.md#contract-orders) to interact with Seaport. It allows for listing ERC1155 tokens, managing sales, and integrating with the escrow system.

Key functions:

- `listToken(uint256 tokenId, uint256 price, address paymentToken)`: Lists an ERC-1155 token for sale
- `updateListing(uint256 tokenId, uint256 newPrice, address newPaymentToken)`: Updates an existing listing
- `removeListing(uint256 tokenId)`: Removes a listing
- `toggleReady()`: Toggles the ready state of the storefront, allowing listings to be purchased
- `setEscrowFactory(address _newEscrowFactory)`: Sets a new escrow factory
- `setERC1155TokenAddress(address _newERC1155Token)`: Sets a new ERC1155 token address. The alpha version of this contract only allows listing tokens from a single ERC-1155 contract address.
- `setSettleDeadline(uint256 _newSettleDeadline)`: Sets a new settlement deadline time. The settlement deadline time cannot be set below minSettleTime to prevent an attack where a malicious storefront operator frontruns a buyer and sets a very short deadline time.
- `setDesignatedEscrowAgent(address _newEscrowAgent)`: Sets a new designated escrow agent
- `createNewEscrowContract()`: Creates a new escrow contract
- `previewOrder(...)`: Provides a preview of the order for Seaport
- `generateOrder(...)`: Generates an order when called by Seaport

### SimpleERC1155StorefrontFactory

A factory contract for creating new SimpleERC1155Storefront contracts.

Key functions:

- `createStorefront(address seaport, address designatedEscrowAgent, address escrowFactory, address erc1155Token, uint256 minSettleTime, uint256 initialSettleDeadline)`: Creates a new SimpleERC1155Storefront contract

### ReceiptERC1155

An ERC1155 token contract that represents receipts for purchases made through the storefront. It extends the standard ERC1155 functionality with additional features:

Key functions:

- `setTokenMetadata(uint256 tokenId, string memory name, string memory description, string memory image, string memory termsOfService, string[] memory supplementalImages)`: Sets metadata for a token
- `mint(address account, uint256 id, uint256 amount, bytes memory data)`: Mints new tokens
- `uri(uint256 tokenId)`: Returns the URI for a given token ID
- `getTokenMetadata(uint256 tokenId)`: Retrieves metadata for a given token ID

### ReceiptERC1155Factory

A factory contract for creating new ReceiptERC1155 contracts.

Key functions:

- `createReceiptERC1155(string memory name, string memory symbol, string memory baseURI)`: Creates a new ReceiptERC1155 contract

### SimpleEscrow

Holds funds in escrow for each transaction, ensuring secure transfers between buyers (payer) and sellers (payee).

Key functions:

- `setPayer(address _payer, uint256 settleDeadline)`: Sets the payer and settlement deadline. Can only be called by the storefront that created the escrow contract.
- `settle(address token, uint256 amount)`: Settles the transaction, sending funds to the payee. Can only be called by the payer before the settleTime.
- `refund(address token, uint256 amount)`: Refunds the payer, can only be called by the payee.
- `dispute()`: Initiates a dispute, can only be called by the payer.
- `removeDispute()`: Removes an existing dispute, can only be called by the payer.
- `resolveDispute(bool shouldSettle, address token, uint256 amount)`: Resolves a dispute. Can only be called by the escrowAgent. If shouldSettle is true, the funds are sent to the seller and a Settled event is emitted. If shouldSettle is false, the funds are sent to the buyer and a Refunded event is emitted.
- `setEscapeAddress(address _escapeAddress)`: Sets the escape address. Can only be called by the escrowAgent.
- `escape(address token, uint256 amount)`: Escapes funds to a predefined address. Can only be called by the payer or payee.

### EscrowFactory

A factory contract for creating new `SimpleEscrow` contracts for each sale.

Key functions:

- `createEscrow(address payee, address storefront, address escrowAgent)`: Creates a new escrow contract

## Listing Details

When creating a listing in the SimpleERC1155Storefront, sellers can specify:

1. `tokenId`: The ID of the ERC1155 token being listed
2. `price`: The price of the token
3. `paymentToken`: The token address used for payment (use address(0) for native ETH)

These parameters allow sellers to flexibly set up their listings according to their preferences and the nature of the goods being sold.

## Escrow Flow

1. The escrow contract is initialized with the payee (seller) and escrowAgent set.
2. When a buyer purchases an NFT, they are set as the payer in the escrow contract via `setPayer()`. A new escrow contract is created for the storefront's next buyer. SetPayer() also sets the `SettleTime` for the escrow contract to `minSettleTime` after the time of the purchase.
3. The buyer can call `settle()` if the goods arrive as described. If the buyer doesn't settle, the payee can settle after a deadline unless the buyer has initiated a dispute.
4. The buyer can call `dispute()` if the goods don't arrive or aren't as described, blocking the seller from settling.
5. The buyer can remove their dispute using `removeDispute()`.
6. The escrow agent can arbitrate using `resolveDispute()`, deciding on refund or settlement based on the terms of service. The escrow agent can grant partial refunds in case of disputes.
7. An `escape()` function is available for settlement when other options aren't satisfactory (e.g., to a Gnosis multi-sig).

## Setup and Deployment

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Hardhat

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/umpeth/ump-mvp
   cd ump-mvp
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file in the root directory and add your environment variables:
   ```
   PRIVATE_KEY=deployer_private_key
   INFURA_PROJECT_ID=your_infura_project_id
   BASESCAN_API_KEY=your_etherscan_api_key
   ```

### Compilation

Compile the smart contracts:

```
npm run compile
```

### Testing

Run the test suite:

```
npm run test
```

Or run with coverage enabled:

```
npm run test:coverage
```

### Deployment

1. Update the `scripts/deploy.js` file with the correct constructor parameters for your contracts.

2. Deploy to Base mainnet:
   ```
   npm run deploy
   ```

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request or stop by our Discord.

### License

This project is licensed under the GPLv3 license.
