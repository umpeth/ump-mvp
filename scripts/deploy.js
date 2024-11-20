const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyContract(address, constructorArguments) {
  try {
    console.log(
      `Waiting 12 seconds before verifying contract at ${address}...`,
    );
    await sleep(12000); // Wait for 12 seconds
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
    console.log(`Contract at ${address} verified successfully.`);
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log(`Contract at ${address} is already verified.`);
    } else {
      console.error(`Error verifying contract at ${address}:`, error);
    }
  }
}

/**
 * Saves deployment information and ABI for a smart contract
 *
 * This function creates a single deployment file in the deployments directory:
 * ContractName-deployment.json
 *
 * If either file already exists, it will be removed and replaced with new data.
 * If a deployment file already exists, it will be removed and replaced with new data.
 *
 * @param {string} contractName - The name of the contract (e.g., "SimpleERC1155Storefront")
 * @param {string} address - The deployed contract's address
 * @param {Array} constructorArgs - Arguments used in the contract's constructor
 *
 * File Structure:
 * ContractName-deployment.json contains:
 *   - contractName: Name of the contract
 *   - address: Deployed contract address
 *   - constructorArguments: Constructor parameters used in deployment
 *   - deploymentTime: ISO timestamp of deployment
 *   - network: Network name
 *   - chainId: Network chain ID
 *   - abi: Contract ABI
 */
