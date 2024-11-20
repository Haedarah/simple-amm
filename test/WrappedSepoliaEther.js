const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("-- Wrapped Sepolia Ether Contract --", function () {

    let user;
    let wrappedSepoliaEtherContract;

    beforeEach(async () => {
        [weth_deployer, user] = await ethers.getSigners();

        // Deploy WrappedSepoliaEther Contract
        const WrappedSepoliaEther = await ethers.getContractFactory("WrappedSepoliaEther");
        wrappedSepoliaEtherContract = await WrappedSepoliaEther.connect(weth_deployer).deploy();
        // console.log(await ethers.provider.getBalance(user.address));
    });

    describe("# Sending ETH directly to the contract:", function () {
        it("Should provide the sender of ETH with an equal value of WETH", async function () {
            const userBalanceInETH0 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH0 = await wrappedSepoliaEtherContract.balanceOf(user.address);

            const firstTransactionValue = ethers.parseEther("1.0"); // 1 ETH
            const secondTransactionValue = ethers.parseEther("0.3"); // 0.3 ETH

            //First transaction:
            const tx1 = await user.sendTransaction({
                to: wrappedSepoliaEtherContract.target,
                value: firstTransactionValue,
            });
            const receipt1 = await tx1.wait();

            const gasUsed1 = receipt1.gasUsed;
            const gasPrice1 = tx1.gasPrice;
            const tx1Cost = gasUsed1 * gasPrice1;

            const userBalanceInETH1 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH1 = await wrappedSepoliaEtherContract.balanceOf(user.address);

            expect(userBalanceInETH1).to.equal(userBalanceInETH0 - firstTransactionValue - tx1Cost);
            expect(userBalanceInWETH1).to.equal(userBalanceInWETH0 + firstTransactionValue);

            //Second transaction:
            const tx2 = await user.sendTransaction({
                to: wrappedSepoliaEtherContract.target,
                value: secondTransactionValue,
            });
            const receipt2 = await tx2.wait();

            const gasUsed2 = receipt2.gasUsed;
            const gasPrice2 = tx2.gasPrice;
            const tx2Cost = gasUsed2 * gasPrice2;

            const userBalanceInETH2 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH2 = await wrappedSepoliaEtherContract.balanceOf(user.address);

            expect(userBalanceInETH2).to.equal(userBalanceInETH1 - secondTransactionValue - tx2Cost);
            expect(userBalanceInWETH2).to.equal(userBalanceInWETH1 + secondTransactionValue);
        });
    });

    describe("# Deposit:", function () {
        it("Should not mint WETH when sent with no value", async function () {
            const userBalanceInETH0 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH0 = await wrappedSepoliaEtherContract.balanceOf(user.address);

            const tx = await wrappedSepoliaEtherContract.connect(user).deposit();
            const receipt = await tx.wait();

            //Transaction cost
            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice;
            const txCost = gasUsed * gasPrice;

            const userBalanceInETH1 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH1 = await wrappedSepoliaEtherContract.balanceOf(user.address);

            expect(userBalanceInETH1).to.equal(userBalanceInETH0 - txCost);
            expect(userBalanceInWETH1).to.equal(userBalanceInWETH0);

        });

        it("Should mint WETH when sent with value", async function () {
            const userBalanceInETH0 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH0 = await wrappedSepoliaEtherContract.balanceOf(user.address);
            const transactionValue = ethers.parseEther("0.5"); // 1 ETH

            const tx = await wrappedSepoliaEtherContract.connect(user).deposit({ value: transactionValue });
            const receipt = await tx.wait();

            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice;
            const txCost = gasUsed * gasPrice;

            const userBalanceInETH1 = await ethers.provider.getBalance(user.address);
            const userBalanceInWETH1 = await wrappedSepoliaEtherContract.balanceOf(user.address);

            expect(userBalanceInETH1).to.equal(userBalanceInETH0 - transactionValue - txCost);
            expect(userBalanceInWETH1).to.equal(userBalanceInWETH0 + transactionValue);

        });
    });

    describe("# Withdraw:", function () {
        it("Should revert if there is no enough balance", async function () {
            const userBalanceInWETH0 = await wrappedSepoliaEtherContract.balanceOf(user.address);
            const withdrawalAmount = userBalanceInWETH0 + ethers.parseEther("0.1");

            await expect(
                wrappedSepoliaEtherContract.connect(user).withdraw(withdrawalAmount)
            ).to.be.revertedWith("Insufficient WETH balance");

            const userBalanceInWETH1 = await wrappedSepoliaEtherContract.balanceOf(user.address);
            expect(userBalanceInWETH1).to.equal(userBalanceInWETH0);

        });
    });

});