const hre = require("hardhat");

async function main() {
  const PROXY_ADDRESS = "0x1d10E7716EF2617844F55ed87Ea3412787Ce2581";
  const ESCROW_FACTORY = "0xC6473DA101644c04f3db12E8F9B4168d1f73B2D6";

  const escrowFactory = await hre.ethers.getContractAt(
    "EscrowFactory",
    ESCROW_FACTORY
  );
  const implementationAddress = await escrowFactory.escrowImplementation();

  console.log("Implementation address:", implementationAddress);

  try {
    console.log(`Verifying proxy at ${PROXY_ADDRESS}...`);
    await hre.run("verify:verify", {
      address: PROXY_ADDRESS,
      constructorArguments: [],
      contract: "contracts/SimpleEscrow.sol:SimpleEscrow",
    });
    console.log("Verification complete");
  } catch (error) {
    console.error("Verification error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