async function saveDeploymentInfo(contractName, address, constructorArgs) {
  const deploymentDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir);
  }

  const deploymentPath = path.join(
    deploymentDir,
    `${contractName}-deployment.json`,
  );

  if (fs.existsSync(deploymentPath)) {
    console.log(`Removing existing file: ${deploymentPath}`);
    fs.unlinkSync(deploymentPath);
  }

  const contractArtifact = artifacts.readArtifactSync(contractName);

  const deploymentInfo = {
    contractName,
    address,
    constructorArguments: constructorArgs,
    deploymentTime: new Date().toISOString(),
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    abi: contractArtifact.abi,
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Saved deployment info and ABI for ${contractName}`);
}

async function verifyProxy(proxyAddress, implementationAddress) {
  try {
    console.log(`Verifying proxy at ${proxyAddress}...`);
    await hre.run("verify:verify", {
      address: proxyAddress,
      // For minimal proxies specifically
      constructorArguments: [],
      contract: "contracts/SimpleEscrow.sol:SimpleEscrow",
    });
    console.log("Proxy verification complete");
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log("Proxy already verified");
    } else {
      console.error("Error verifying proxy:", error);
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy EscrowFactory
  console.log("Deploying EscrowFactory...");
  const EscrowFactory = await hre.ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy();
  await escrowFactory.waitForDeployment();
  const escrowFactoryAddress = await escrowFactory.getAddress();
  console.log("EscrowFactory deployed to:", escrowFactoryAddress);

  // Get the escrow implementation address
  const escrowImplementationAddress =
    await escrowFactory.escrowImplementation();
  console.log(
    "Escrow implementation deployed to:",
    escrowImplementationAddress,
  );

  await saveDeploymentInfo("EscrowFactory", escrowFactoryAddress, []);
  await saveDeploymentInfo("SimpleEscrow", escrowImplementationAddress, []);

  // Verify EscrowFactory and implementation
  await verifyContract(escrowFactoryAddress, []);
  await verifyContract(escrowImplementationAddress, []);
  // Deploy ReceiptERC1155Factory
  console.log("Deploying ReceiptERC1155Factory...");
  const ReceiptERC1155Factory = await hre.ethers.getContractFactory(
    "ReceiptERC1155Factory",
  );
  const receiptERC1155Factory = await ReceiptERC1155Factory.deploy();
  await receiptERC1155Factory.waitForDeployment();
  const receiptERC1155FactoryAddress = await receiptERC1155Factory.getAddress();
  console.log(
    "ReceiptERC1155Factory deployed to:",
    receiptERC1155FactoryAddress,
  );

  await saveDeploymentInfo(
    "ReceiptERC1155Factory",
    receiptERC1155FactoryAddress,
    [],
  );

  // Verify ReceiptERC1155Factory
  await verifyContract(receiptERC1155FactoryAddress, []);

  // Create a ReceiptERC1155 token using the factory
  console.log("Creating a ReceiptERC1155 token...");
  const contractURI = JSON.stringify({
    name: "Receipt Collection",
    description: "A collection of transaction receipts",
    image: "https://example.com/collection-image.png",
    external_link: "https://example.com",
    seller_fee_basis_points: 100,
    fee_recipient: deployer.address,
  });
  const createReceiptERC1155Tx =
    await receiptERC1155Factory.createReceiptERC1155(contractURI);
  const createReceiptERC1155Receipt = await createReceiptERC1155Tx.wait();

  const receiptERC1155CreatedEvent = createReceiptERC1155Receipt.logs.find(
    (log) => log.eventName === "ReceiptERC1155Created",
  );
  const receiptERC1155Address = receiptERC1155CreatedEvent.args.tokenAddress;
  console.log("ReceiptERC1155 contract created at:", receiptERC1155Address);

  await saveDeploymentInfo("ReceiptERC1155", receiptERC1155Address, [
    contractURI,
  ]);

  // Verify the ReceiptERC1155 contract
  await verifyContract(receiptERC1155Address, [contractURI]);

  // Deploy SimpleERC1155StorefrontFactory
  console.log("Deploying SimpleERC1155StorefrontFactory...");
  const SimpleERC1155StorefrontFactory = await hre.ethers.getContractFactory(
    "SimpleERC1155StorefrontFactory",
  );
  const seaportAddress = "0x0000000000000068F116a894984e2DB1123eB395"; // Seaport v1.6 address
  const minSettleTime = 7 * 24 * 60 * 60; // 1 week in seconds

  const simpleERC1155StorefrontFactory =
    await SimpleERC1155StorefrontFactory.deploy(
      seaportAddress,
      escrowFactoryAddress,
      minSettleTime,
    );

  await simpleERC1155StorefrontFactory.waitForDeployment();
  const simpleERC1155StorefrontFactoryAddress =
    await simpleERC1155StorefrontFactory.getAddress();
  console.log(
    "SimpleERC1155StorefrontFactory deployed to:",
    simpleERC1155StorefrontFactoryAddress,
  );

  await saveDeploymentInfo(
    "SimpleERC1155StorefrontFactory",
    simpleERC1155StorefrontFactoryAddress,
    [seaportAddress, escrowFactoryAddress, minSettleTime],
  );

  // Verify SimpleERC1155StorefrontFactory
  await verifyContract(simpleERC1155StorefrontFactoryAddress, [
    seaportAddress,
    escrowFactoryAddress,
    minSettleTime,
  ]);

  // Create a SimpleERC1155Storefront using the factory
  console.log("Creating a SimpleERC1155Storefront...");
  const designatedArbiter = deployer.address;
  const initialSettleDeadline = 3 * 7 * 24 * 60 * 60; // 3 weeks in seconds

  const createStorefrontTx =
    await simpleERC1155StorefrontFactory.createStorefront(
      designatedArbiter,
      receiptERC1155Address,
      initialSettleDeadline,
      {
        gasLimit: 6000000,
      },
    );
  console.log(
    "Create storefront transaction submitted:",
    createStorefrontTx.hash,
  );
  const createStorefrontReceipt = await createStorefrontTx.wait();

  const storefrontCreatedEvent = createStorefrontReceipt.logs.find(
    (log) => log.eventName === "StorefrontCreated",
  );
  const simpleERC1155StorefrontAddress = storefrontCreatedEvent.args.storefront;
  console.log(
    "SimpleERC1155Storefront created at:",
    simpleERC1155StorefrontAddress,
  );

  // Verify the SimpleERC1155Storefront contract
  await verifyContract(simpleERC1155StorefrontAddress, [
    seaportAddress,
    designatedArbiter,
    escrowFactoryAddress,
    receiptERC1155Address,
    minSettleTime,
    initialSettleDeadline,
  ]);

  // Save deployment info
  await saveDeploymentInfo(
    "SimpleERC1155Storefront",
    simpleERC1155StorefrontAddress,
    [
      seaportAddress,
      designatedArbiter,
      escrowFactoryAddress,
      receiptERC1155Address,
      minSettleTime,
      initialSettleDeadline,
    ],
  );
  const SimpleERC1155Storefront = await hre.ethers.getContractFactory(
    "SimpleERC1155Storefront",
  );
  const storefront = SimpleERC1155Storefront.attach(
    simpleERC1155StorefrontAddress,
  );
  const escrowAddress = await storefront.getEscrowContract();
  console.log("Escrow contract created at:", escrowAddress);

  // Save deployment info for escrow
  await saveDeploymentInfo("SimpleEscrow", escrowAddress, []);

  // Verify the escrow proxy
  await verifyProxy(escrowAddress, escrowImplementationAddress);

  // Save all deployment addresses to a summary file
  const deploymentSummary = {
    escrowFactory: escrowFactoryAddress,
    escrowImplementation: escrowImplementationAddress,
    receiptERC1155Factory: receiptERC1155FactoryAddress,
    receiptERC1155: receiptERC1155Address,
    simpleERC1155StorefrontFactory: simpleERC1155StorefrontFactoryAddress,
    simpleERC1155Storefront: simpleERC1155StorefrontAddress,
    escrowProxy: escrowAddress,
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployments/deployment-summary.json"),
    JSON.stringify(deploymentSummary, null, 2),
  );

  console.log(
    "Deployment summary saved to deployments/deployment-summary.json",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });
