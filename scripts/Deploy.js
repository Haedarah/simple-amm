require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = require('ethers');

const logFilePath = path.join(__dirname, "deploy-log.txt");
const logStream = fs.createWriteStream(logFilePath, { flags: "w" }); //Overwrite on each run

//Override console.log to also write to the file
const originalConsoleLog = console.log;
console.log = (...args) => {
    originalConsoleLog(...args); // Print to the console
    logStream.write(args.join(" ") + "\n"); // Write to the file
};

async function main() {

    console.log("################{Deployer Information}################");

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Please set DEPLOYER_PRIVATE_KEY in your .env file");
    }

    const provider = new ethers.JsonRpcProvider(
        `https://base-sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`
    );

    const deployer = new ethers.Wallet(privateKey, provider);
    console.log("Deploying contracts with the account:", await deployer.getAddress());

    const balance = await provider.getBalance(await deployer.getAddress());
    console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

    if (balance == 0) {
        throw new Error("Deployer account has zero balance. Fund it with Sepolia ETH!");
    }

    console.log("################{Deployment}################");

    //Deploy WETH contract
    const WrappedSepoliaEther = await hre.ethers.getContractFactory("WrappedSepoliaEther");
    const wethContract = await WrappedSepoliaEther.connect(deployer).deploy();
    await wethContract.deploymentTransaction().wait(5); // Wait for 5 confirmations
    console.log("WrappedSepoliaEther is deployed to:", await wethContract.getAddress());

    //Deploy ChelseaToken
    const ChelseaToken = await hre.ethers.getContractFactory("ChelseaToken");
    const chelseaTokenContract = await ChelseaToken.connect(deployer).deploy();
    await chelseaTokenContract.deploymentTransaction().wait(5);
    console.log("ChelseaToken is deployed to:", await chelseaTokenContract.getAddress());

    //Deploy AMM Contract
    const AMM = await hre.ethers.getContractFactory("AMM");
    const ammContract = await AMM.connect(deployer).deploy(await chelseaTokenContract.getAddress(), await wethContract.getAddress());
    await ammContract.deploymentTransaction().wait(5);
    console.log("AMM is deployed to:", await ammContract.getAddress());

    console.log("################{Verification}################");

    console.log("Waiting for Etherscan to index the contracts...");
    await sleep(10000); // Wait for 10 seconds

    await hre.run("verify:verify", {
        address: await wethContract.getAddress()
    });
    console.log("WrappedSepoliaEther is verified!");

    await hre.run("verify:verify", {
        address: await chelseaTokenContract.getAddress()
    });
    console.log("ChelseasToken is verified!");

    await hre.run("verify:verify", {
        address: await ammContract.getAddress(),
        constructorArguments: [await chelseaTokenContract.getAddress(), await wethContract.getAddress()],
    });
    console.log("AMM is verified!");

    console.log("################################");

    logStream.end();
    originalConsoleLog("logs are saved to `scripts/deploy-log.txt`");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

//npx hardhat run scripts/Deploy.js --network sepolia
//npx hardhat run scripts/Deploy.js --network base_sepolia