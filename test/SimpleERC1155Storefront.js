const { expect } = require("chai");
const { ethers } = require("hardhat");
require("@nomicfoundation/hardhat-chai-matchers");

describe("SimpleERC1155Storefront and Escrow", function () {
  let SimpleERC1155Storefront, simpleERC1155Storefront;
  let SimpleEscrow, escrowContract;
  let EscrowFactory, escrowFactory;
  let MockSeaport, mockSeaport;
  let MockERC20, mockERC20;
  let MockERC1155, mockERC1155;
  let owner,
    designatedArbiter,
    addr1,
    addr2,
    addr3,
    payee,
    payer,
    arbiter,
    storefront;
  let minSettleTime, initialSettleDeadline;

  const ItemType = {
    NATIVE: 0,
    ERC20: 1,
    ERC721: 2,
    ERC1155: 3,
    ERC721_WITH_CRITERIA: 4,
    ERC1155_WITH_CRITERIA: 5,
  };

  beforeEach(async function () {
    [
      owner,
      designatedArbiter,
      addr1,
      addr2,
      addr3,
      payee,
      payer,
      arbiter,
      storefront,
    ] = await ethers.getSigners();

    MockSeaport = await ethers.getContractFactory("MockSeaport");
    mockSeaport = await MockSeaport.deploy();

    MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("MockToken", "MTK");

    MockERC1155 = await ethers.getContractFactory("MockERC1155");
    mockERC1155 = await MockERC1155.deploy();

    MockERC721 = await ethers.getContractFactory("MockERC721");
    mockERC721 = await MockERC721.deploy("MockNFT", "MNFT");

    EscrowFactory = await ethers.getContractFactory("EscrowFactory");
    escrowFactory = await EscrowFactory.deploy();

    minSettleTime = 7 * 24 * 60 * 60; // 1 week
    initialSettleDeadline = 3 * 7 * 24 * 60 * 60; // 3 weeks

    SimpleERC1155Storefront = await ethers.getContractFactory(
      "SimpleERC1155Storefront",
    );
    simpleERC1155Storefront = await SimpleERC1155Storefront.deploy(
      await mockSeaport.getAddress(),
      designatedArbiter.address,
      await escrowFactory.getAddress(),
      await mockERC1155.getAddress(),
      minSettleTime,
      initialSettleDeadline,
    );

    await simpleERC1155Storefront.initialize();

    // Mint some ERC1155 tokens to the storefront
    await mockERC1155.mint(
      await simpleERC1155Storefront.getAddress(),
      1,
      100,
      "0x",
    );
    await mockERC1155.mint(
      await simpleERC1155Storefront.getAddress(),
      2,
      50,
      "0x",
    );
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await simpleERC1155Storefront.owner()).to.equal(owner.address);
    });

    it("Should set the right designated arbiter", async function () {
      expect(await simpleERC1155Storefront.designatedArbiter()).to.equal(
        designatedArbiter.address,
      );
    });

    it("Should set the right Seaport address", async function () {
      expect(await simpleERC1155Storefront.SEAPORT()).to.equal(
        await mockSeaport.getAddress(),
      );
    });

    it("Should set the right ERC1155 token address", async function () {
      expect(await simpleERC1155Storefront.erc1155Token()).to.equal(
        await mockERC1155.getAddress(),
      );
    });

    it("Should initialize with ready state as false", async function () {
      expect(await simpleERC1155Storefront.ready()).to.be.false;
    });
  });

  describe("Ready State", function () {
    it("Should allow owner to toggle ready state", async function () {
      await simpleERC1155Storefront.toggleReady();
      expect(await simpleERC1155Storefront.ready()).to.be.true;

      await simpleERC1155Storefront.toggleReady();
      expect(await simpleERC1155Storefront.ready()).to.be.false;
    });

    it("Should not allow non-owner to toggle ready state", async function () {
      await expect(simpleERC1155Storefront.connect(addr1).toggleReady())
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });
  });

  describe("Token Listing", function () {
    it("Should list a token correctly", async function () {
      await simpleERC1155Storefront.listToken(
        1,
        ethers.parseEther("1"),
        ethers.ZeroAddress,
      );
      const listing = await simpleERC1155Storefront.listings(1);
      expect(listing.tokenId).to.equal(1n);
      expect(listing.price).to.equal(ethers.parseEther("1"));
      expect(listing.paymentToken).to.equal(ethers.ZeroAddress);
    });

    it("Should update a listing correctly", async function () {
      await simpleERC1155Storefront.listToken(
        1,
        ethers.parseEther("1"),
        ethers.ZeroAddress,
      );
      await simpleERC1155Storefront.updateListing(
        1,
        ethers.parseEther("2"),
        await mockERC20.getAddress(),
      );
      const listing = await simpleERC1155Storefront.listings(1);
      expect(listing.price).to.equal(ethers.parseEther("2"));
      expect(listing.paymentToken).to.equal(await mockERC20.getAddress());
    });

    it("Should remove a listing correctly", async function () {
      await simpleERC1155Storefront.listToken(
        1,
        ethers.parseEther("1"),
        ethers.ZeroAddress,
      );
      await simpleERC1155Storefront.removeListing(1);
      const listing = await simpleERC1155Storefront.listings(1);
      expect(listing.tokenId).to.equal(0n);
    });

    it("Should not allow non-owners to list tokens", async function () {
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .listToken(1, ethers.parseEther("1"), ethers.ZeroAddress),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });
  });

  //TODO: Add more preview, generation, fulfillment tests, new escrow creation tests

  describe("PreviewOrder Token Balance Check", function () {
    it("Should revert when storefront has no tokens", async function () {
      const tokenId = 999;
      const price = ethers.parseEther("1");

      // First mint and transfer the token to the storefront
      await mockERC1155.mint(
        await simpleERC1155Storefront.getAddress(),
        tokenId,
        1,
        "0x",
      );

      // List the token
      await simpleERC1155Storefront.listToken(
        tokenId,
        price,
        ethers.ZeroAddress,
      );
      await simpleERC1155Storefront.toggleReady();

      // Transfer the token away using rescueERC1155
      await simpleERC1155Storefront.rescueERC1155(
        await mockERC1155.getAddress(),
        tokenId,
        1,
      );

      // Verify balance is zero
      const balance = await mockERC1155.balanceOf(
        await simpleERC1155Storefront.getAddress(),
        tokenId,
      );
      expect(balance).to.equal(0n);

      // Create spent item array for preview
      const spentItems = [
        {
          itemType: ItemType.ERC1155,
          token: await mockERC1155.getAddress(),
          identifier: tokenId,
          amount: 1,
        },
      ];

      // Preview should revert with NoTokensAvailable error
      await expect(
        simpleERC1155Storefront.previewOrder(
          addr1.address,
          addr1.address,
          spentItems,
          [],
          "0x",
        ),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "NoTokensAvailable",
        )
        .withArgs(tokenId);
    });

    it("Should succeed when storefront has tokens", async function () {
      const tokenId = 1;
      const amount = 1;
      const price = ethers.parseEther("1");

      // Mint token to storefront
      await mockERC1155.mint(
        await simpleERC1155Storefront.getAddress(),
        tokenId,
        amount,
        "0x",
      );

      // List token
      await simpleERC1155Storefront.listToken(
        tokenId,
        price,
        ethers.ZeroAddress,
      );
      await simpleERC1155Storefront.toggleReady();

      // Create spent item array for preview
      const spentItems = [
        {
          itemType: ItemType.ERC1155,
          token: await mockERC1155.getAddress(),
          identifier: tokenId,
          amount: 1,
        },
      ];

      // Preview should succeed
      const result = await simpleERC1155Storefront.previewOrder(
        addr1.address,
        addr1.address,
        spentItems,
        [],
        "0x",
      );

      expect(result.offer.length).to.equal(1);
      expect(result.offer[0].identifier).to.equal(tokenId);
    });
  });
  describe("ERC1155 Token Address Management", function () {
    let newMockERC1155;

    beforeEach(async function () {
      const MockERC1155 = await ethers.getContractFactory("MockERC1155");
      newMockERC1155 = await MockERC1155.deploy();
    });

    it("Should allow owner to change ERC1155 token address", async function () {
      const oldAddress = await simpleERC1155Storefront.erc1155Token();
      await expect(
        simpleERC1155Storefront.setERC1155TokenAddress(
          await newMockERC1155.getAddress(),
        ),
      )
        .to.emit(simpleERC1155Storefront, "ERC1155TokenAddressChanged")
        .withArgs(oldAddress, await newMockERC1155.getAddress());

      expect(await simpleERC1155Storefront.erc1155Token()).to.equal(
        await newMockERC1155.getAddress(),
      );
    });

    it("Should not allow non-owner to change ERC1155 token address", async function () {
      const NewMockERC1155 = await ethers.getContractFactory("MockERC1155");
      const newMockERC1155 = await NewMockERC1155.deploy();
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .setERC1155TokenAddress(await newMockERC1155.getAddress()),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });
  });

  describe("Rescue Functions", function () {
    it("Should rescue ETH correctly", async function () {
      await owner.sendTransaction({
        to: await simpleERC1155Storefront.getAddress(),
        value: ethers.parseEther("1"),
      });

      const initialBalance = await ethers.provider.getBalance(owner.address);
      await simpleERC1155Storefront.rescueETH(ethers.parseEther("1"));
      const finalBalance = await ethers.provider.getBalance(owner.address);

      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should rescue ERC20 tokens correctly", async function () {
      const amount = ethers.parseEther("100");
      await mockERC20.mint(await simpleERC1155Storefront.getAddress(), amount);
      await simpleERC1155Storefront.rescueERC20(
        await mockERC20.getAddress(),
        amount,
      );
      expect(await mockERC20.balanceOf(owner.address)).to.equal(amount);
    });

    it("Should revert when ETH transfer fails", async function () {
      // First send some ETH to the contract
      await owner.sendTransaction({
        to: await simpleERC1155Storefront.getAddress(),
        value: ethers.parseEther("1"),
      });

      // Try to rescue more than available balance
      await expect(simpleERC1155Storefront.rescueETH(ethers.parseEther("2")))
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "InsufficientBalance",
        )
        .withArgs(ethers.parseEther("2"), ethers.parseEther("1"));
    });

    it("Should rescue ERC1155 tokens correctly", async function () {
      const id = 3;
      const amount = 100;
      await mockERC1155.mint(
        await simpleERC1155Storefront.getAddress(),
        id,
        amount,
        "0x",
      );
      await simpleERC1155Storefront.rescueERC1155(
        await mockERC1155.getAddress(),
        id,
        amount,
      );
      expect(await mockERC1155.balanceOf(owner.address, id)).to.equal(amount);
    });
  });

  describe("Ownership and Settings", function () {
    it("Should transfer ownership correctly", async function () {
      await simpleERC1155Storefront.transferOwnership(addr1.address);
      expect(await simpleERC1155Storefront.owner()).to.equal(addr1.address);
    });

    it("Should allow owner to set a new designated arbiter", async function () {
      await simpleERC1155Storefront.setDesignatedArbiter(addr1.address);
      expect(await simpleERC1155Storefront.designatedArbiter()).to.equal(
        addr1.address,
      );
    });
  });
  describe("Access Control", function () {
    it("Should not allow non-owners to rescue ETH", async function () {
      await owner.sendTransaction({
        to: await simpleERC1155Storefront.getAddress(),
        value: ethers.parseEther("1"),
      });
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .rescueETH(ethers.parseEther("1")),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to rescue ERC20 tokens", async function () {
      const amount = ethers.parseEther("100");
      await mockERC20.mint(await simpleERC1155Storefront.getAddress(), amount);
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .rescueERC20(await mockERC20.getAddress(), amount),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to rescue ERC721 tokens", async function () {
      await mockERC721.mint(await simpleERC1155Storefront.getAddress(), 1);
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .rescueERC721(await mockERC721.getAddress(), 1),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to rescue ERC1155 tokens", async function () {
      await mockERC1155.mint(
        await simpleERC1155Storefront.getAddress(),
        1,
        100,
        "0x",
      );
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .rescueERC1155(await mockERC1155.getAddress(), 1, 100),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to set a new designated arbiter", async function () {
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .setDesignatedArbiter(addr2.address),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to set a new ERC1155 token address", async function () {
      const NewMockERC1155 = await ethers.getContractFactory("MockERC1155");
      const newMockERC1155 = await NewMockERC1155.deploy();
      await expect(
        simpleERC1155Storefront
          .connect(addr1)
          .setERC1155TokenAddress(await newMockERC1155.getAddress()),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to toggle ready state", async function () {
      await expect(simpleERC1155Storefront.connect(addr1).toggleReady())
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });

    it("Should not allow non-owners to create a new escrow contract", async function () {
      await expect(
        simpleERC1155Storefront.connect(addr1).createNewEscrowContract(),
      )
        .to.be.revertedWithCustomError(
          simpleERC1155Storefront,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(addr1.address);
    });
  });

  describe("SimpleEscrow", function () {
    let SimpleEscrow, escrowContract;
    let payee, payer, arbiter, storefront;

    beforeEach(async function () {
      [payee, payer, arbiter, storefront] = [
        addr1,
        addr2,
        designatedArbiter,
        owner,
      ];

      // Instead of deploying directly, create through factory
      const tx = await escrowFactory.createEscrow(
        payee.address,
        storefront.address,
        arbiter.address,
      );
      const receipt = await tx.wait();

      // Get the escrow address from the event
      const event = receipt.logs.find(
        (log) => log.fragment?.name === "EscrowCreated",
      );
      const escrowAddress = event.args[0]; // first arg is escrow address

      // Get contract at deployed address
      SimpleEscrow = await ethers.getContractFactory("SimpleEscrow");
      escrowContract = SimpleEscrow.attach(escrowAddress);
    });
    describe("Arbiter and Escape Changes", function () {
      let escapeAddr, nonAuthorized, newArbiter;
      const oneEther = ethers.parseEther("1");

      beforeEach(async function () {
        escapeAddr = addr3;
        nonAuthorized = owner;
        newArbiter = addr3;

        // Setup escrow with payer and funds
        await escrowContract.connect(storefront).setPayer(payer.address, 1000);
        await payer.sendTransaction({
          to: await escrowContract.getAddress(),
          value: oneEther,
        });
      });

      describe("Arbiter Change", function () {
        it("should allow payee to propose new arbiter", async function () {
          await expect(
            escrowContract.connect(payee).changeArbiter(newArbiter.address),
          )
            .to.emit(escrowContract, "ArbiterChangeProposed")
            .withArgs(arbiter.address, newArbiter.address);

          expect(await escrowContract.proposedArbiter()).to.equal(
            newArbiter.address,
          );
        });

        it("should not allow non-payee to propose new arbiter", async function () {
          await expect(
            escrowContract
              .connect(nonAuthorized)
              .changeArbiter(newArbiter.address),
          ).to.be.revertedWithCustomError(escrowContract, "NotAuthorized");
        });

        it("should not allow proposing zero address as arbiter", async function () {
          await expect(
            escrowContract.connect(payee).changeArbiter(ethers.ZeroAddress),
          ).to.be.revertedWithCustomError(
            escrowContract,
            "InvalidArbiterAddress",
          );
        });

        it("should allow payer to approve proposed arbiter change", async function () {
          await escrowContract.connect(payee).changeArbiter(newArbiter.address);

          await expect(
            escrowContract.connect(payer).approveArbiter(newArbiter.address),
          )
            .to.emit(escrowContract, "ArbiterChangeApproved")
            .withArgs(arbiter.address, newArbiter.address, payer.address);

          expect(await escrowContract.arbiter()).to.equal(newArbiter.address);
          expect(await escrowContract.proposedArbiter()).to.equal(
            ethers.ZeroAddress,
          );
        });

        it("should not allow payer to approve non-proposed arbiter", async function () {
          await escrowContract.connect(payee).changeArbiter(newArbiter.address);

          await expect(
            escrowContract.connect(payer).approveArbiter(nonAuthorized.address),
          ).to.be.revertedWithCustomError(
            escrowContract,
            "InvalidArbiterAddress",
          );
        });

        it("should not allow payer to approve arbiter if no change proposed", async function () {
          await expect(
            escrowContract.connect(payer).approveArbiter(newArbiter.address),
          ).to.be.revertedWithCustomError(
            escrowContract,
            "InvalidArbiterAddress",
          );
        });
      });

      describe("Escape", function () {
        beforeEach(async function () {
          await escrowContract
            .connect(arbiter)
            .setEscapeAddress(escapeAddr.address);
        });

        it("should allow payee to escape with correct escape address", async function () {
          const initialBalance = await ethers.provider.getBalance(
            escapeAddr.address,
          );

          await expect(
            escrowContract
              .connect(payee)
              .escape(ethers.ZeroAddress, oneEther, escapeAddr.address),
          )
            .to.emit(escrowContract, "Escaped")
            .withArgs(escapeAddr.address, ethers.ZeroAddress, oneEther);

          expect(await ethers.provider.getBalance(escapeAddr.address)).to.equal(
            initialBalance + oneEther,
          );
        });

        it("should allow payer to escape with correct escape address", async function () {
          const initialBalance = await ethers.provider.getBalance(
            escapeAddr.address,
          );

          await expect(
            escrowContract
              .connect(payer)
              .escape(ethers.ZeroAddress, oneEther, escapeAddr.address),
          )
            .to.emit(escrowContract, "Escaped")
            .withArgs(escapeAddr.address, ethers.ZeroAddress, oneEther);

          expect(await ethers.provider.getBalance(escapeAddr.address)).to.equal(
            initialBalance + oneEther,
          );
        });

        it("should not allow escape with incorrect escape address", async function () {
          await expect(
            escrowContract
              .connect(payee)
              .escape(ethers.ZeroAddress, oneEther, nonAuthorized.address),
          ).to.be.revertedWithCustomError(
            escrowContract,
            "InvalidEscapeAddress",
          );
        });

        it("should not allow non-payee/payer to escape", async function () {
          await expect(
            escrowContract
              .connect(nonAuthorized)
              .escape(ethers.ZeroAddress, oneEther, escapeAddr.address),
          ).to.be.revertedWithCustomError(escrowContract, "NotPayerOrPayee");
        });

        it("should not allow escape if no escape address is set", async function () {
          // Create new escrow through factory
          const tx = await escrowFactory.createEscrow(
            payee.address,
            storefront.address,
            arbiter.address,
          );
          const receipt = await tx.wait();

          // Get the escrow address from the event
          const event = receipt.logs.find(
            (log) => log.fragment?.name === "EscrowCreated",
          );
          const escrowAddress = event.args[0];

          // Get contract at deployed address
          const newEscrowContract = SimpleEscrow.attach(escrowAddress);

          // Setup payer
          await newEscrowContract
            .connect(storefront)
            .setPayer(payer.address, 1000);
          await payer.sendTransaction({
            to: await newEscrowContract.getAddress(),
            value: oneEther,
          });

          await expect(
            newEscrowContract
              .connect(payee)
              .escape(ethers.ZeroAddress, oneEther, escapeAddr.address),
          ).to.be.revertedWithCustomError(
            newEscrowContract,
            "InvalidEscapeAddress",
          );
        });

        it("should handle ERC20 token escapes", async function () {
          const tokenAmount = ethers.parseEther("100");
          await mockERC20.mint(await escrowContract.getAddress(), tokenAmount);

          await expect(
            escrowContract
              .connect(payee)
              .escape(
                await mockERC20.getAddress(),
                tokenAmount,
                escapeAddr.address,
              ),
          )
            .to.emit(escrowContract, "Escaped")
            .withArgs(
              escapeAddr.address,
              await mockERC20.getAddress(),
              tokenAmount,
            );

          expect(await mockERC20.balanceOf(escapeAddr.address)).to.equal(
            tokenAmount,
          );
        });
      });
    });

    describe("Deployment", function () {
      it("Should set the correct initial values", async function () {
        expect(await escrowContract.payee()).to.equal(payee.address);
        expect(await escrowContract.storefront()).to.equal(storefront.address);
        expect(await escrowContract.arbiter()).to.equal(arbiter.address);
      });
    });

    describe("Setting Payer", function () {
      it("Should allow storefront to set payer", async function () {
        const settleDeadline = 60 * 60 * 24 * 7; // 1 week
        const tx = await escrowContract
          .connect(storefront)
          .setPayer(payer.address, settleDeadline);
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        const expectedSettleTime = block.timestamp + settleDeadline;

        await expect(tx)
          .to.emit(escrowContract, "PayerSet")
          .withArgs(payer.address, expectedSettleTime);

        expect(await escrowContract.payer()).to.equal(payer.address);
      });
    });

    describe("Settlement and Refund", function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const oneEther = ethers.parseEther("1");
      const settleTime = 1000; // 1000 seconds

      beforeEach(async function () {
        await escrowContract
          .connect(storefront)
          .setPayer(payer.address, settleTime);
        await payer.sendTransaction({
          to: await escrowContract.getAddress(),
          value: oneEther,
        });
      });

      it("Should allow payer to settle with ETH immediately", async function () {
        await expect(
          escrowContract.connect(payer).settle(zeroAddress, oneEther),
        )
          .to.emit(escrowContract, "Settled")
          .withArgs(payee.address, zeroAddress, oneEther);
      });

      it("Should not allow payee to settle with ETH before settle time", async function () {
        await expect(
          escrowContract.connect(payee).settle(zeroAddress, oneEther),
        ).to.be.revertedWithCustomError(SimpleEscrow, "CannotSettleYet");
      });

      it("Should allow payee to settle with ETH after settle time", async function () {
        await ethers.provider.send("evm_increaseTime", [settleTime + 1]);
        await ethers.provider.send("evm_mine");

        await expect(
          escrowContract.connect(payee).settle(zeroAddress, oneEther),
        )
          .to.emit(escrowContract, "Settled")
          .withArgs(payee.address, zeroAddress, oneEther);
      });

      it("Should allow payee to settle with ERC20 after settle time", async function () {
        const tokenAmount = ethers.parseEther("50");
        await mockERC20.mint(await escrowContract.getAddress(), tokenAmount);

        await ethers.provider.send("evm_increaseTime", [settleTime + 1]);
        await ethers.provider.send("evm_mine");

        await expect(
          escrowContract
            .connect(payee)
            .settle(await mockERC20.getAddress(), tokenAmount),
        )
          .to.emit(escrowContract, "Settled")
          .withArgs(payee.address, await mockERC20.getAddress(), tokenAmount);
      });

      it("Should allow payee to refund with ETH", async function () {
        await expect(
          escrowContract.connect(payee).refund(zeroAddress, oneEther),
        )
          .to.emit(escrowContract, "Refunded")
          .withArgs(payer.address, zeroAddress, oneEther);
      });

      it("Should not allow payer to refund", async function () {
        await expect(
          escrowContract.connect(payer).refund(zeroAddress, oneEther),
        ).to.be.revertedWithCustomError(SimpleEscrow, "NotAuthorized");
      });

      it("Should not allow settlement if escrow is disputed", async function () {
        await escrowContract.connect(payer).dispute();
        await expect(
          escrowContract.connect(payer).settle(zeroAddress, oneEther),
        ).to.be.revertedWithCustomError(SimpleEscrow, "PaymentDisputed");
      });

      it("Should allow settlement after dispute is removed", async function () {
        await escrowContract.connect(payer).dispute();
        await escrowContract.connect(payer).removeDispute();
        await expect(
          escrowContract.connect(payer).settle(zeroAddress, oneEther),
        )
          .to.emit(escrowContract, "Settled")
          .withArgs(payee.address, zeroAddress, oneEther);
      });

      it("Should not allow non-payer to remove dispute", async function () {
        await escrowContract.connect(payer).dispute();
        await expect(
          escrowContract.connect(payee).removeDispute(),
        ).to.be.revertedWithCustomError(SimpleEscrow, "NotPayer");
        await expect(
          escrowContract.connect(arbiter).removeDispute(),
        ).to.be.revertedWithCustomError(SimpleEscrow, "NotPayer");
      });

      it("Should allow settlement with ERC20 tokens", async function () {
        const tokenAmount = ethers.parseEther("100");
        await mockERC20.mint(await escrowContract.getAddress(), tokenAmount);

        await expect(
          escrowContract
            .connect(payer)
            .settle(await mockERC20.getAddress(), tokenAmount),
        )
          .to.emit(escrowContract, "Settled")
          .withArgs(payee.address, await mockERC20.getAddress(), tokenAmount);

        expect(await mockERC20.balanceOf(payee.address)).to.equal(tokenAmount);
      });

      it("Should resolve dispute correctly with settlement", async function () {
        await escrowContract.connect(payer).dispute();
        await escrowContract
          .connect(arbiter)
          .resolveDispute(true, zeroAddress, oneEther);
        expect(
          await ethers.provider.getBalance(await escrowContract.getAddress()),
        ).to.equal(0n);
      });

      it("Should resolve dispute correctly with refund", async function () {
        await escrowContract.connect(payer).dispute();
        await escrowContract
          .connect(arbiter)
          .resolveDispute(false, zeroAddress, oneEther);
        expect(await ethers.provider.getBalance(payer.address)).to.be.gt(
          oneEther,
        );
      });

      it("Should allow partial settlement", async function () {
        const initialBalance = await ethers.provider.getBalance(
          await escrowContract.getAddress(),
        );
        const partialAmount = ethers.parseEther("0.5");

        await expect(
          escrowContract.connect(payer).settle(zeroAddress, partialAmount),
        )
          .to.emit(escrowContract, "Settled")
          .withArgs(payee.address, zeroAddress, partialAmount);

        // Check remaining balance
        const finalBalance = await ethers.provider.getBalance(
          await escrowContract.getAddress(),
        );
        expect(finalBalance).to.equal(initialBalance - partialAmount);
      });
    });
  });
});
