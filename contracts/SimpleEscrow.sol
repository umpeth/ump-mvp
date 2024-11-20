// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


// Custom Errors
error NotStorefront();
error PayerAlreadySet();
error PaymentDisputed();
error NotAuthorized();
error CannotSettleYet();
error CannotDisputeSettledEscrow();
error NotDisputed();
error NoEscapeAddress();
error NotPayerOrPayee();
error NotArbiter();
error NotPayer();
error AlreadyInitialized();
error InvalidArbiterAddress();
error InvalidEscapeAddress();

contract SimpleEscrow {
    using SafeERC20 for IERC20;
    address public payee;
    address public payer;
    address public arbiter;
    address public storefront;
    address public escapeAddress;
    bool public isDisputed;
    bool public isSettled;
    uint256 public settleTime;
    bool private initialized;
    address public proposedArbiter;

    event Settled(address indexed to, address token, uint256 amount);
    event Refunded(address indexed to, address token, uint256 amount);
    event Disputed(address indexed disputeInitiator);
    event DisputeRemoved(address indexed disputeRemover);
    event DisputeResolved(address indexed resolver, bool settled);
    event EscapeAddressSet(address indexed escapeAddress);
    event Escaped(address indexed to, address token, uint256 amount);
    event PayerSet(address indexed payer, uint256 settleDeadline);
    event ArbiterChangeProposed(address indexed oldArbiter, address indexed proposedArbiter);
    event ArbiterChangeApproved(address indexed oldArbiter, address indexed newArbiter, address indexed approver);


    modifier onlyArbiter() {
        if (msg.sender != arbiter) {
            revert NotArbiter();
        }
        _;
    }

    modifier onlyPayer() {
        if (msg.sender != payer) {
            revert NotPayer();
        }
        _;
    }

    modifier onlyPayee() {
        if (msg.sender != payee) {
            revert NotAuthorized(); 
        }
        _;
    }   

    function initialize(address _payee, address _storefront, address _arbiter) external {
        if (initialized) {
            revert AlreadyInitialized();
        }
        payee = _payee;
        storefront = _storefront;
        arbiter = _arbiter;
        initialized = true;
    }

    receive() external payable {}

    function setPayer(address _payer, uint256 settleDeadline) external {
        if (msg.sender != storefront) {
            revert NotStorefront();
        }
        if (payer != address(0)) {
            revert PayerAlreadySet();
        }
        payer = _payer;
        settleTime = block.timestamp + settleDeadline;
        emit PayerSet(_payer, settleTime);
    }
    
    function settle(address token, uint256 amount) external {
        if (isDisputed) {
            revert PaymentDisputed();
        }
        if (msg.sender != payer && msg.sender != payee) {
            revert NotAuthorized();
        }
        
        if (msg.sender == payer) {
            isSettled = true;
        } else if (msg.sender == payee) {
            if (!(isSettled || block.timestamp >= settleTime)) { // Both must be false to block
                revert CannotSettleYet();                       // If payer has settled OR settleTime has passed, proceed
            }
        }

        _transferPayment(payee, token, amount);
        emit Settled(payee, token, amount);
    }

    function refund(address token, uint256 amount) external onlyPayee {
        _transferPayment(payer, token, amount);
        emit Refunded(payer, token, amount);
    }

    function dispute() external onlyPayer {
        if (isSettled) {
            revert CannotDisputeSettledEscrow();
        }
        isDisputed = true;
        emit Disputed(payer);
    }

    function removeDispute() external onlyPayer {
        if (!isDisputed) {
            revert NotDisputed();
        }
        isDisputed = false;
        emit DisputeRemoved(payer);
    }    
        
    function resolveDispute(bool shouldSettle, address token, uint256 amount) external onlyArbiter {
        if (!isDisputed) {
            revert NotDisputed();
        }
        if (shouldSettle) {
            _transferPayment(payee, token, amount);
            emit Settled(payee, token, amount);
        } else {
            _transferPayment(payer, token, amount);
            emit Refunded(payer, token, amount);
        }
        emit DisputeResolved(msg.sender, shouldSettle);
    }

    function setEscapeAddress(address _escapeAddress) external onlyArbiter {
        escapeAddress = _escapeAddress;
        emit EscapeAddressSet(_escapeAddress);
    }

    // payee can propose a new arbiter
    function changeArbiter(address _proposedArbiter) external onlyPayee {
        if (_proposedArbiter == address(0)) {
            revert InvalidArbiterAddress();
        }
        proposedArbiter = _proposedArbiter;
        emit ArbiterChangeProposed(arbiter, _proposedArbiter);
    }

    // payer can approve a proposed arbiter change
    function approveArbiter(address _proposedArbiter) external onlyPayer {
        if (proposedArbiter == address(0) || _proposedArbiter != proposedArbiter) {
            revert InvalidArbiterAddress();
        }

        address oldArbiter = arbiter;
        arbiter = _proposedArbiter;
        proposedArbiter = address(0); // Reset proposed arbiter

        emit ArbiterChangeApproved(oldArbiter, arbiter, msg.sender);
    }

    function escape(address token, uint256 amount, address _escapeAddress) external {
        if (msg.sender != payee && msg.sender != payer) {
            revert NotPayerOrPayee();
        }
        if (escapeAddress == address(0) || _escapeAddress != escapeAddress) {
            revert InvalidEscapeAddress();
        }

        _transferPayment(_escapeAddress, token, amount);
        emit Escaped(_escapeAddress, token, amount);
    }

    function _transferPayment(address to, address token, uint256 amount) private {
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}