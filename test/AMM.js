const { expect } = require("chai");
const { ethers } = require("hardhat");
const sqrt = require('bigint-isqrt')

describe("-- AMM Contract --", function () {

    let user;
    let chelsea_owner;
    let wrappedSepoliaEtherContract;
    let chelseaContract;
    let ammContract;

    beforeEach(async () => {
        [weth_deployer, chelsea_owner, AMM_deployer, user] = await ethers.getSigners();

        //////////////////////////
        // Contracts Deployment //
        //////////////////////////

        // Deploy WrappedSepoliaEther Contract
        const WrappedSepoliaEther = await ethers.getContractFactory("WrappedSepoliaEther");
        wrappedSepoliaEtherContract = await WrappedSepoliaEther.connect(weth_deployer).deploy();

        // Deploy Chelsea Contract
        const ChelseaToken = await ethers.getContractFactory("ChelseaToken");
        chelseaContract = await ChelseaToken.connect(chelsea_owner).deploy();

        //Deploy AMM Contract
        const AMM = await ethers.getContractFactory("AMM");
        ammContract = await AMM.connect(AMM_deployer).deploy(chelseaContract.target, wrappedSepoliaEtherContract.target);

        //////////////////// 
        // Reset Balances //
        ////////////////////

        await network.provider.send("hardhat_setBalance", [
            chelsea_owner.address,
            "0x56BC75E2D63100000", //100 ETH in HEX
        ]);
        await network.provider.send("hardhat_setBalance", [
            user.address,
            "0x56BC75E2D63100000",
        ]);

        ////////////////////// 
        // Prepare personas //
        //////////////////////

        //user should have WETH in order to interact with the pair later:
        await user.sendTransaction({
            to: wrappedSepoliaEtherContract.target,
            value: ethers.parseEther("5"), // 5 ETH
        });

        //chelsea_owner should have WETH in order to create the pair later:
        await chelsea_owner.sendTransaction({
            to: wrappedSepoliaEtherContract.target,
            value: ethers.parseEther("10"),
        });

        //Before each test, we have the following:
        // - WETH, Chelsea, and AMM contracts deployed.
        // - user               :   5 WETH,     ~95 ETH,    0 CHE
        // - chelsea_owner   :   10 WETH,    ~90 ETH,    1,000,000 CHE
    });

    describe("Add Liquidity:", function () {
        it("Should revert if passed amountA <= 0 or passed amountB <= 0", async function () {
            let amountCHE = 0;
            let amountWETH = 0;

            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Invalid amounts");

            amountCHE = 1000000;
            amountWETH = 0;

            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Invalid amounts");

            amountCHE = 0;
            amountWETH = 1000000;

            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Invalid amounts");
        });

        it("Should revert if calculated liquidity <= 0 ", async function () {
            await network.provider.send("hardhat_setBalance", [
                chelsea_owner.address,
                "0x152D482B72CD3B740000", //100005 ETH in HEX
            ]);

            await chelsea_owner.sendTransaction({
                to: wrappedSepoliaEtherContract.target,
                value: ethers.parseEther("100001"),
            });

            let amountCHE = await chelseaContract.totalSupply() - BigInt("1");
            let amountWETH = ethers.parseEther("100000") - BigInt("1");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            // adding huge amount of tokens to the liquidity pool
            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            amountCHE = BigInt("1");
            amountWETH = BigInt("1");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            // trying to add a tiny amount of tokens to the liquidity pool
            await expect(
                ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH)
            ).to.be.revertedWith("Insufficient liquidity");
        });

        it("Should add liquidity", async function () {

            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner.address)).to.equal(BigInt("0"));

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner.address)).to.equal(sqrt(amountCHE * amountWETH));
        });

    });

    describe("Remove Liquidity:", function () {
        it("Should revert if passed liquidity <= 0", async function () {
            await expect(
                ammContract.connect(chelsea_owner).removeLiquidity(0)
            ).to.be.revertedWith("Invalid liquidity");
        });

        it("Should revert if passed liquidity >= sender liquidity balance", async function () {
            const amountCHE = await chelseaContract.totalSupply();
            const amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            const reverting_liquidity = await ammContract.balanceOf(chelsea_owner.address) + BigInt("1");

            await expect(
                ammContract.connect(chelsea_owner).removeLiquidity(reverting_liquidity)
            ).to.be.revertedWith("Invalid liquidity");
        });

        it("Should remove liquidity #1", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            const liquidityToBe = sqrt(amountCHE * amountWETH);

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe);

            await ammContract.connect(chelsea_owner).removeLiquidity(liquidityToBe);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(BigInt("0"));
        });

        it("Should remove liquidity #2", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            const liquidityToBe = sqrt(amountCHE * amountWETH);

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe);

            await ammContract.connect(chelsea_owner).removeLiquidity(liquidityToBe / BigInt("2"));

            expect(await ammContract.balanceOf(chelsea_owner)).to.equal(liquidityToBe - (liquidityToBe / BigInt("2")));
        });
    });

    describe("Swap B for A:", function () {
        it("Should revert if passed amountIn <= 0", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await expect(
                ammContract.connect(user).swapBForA(BigInt("0"))
            ).to.be.revertedWith("Invalid input amount");
        });

        it("Should revert if calculated amountOut <= 0", async function () {
            let amountCHE = ethers.parseEther("0.000000001");
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await expect(
                ammContract.connect(user).swapBForA(ethers.parseEther("0.000000000000000001"))
            ).to.be.revertedWith("Insufficient output amount");
        });

        it("Should swap B for A", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            expect(await chelseaContract.balanceOf(user.address)).to.equal(BigInt("0"));

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("0.005"));
            const amountToBeSent = ethers.parseEther("0.005") * BigInt("998") * await ammContract.reserveA() / (await ammContract.reserveB() * BigInt("1000") + ethers.parseEther("0.005") * BigInt("998"));
            await ammContract.connect(user).swapBForA(ethers.parseEther("0.005"));

            expect(await chelseaContract.balanceOf(user.address)).to.equal(amountToBeSent);

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("0.005"));
            await ammContract.connect(user).swapBForA(ethers.parseEther("0.005"));

            expect(await chelseaContract.balanceOf(user.address)).to.be.lessThan(amountToBeSent * BigInt("2"));
        });
    });

    describe("Swap A for B:", function () {
        it("Should revert if passed amountIn <= 0", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await expect(
                ammContract.connect(user).swapAForB(BigInt("0"))
            ).to.be.revertedWith("Invalid input amount");
        });

        it("Should revert if calculated amountOut <= 0", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("0.000000000000001");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await expect(
                ammContract.connect(user).swapAForB(ethers.parseEther("0.000000000000000001"))
            ).to.be.revertedWith("Insufficient output amount");
        });

        it("Should swap A for B", async function () {
            let amountCHE = await chelseaContract.totalSupply();
            let amountWETH = ethers.parseEther("10");

            await chelseaContract.connect(chelsea_owner).approve(ammContract.target, amountCHE);
            await wrappedSepoliaEtherContract.connect(chelsea_owner).approve(ammContract.target, amountWETH);

            await ammContract.connect(chelsea_owner).addLiquidity(amountCHE, amountWETH);

            await wrappedSepoliaEtherContract.connect(user).approve(ammContract.target, ethers.parseEther("0.01"));
            await ammContract.connect(user).swapBForA(ethers.parseEther("0.01"));

            const initialChelseaBalance = await chelseaContract.balanceOf(user.address);
            await chelseaContract.connect(user).approve(ammContract.target, initialChelseaBalance);
            const initialWETHBalance = await wrappedSepoliaEtherContract.balanceOf(user.address);
            const amountToBeSent = initialChelseaBalance / BigInt("2") * BigInt("998") * await ammContract.reserveB() / (await ammContract.reserveA() * BigInt("1000") + initialChelseaBalance / BigInt("2") * BigInt("998"));

            await ammContract.connect(user).swapAForB(initialChelseaBalance / BigInt("2"));
            const firstHalfPrice = await wrappedSepoliaEtherContract.balanceOf(user.address) - initialWETHBalance;

            expect(await wrappedSepoliaEtherContract.balanceOf(user.address)).to.equal(amountToBeSent + initialWETHBalance);

            await ammContract.connect(user).swapAForB(initialChelseaBalance - (initialChelseaBalance / BigInt("2")));
            const secondHalfPrice = await wrappedSepoliaEtherContract.balanceOf(user.address) - initialWETHBalance - firstHalfPrice;

            expect(firstHalfPrice).to.be.greaterThan(secondHalfPrice);
        });
    });
});