// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {SimpleERC1155Storefront} from "./SimpleERC1155Storefront.sol";

contract SimpleERC1155StorefrontFactory {
    event StorefrontCreated(address indexed storefront, address indexed owner, address erc1155Token);

    address public immutable SEAPORT;
    address public immutable ESCROW_FACTORY;
    uint256 public immutable MIN_SETTLE_TIME;

    constructor(address _seaport, address _escrowFactory, uint256 _minSettleTime) {
        SEAPORT = _seaport;
        ESCROW_FACTORY = _escrowFactory;
        MIN_SETTLE_TIME = _minSettleTime;
    }

    function createStorefront(
        address designatedArbiter,
        address erc1155Token,
        uint256 initialSettleDeadline
    ) public returns (address) {
        SimpleERC1155Storefront newStorefront = new SimpleERC1155Storefront(
            SEAPORT,
            designatedArbiter,
            ESCROW_FACTORY,
            erc1155Token,
            MIN_SETTLE_TIME,
            initialSettleDeadline
        );

        newStorefront.transferOwnership(msg.sender);
        newStorefront.initialize();
        emit StorefrontCreated(address(newStorefront), msg.sender, erc1155Token);
        
        return address(newStorefront);
    }
}
