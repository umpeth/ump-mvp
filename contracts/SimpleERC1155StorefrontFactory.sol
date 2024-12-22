// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {SimpleERC1155Storefront} from "./SimpleERC1155Storefront.sol";

contract SimpleERC1155StorefrontFactory {
    event StorefrontCreated(
        address indexed storefront, 
        address indexed owner, 
        address erc1155Token, 
        address escrowFactory);

    address public immutable SEAPORT;
    address public immutable ESCROW_FACTORY;
    uint256 public immutable MIN_SETTLE_TIME;

    constructor(address _seaport, address _escrowFactory, uint256 _minSettleTime) {
        SEAPORT = _seaport;
        MIN_SETTLE_TIME = _minSettleTime;
    }

    function createStorefront(
        address designatedArbiter,
        address erc1155Token,
        address escrowFactory,
        uint256 initialSettleDeadline
    ) public returns (address) {
        SimpleERC1155Storefront newStorefront = new SimpleERC1155Storefront(
            SEAPORT,
            designatedArbiter,
            escrowFactory,
            erc1155Token,
            MIN_SETTLE_TIME,
            initialSettleDeadline
        );

        newStorefront.transferOwnership(msg.sender);
        newStorefront.initialize();
        emit StorefrontCreated(
            address(newStorefront), 
            msg.sender, 
            erc1155Token, 
            escrowFactory
        );
        
        return address(newStorefront);
    }
}
