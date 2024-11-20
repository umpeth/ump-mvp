// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {
    ReceivedItem,
    SpentItem,
    Schema
} from "seaport-types/src/lib/ConsiderationStructs.sol";

import {SimpleERC1155Storefront} from "../SimpleERC1155Storefront.sol";

contract MockSeaport {
    function callGenerateOrder(
        SimpleERC1155Storefront escrowStorefront,
        address fulfiller,
        SpentItem[] calldata minimumReceived,
        SpentItem[] calldata maximumSpent,
        bytes calldata context
    ) external returns (SpentItem[] memory offer, ReceivedItem[] memory consideration) {
        return escrowStorefront.generateOrder(fulfiller, minimumReceived, maximumSpent, context);
    }

    function callRatifyOrder(
        SimpleERC1155Storefront escrowStorefront,
        SpentItem[] calldata offer,
        ReceivedItem[] calldata consideration,
        bytes calldata context,
        bytes32[] calldata orderHashes,
        uint256 contractNonce
    ) external returns (bytes4) {
        return escrowStorefront.ratifyOrder(offer, consideration, context, orderHashes, contractNonce);
    }
}
