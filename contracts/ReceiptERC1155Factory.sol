// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ReceiptERC1155} from "./ReceiptERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ReceiptERC1155Factory is Ownable {
    event ReceiptERC1155Created(address indexed tokenAddress, address indexed owner);

    constructor() Ownable(msg.sender) {}

    function createReceiptERC1155(string memory uri) public returns (address) {
        ReceiptERC1155 newToken = new ReceiptERC1155(uri);
        newToken.transferOwnership(msg.sender);
        
        emit ReceiptERC1155Created(address(newToken), msg.sender);
        return address(newToken);
    }
}

