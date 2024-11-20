// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {SimpleEscrow} from "./SimpleEscrow.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

contract EscrowFactory {
    using Clones for address;

    address public immutable escrowImplementation;
    
    event EscrowCreated(address indexed escrowAddress, address indexed payee, address indexed storefront, address arbiter);

    constructor() {
        // Deploy the implementation contract with no arguments
        escrowImplementation = address(new SimpleEscrow());
    }

    function createEscrow(
        address payee,
        address storefront, 
        address arbiter
    ) external returns (address) {
        // Create minimal proxy clone
        address payable clonedEscrow = payable(escrowImplementation.clone());
        
        // Initialize the clone with the desired parameters
        SimpleEscrow(clonedEscrow).initialize(payee, storefront, arbiter);
        
        emit EscrowCreated(clonedEscrow, payee, storefront, arbiter);
        return clonedEscrow;
    }
}